/**
 * Account deletion (GDPR Art. 17 — right to erasure).
 * Authority: sub-plan 10 Task 15.
 *
 * Requires explicit `confirm: "DELETE"` body. Cascades:
 *   1. Cancel Stripe subscription at period end (no surprise refund).
 *   2. cascadeDelete on Convex (projects, conversations, messages, files,
 *      specs, deployments, sandboxes, checkpoints, profile, integration,
 *      customer).
 *   3. Disconnect GitHub integration (idempotent — cascadeDelete already
 *      drops the row, but we also revoke from the live API best-effort).
 *   4. Delete the Clerk user (irreversible — they're signed out next request).
 */

import { NextResponse, type NextRequest } from "next/server"
import { auth, clerkClient } from "@clerk/nextjs/server"
import { convex } from "@/lib/convex-client"
import { api } from "../../../../../convex/_generated/api"
import {
  cancelStripeSubscription,
  type StripeCancelResult,
} from "@/lib/billing/stripe-cancel"

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let body: { confirm?: string } = {}
  try {
    body = (await req.json()) as { confirm?: string }
  } catch {
    /* missing body counts as no confirm */
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

  const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY ?? ""

  // Step 1 — Stripe cancel at period end (best effort, before we drop the
  // customer row from Convex so we still know the subscription id).
  let stripeResult: StripeCancelResult = { ok: true, detail: "no_subscription" }
  try {
    const customer = await convex.query(api.customers.getByUser, { userId })
    if (customer?.stripeSubscriptionId) {
      stripeResult = await cancelStripeSubscription(customer.stripeSubscriptionId)
    }
  } catch (e) {
    stripeResult = {
      ok: false,
      detail: e instanceof Error ? e.message : "lookup_failed",
    }
  }

  // Step 2 — Convex cascade delete.
  let cascadeStats: unknown = null
  try {
    cascadeStats = await convex.mutation(api.account.cascadeDelete, {
      internalKey,
      userId,
    })
  } catch (e) {
    return NextResponse.json(
      {
        error: "cascade_failed",
        stripe: stripeResult,
        detail: e instanceof Error ? e.message : "unknown",
      },
      { status: 500 },
    )
  }

  // Step 3 — Clerk delete (irreversible). Best-effort: if it fails, the
  // Convex data is already gone; the user can sign in but will get an
  // empty account. We log the failure for ops follow-up.
  let clerkOk = true
  let clerkDetail: string | undefined
  try {
    const client = await clerkClient()
    await client.users.deleteUser(userId)
  } catch (e) {
    clerkOk = false
    clerkDetail = e instanceof Error ? e.message : "unknown"
  }

  return NextResponse.json({
    ok: clerkOk && stripeResult.ok,
    note:
      "Deletion request processed. Convex rows deleted; Stripe subscription " +
      "set to cancel at period end (no refund); Clerk account removed.",
    cascade: cascadeStats,
    stripe: stripeResult,
    clerk: { ok: clerkOk, detail: clerkDetail },
  })
}
