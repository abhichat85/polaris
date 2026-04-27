/**
 * Clerk webhook receiver. Authority: sub-plan 10 Task 3.
 *
 * Handles `user.created` events:
 *   1. Verify Svix signature against `CLERK_WEBHOOK_SECRET`.
 *   2. If the email is on the allowlist → no-op (Clerk has already created
 *      the user; they pass through normal sign-in next visit).
 *   3. Else, enroll on the waitlist and (optionally) revoke the user.
 *
 * Configure in Clerk Dashboard → Webhooks → Add endpoint:
 *   URL:    https://build.praxiomai.xyz/api/webhooks/clerk
 *   Events: user.created  (extend later as needed)
 *   Secret: copy to CLERK_WEBHOOK_SECRET
 */

import { NextResponse, type NextRequest } from "next/server"
import { Webhook } from "svix"
import { convex } from "@/lib/convex-client"
import { api } from "../../../../../convex/_generated/api"
import { checkAllowlist, readAllowlistFromEnv } from "@/lib/clerk/allowlist"

interface ClerkUserData {
  id: string
  email_addresses: Array<{ email_address: string; id: string }>
  primary_email_address_id?: string | null
  first_name?: string | null
  last_name?: string | null
  image_url?: string | null
}

type ClerkEvent =
  | { type: "user.created"; data: ClerkUserData }
  | { type: "user.updated"; data: ClerkUserData }
  | { type: string; data: unknown }

export async function POST(req: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: "webhook_not_configured" },
      { status: 503 },
    )
  }

  // Svix headers — required for signature verification.
  const svixId = req.headers.get("svix-id")
  const svixTs = req.headers.get("svix-timestamp")
  const svixSig = req.headers.get("svix-signature")
  if (!svixId || !svixTs || !svixSig) {
    return NextResponse.json({ error: "missing_svix_headers" }, { status: 400 })
  }

  const raw = await req.text()
  let event: ClerkEvent
  try {
    const wh = new Webhook(secret)
    event = wh.verify(raw, {
      "svix-id": svixId,
      "svix-timestamp": svixTs,
      "svix-signature": svixSig,
    }) as ClerkEvent
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 })
  }

  // D-020 — populate clerk_user_cache on every user.created and user.updated.
  // This unlocks workspace member email/name display without an HTTP roundtrip
  // per row. Best-effort — we still ack the webhook on failure.
  if (event.type === "user.created" || event.type === "user.updated") {
    const data = event.data as ClerkUserData
    const primary = data.email_addresses.find(
      (e) => e.id === data.primary_email_address_id,
    ) ?? data.email_addresses[0]
    const email = primary?.email_address?.toLowerCase()
    const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY

    if (email && internalKey) {
      try {
        await convex.mutation(api.clerk_users.upsertFromWebhook, {
          internalKey,
          userId: data.id,
          email,
          firstName: data.first_name ?? undefined,
          lastName: data.last_name ?? undefined,
          imageUrl: data.image_url ?? undefined,
        })
      } catch {
        // Best-effort.
      }
    }
  }

  if (event.type !== "user.created") {
    // Acknowledge other event types so Clerk doesn't keep retrying.
    return NextResponse.json({ ok: true, ignored: event.type })
  }

  const data = event.data as ClerkUserData
  const primary = data.email_addresses.find(
    (e) => e.id === data.primary_email_address_id,
  ) ?? data.email_addresses[0]
  const email = primary?.email_address
  if (!email) {
    return NextResponse.json({ ok: true, note: "no_email" })
  }

  const decision = checkAllowlist(email, readAllowlistFromEnv())
  if (decision.admit) {
    // D-020 — auto-create the personal workspace for admitted users so
    // the dashboard works on first sign-in.
    const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY
    if (internalKey) {
      try {
        await convex.mutation(api.workspaces.createPersonal, {
          internalKey,
          userId: data.id,
          email: email.toLowerCase(),
        })
      } catch {
        // Best-effort.
      }
    }
    return NextResponse.json({ ok: true, admitted: true, reason: decision.reason })
  }

  // Not on the allowlist → enroll on the waitlist.
  try {
    await convex.mutation(api.waitlist.enroll, { email })
  } catch (e) {
    // Best-effort; we still ack the webhook so Clerk doesn't retry forever.
    return NextResponse.json({
      ok: true,
      admitted: false,
      enrollError: e instanceof Error ? e.message : "unknown",
    })
  }

  return NextResponse.json({ ok: true, admitted: false, reason: decision.reason })
}
