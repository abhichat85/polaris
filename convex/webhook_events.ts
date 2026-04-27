/**
 * Webhook idempotency log (CONSTITUTION §13.1).
 *
 * Stripe retries on 5xx and on a 30-second timeout. Without idempotency,
 * a single subscription event could double-charge our state. The pattern:
 * before processing event X, check `isProcessed(X.id)` — if true, return
 * 200 immediately. After successful processing, call `markProcessed`.
 *
 * Pattern matches `convex/system.ts` — public `query`/`mutation` gated on
 * `internalKey` so HTTP-client callers (the webhook route) can reach them.
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

const requireInternalKey = (key: string) => {
  const expected = process.env.POLARIS_CONVEX_INTERNAL_KEY
  if (!expected) {
    throw new Error("POLARIS_CONVEX_INTERNAL_KEY is not configured")
  }
  if (key !== expected) {
    throw new Error("Invalid internal key")
  }
}

export const isProcessed = query({
  args: { internalKey: v.string(), eventId: v.string() },
  handler: async (ctx, { internalKey, eventId }) => {
    requireInternalKey(internalKey)
    const row = await ctx.db
      .query("webhook_events")
      .withIndex("by_event_id", (q) => q.eq("eventId", eventId))
      .first()
    return row !== null
  },
})

export const markProcessed = mutation({
  args: {
    internalKey: v.string(),
    eventId: v.string(),
    type: v.string(),
  },
  handler: async (ctx, { internalKey, eventId, type }) => {
    requireInternalKey(internalKey)
    const existing = await ctx.db
      .query("webhook_events")
      .withIndex("by_event_id", (q) => q.eq("eventId", eventId))
      .first()
    if (existing) return existing._id
    return await ctx.db.insert("webhook_events", {
      eventId,
      type,
      processedAt: Date.now(),
    })
  },
})
