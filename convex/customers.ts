/**
 * Customer (= billing record) Convex functions. Sub-plan 08.
 *
 * `customers` is a 1:1 sidecar to a Clerk user. Until they hit Checkout,
 * the row may not exist; readers MUST tolerate that and fall back to "free".
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

const planLiteral = v.union(
  v.literal("free"),
  v.literal("pro"),
  v.literal("team"),
)

const statusLiteral = v.union(
  v.literal("none"),
  v.literal("trialing"),
  v.literal("active"),
  v.literal("past_due"),
  v.literal("canceled"),
  v.literal("incomplete"),
  v.literal("incomplete_expired"),
  v.literal("unpaid"),
  v.literal("paused"),
)

export const getByUser = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const row = await ctx.db
      .query("customers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique()
    if (row) return row
    // Synthetic free-tier default — NOT persisted. Persisting on read would
    // create races with the Stripe webhook, which is the only writer.
    return {
      _id: null,
      _creationTime: 0,
      userId,
      stripeCustomerId: undefined,
      stripeSubscriptionId: undefined,
      plan: "free" as const,
      subscriptionStatus: "none" as const,
      currentPeriodEnd: 0,
      seatsAllowed: 1,
      cancelAtPeriodEnd: false,
      updatedAt: 0,
    }
  },
})

export const getByStripeCustomer = query({
  args: { stripeCustomerId: v.string() },
  handler: async (ctx, { stripeCustomerId }) => {
    return await ctx.db
      .query("customers")
      .withIndex("by_stripe_customer", (q) =>
        q.eq("stripeCustomerId", stripeCustomerId),
      )
      .unique()
  },
})

/**
 * Upsert from a Stripe webhook event. Idempotent — calling twice with
 * identical args is a no-op beyond bumping `updatedAt`.
 */
export const upsertFromWebhook = mutation({
  args: {
    userId: v.string(),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.optional(v.string()),
    plan: planLiteral,
    subscriptionStatus: statusLiteral,
    currentPeriodEnd: v.number(),
    seatsAllowed: v.optional(v.number()),
    cancelAtPeriodEnd: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("customers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique()

    const seatsAllowed =
      args.seatsAllowed ?? (args.plan === "team" ? 5 : 1)
    const cancelAtPeriodEnd = args.cancelAtPeriodEnd ?? false

    if (existing) {
      await ctx.db.patch(existing._id, {
        stripeCustomerId: args.stripeCustomerId,
        stripeSubscriptionId: args.stripeSubscriptionId,
        plan: args.plan,
        subscriptionStatus: args.subscriptionStatus,
        currentPeriodEnd: args.currentPeriodEnd,
        seatsAllowed,
        cancelAtPeriodEnd,
        updatedAt: Date.now(),
      })
      return existing._id
    }
    return await ctx.db.insert("customers", {
      userId: args.userId,
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      plan: args.plan,
      subscriptionStatus: args.subscriptionStatus,
      currentPeriodEnd: args.currentPeriodEnd,
      seatsAllowed,
      cancelAtPeriodEnd,
      updatedAt: Date.now(),
    })
  },
})

/**
 * Subscription cancelled (Stripe `customer.subscription.deleted`). Downgrade
 * the user to free but RETAIN `stripeCustomerId` so they can use Customer
 * Portal to re-subscribe without re-entering payment details.
 */
export const markCanceled = mutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const existing = await ctx.db
      .query("customers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique()
    if (!existing) return
    await ctx.db.patch(existing._id, {
      plan: "free",
      subscriptionStatus: "canceled",
      stripeSubscriptionId: undefined,
      currentPeriodEnd: 0,
      cancelAtPeriodEnd: false,
      seatsAllowed: 1,
      updatedAt: Date.now(),
    })
  },
})

/**
 * Idempotent webhook log. Returns true iff the event is new (and was just
 * inserted). Returns false if we have already processed this event id.
 */
export const recordWebhookEvent = mutation({
  args: { eventId: v.string(), type: v.string() },
  handler: async (ctx, { eventId, type }) => {
    const existing = await ctx.db
      .query("webhook_events")
      .withIndex("by_event_id", (q) => q.eq("eventId", eventId))
      .unique()
    if (existing) return false
    await ctx.db.insert("webhook_events", {
      eventId,
      type,
      processedAt: Date.now(),
    })
    return true
  },
})
