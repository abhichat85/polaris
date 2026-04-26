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

interface ClerkUserCreatedEvent {
  type: "user.created"
  data: {
    id: string
    email_addresses: Array<{ email_address: string; id: string }>
    primary_email_address_id?: string | null
  }
}

type ClerkEvent = ClerkUserCreatedEvent | { type: string; data: unknown }

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

  if (event.type !== "user.created") {
    // Acknowledge other event types so Clerk doesn't keep retrying.
    return NextResponse.json({ ok: true, ignored: event.type })
  }

  const data = event.data as ClerkUserCreatedEvent["data"]
  const primary = data.email_addresses.find(
    (e) => e.id === data.primary_email_address_id,
  ) ?? data.email_addresses[0]
  const email = primary?.email_address
  if (!email) {
    return NextResponse.json({ ok: true, note: "no_email" })
  }

  const decision = checkAllowlist(email, readAllowlistFromEnv())
  if (decision.admit) {
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
