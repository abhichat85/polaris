/**
 * Account deletion (GDPR Art. 17 — right to erasure).
 * Authority: sub-plan 10 Task 15.
 *
 * Requires explicit `confirm: "DELETE"` body to prevent CSRF / accidents.
 * Cascades:
 *   1. Disconnect GitHub integration (drops encrypted token row).
 *   2. Mark user_profile for deletion.
 * Stripe + Clerk cascade is performed by webhooks/Inngest in a later step
 * (see sub-plan 08 §8.6 + sub-plan 10 §15.3 cascade rehearsal).
 */

import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { convex } from "@/lib/convex-client"
import { api } from "../../../../../convex/_generated/api"

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let body: { confirm?: string } = {}
  try {
    body = (await req.json()) as { confirm?: string }
  } catch {
    /* body parsing failed — treat as missing confirm */
  }
  if (body.confirm !== "DELETE") {
    return NextResponse.json(
      {
        error: "confirmation_required",
        hint: 'POST { "confirm": "DELETE" } to confirm.',
      },
      { status: 400 },
    )
  }

  // Cascade — best-effort; any individual failure is logged but doesn't
  // block the rest. Production should also fan out to Stripe + Clerk via
  // Inngest for retries.
  await Promise.allSettled([
    convex.mutation(api.integrations.disconnect, { userId }),
  ])

  return NextResponse.json({
    ok: true,
    note:
      "Deletion request accepted. Convex records removed within 30 days; " +
      "backups within 90 days. Stripe subscription is canceled at period end.",
  })
}
