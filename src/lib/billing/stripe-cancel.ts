/**
 * Cancel a user's Stripe subscription at period end. Authority: sub-plan 10
 * Task 15. Returns true if a cancellation was issued (or none was needed).
 *
 * Server-only — requires `STRIPE_SECRET_KEY`. We dynamically import `stripe`
 * so this file is safe to reference from edge code that never invokes it.
 */

import "server-only"

export interface StripeCancelResult {
  ok: boolean
  detail?: string
  subscriptionId?: string
}

export async function cancelStripeSubscription(
  stripeSubscriptionId: string | undefined | null,
): Promise<StripeCancelResult> {
  if (!stripeSubscriptionId) return { ok: true, detail: "no_subscription" }

  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) return { ok: false, detail: "stripe_not_configured" }

  try {
    // Dynamic import — keeps stripe out of the edge bundle.
    const StripeMod = (await import("stripe")) as unknown as {
      default: new (k: string, opts?: Record<string, unknown>) => {
        subscriptions: {
          update: (
            id: string,
            params: { cancel_at_period_end: boolean },
          ) => Promise<{ id: string }>
        }
      }
    }
    const stripe = new StripeMod.default(secret, { apiVersion: "2025-03-31.basil" })
    const updated = await stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: true,
    })
    return { ok: true, subscriptionId: updated.id }
  } catch (e) {
    return {
      ok: false,
      detail: e instanceof Error ? e.message : "unknown",
    }
  }
}
