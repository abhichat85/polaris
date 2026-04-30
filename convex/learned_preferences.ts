/**
 * learned_preferences — user-scoped preferences mined nightly from
 * `response_feedback` + edit history. Read-only at runtime by the
 * PreferenceInjector.
 *
 * Writes are internal-key gated (called by the nightly Inngest job).
 * Reads are Clerk-auth gated for the user's own preferences.
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

/**
 * Upsert a learned preference. Called by the nightly mining job.
 */
export const upsertInternal = mutation({
  args: {
    internalKey: v.string(),
    userId: v.string(),
    key: v.string(),
    value: v.any(),
    confidence: v.number(),
    sampleSize: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.internalKey !== process.env.POLARIS_CONVEX_INTERNAL_KEY) {
      throw new Error("Unauthorized")
    }
    const existing = await ctx.db
      .query("learned_preferences")
      .withIndex("by_user_key", (q) =>
        q.eq("userId", args.userId).eq("key", args.key),
      )
      .first()

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        confidence: args.confidence,
        sampleSize: args.sampleSize,
        updatedAt: Date.now(),
      })
      return existing._id
    }

    return await ctx.db.insert("learned_preferences", {
      userId: args.userId,
      key: args.key,
      value: args.value,
      confidence: args.confidence,
      sampleSize: args.sampleSize,
      updatedAt: Date.now(),
    })
  },
})

/** Get all preferences for a user (used by PreferenceInjector at runtime). */
export const getForUserInternal = query({
  args: {
    internalKey: v.string(),
    userId: v.string(),
    minConfidence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.internalKey !== process.env.POLARIS_CONVEX_INTERNAL_KEY) {
      throw new Error("Unauthorized")
    }
    const minConfidence = args.minConfidence ?? 0.3
    const rows = await ctx.db
      .query("learned_preferences")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect()
    return rows.filter((r) => r.confidence >= minConfidence)
  },
})

/** Clerk-auth view of own preferences (UI surface). */
export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []
    return await ctx.db
      .query("learned_preferences")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect()
  },
})
