/**
 * stripe-cancel tests. Authority: sub-plan 10 Task 15.
 *
 * Mocks the dynamically-imported `stripe` module so the test never hits the
 * network. Verifies the contract — null → ok no-op, missing key → ok=false,
 * happy path → cancel_at_period_end.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// `server-only` throws when imported in a non-RSC context — stub it here.
vi.mock("server-only", () => ({}))

const update = vi.fn()
vi.mock("stripe", () => {
  class FakeStripe {
    subscriptions = { update }
  }
  return { default: FakeStripe }
})

import { cancelStripeSubscription } from "@/lib/billing/stripe-cancel"

describe("cancelStripeSubscription", () => {
  const original = process.env.STRIPE_SECRET_KEY

  beforeEach(() => {
    update.mockReset()
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy"
  })

  afterEach(() => {
    if (original === undefined) delete process.env.STRIPE_SECRET_KEY
    else process.env.STRIPE_SECRET_KEY = original
  })

  it("no-ops when there's no subscription", async () => {
    const r = await cancelStripeSubscription(undefined)
    expect(r).toEqual({ ok: true, detail: "no_subscription" })
    expect(update).not.toHaveBeenCalled()
  })

  it("returns ok=false when STRIPE_SECRET_KEY is missing", async () => {
    delete process.env.STRIPE_SECRET_KEY
    const r = await cancelStripeSubscription("sub_x")
    expect(r.ok).toBe(false)
    expect(r.detail).toBe("stripe_not_configured")
  })

  it("calls subscriptions.update with cancel_at_period_end=true", async () => {
    update.mockResolvedValue({ id: "sub_x" })
    const r = await cancelStripeSubscription("sub_x")
    expect(r.ok).toBe(true)
    expect(r.subscriptionId).toBe("sub_x")
    expect(update).toHaveBeenCalledWith("sub_x", {
      cancel_at_period_end: true,
    })
  })

  it("surfaces underlying errors as ok=false with detail", async () => {
    update.mockRejectedValue(new Error("rate_limited"))
    const r = await cancelStripeSubscription("sub_x")
    expect(r.ok).toBe(false)
    expect(r.detail).toBe("rate_limited")
  })
})
