/**
 * response_feedback — per-message thumbs up/down + optional comment.
 *
 * Writes are Clerk-auth gated (only the message's owner can rate).
 * Reads (internal) feed the nightly preference-mining job.
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

/**
 * Submit feedback for an assistant message. The user must be authenticated.
 * One feedback row per (message, user) — re-submits update in place.
 */
export const submit = mutation({
  args: {
    messageId: v.id("messages"),
    rating: v.union(v.literal("up"), v.literal("down")),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Unauthorized")
    const userId = identity.subject

    const message = await ctx.db.get(args.messageId)
    if (!message) throw new Error("Message not found")

    // Look for existing feedback from this user on this message
    const existing = await ctx.db
      .query("response_feedback")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .filter((q) => q.eq(q.field("userId"), userId))
      .first()

    if (existing) {
      await ctx.db.patch(existing._id, {
        rating: args.rating,
        comment: args.comment,
      })
      return existing._id
    }

    return await ctx.db.insert("response_feedback", {
      messageId: args.messageId,
      conversationId: message.conversationId,
      userId,
      rating: args.rating,
      comment: args.comment,
      createdAt: Date.now(),
    })
  },
})

/** Get the current user's feedback for a message (UI: thumbs state). */
export const getMine = query({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    const userId = identity.subject
    return await ctx.db
      .query("response_feedback")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .filter((q) => q.eq(q.field("userId"), userId))
      .first()
  },
})

/**
 * Get all feedback for a user since a timestamp. Used by the nightly
 * preference-mining job.
 */
export const getRecentForUserInternal = query({
  args: {
    internalKey: v.string(),
    userId: v.string(),
    sinceMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.internalKey !== process.env.POLARIS_CONVEX_INTERNAL_KEY) {
      throw new Error("Unauthorized")
    }
    const since = args.sinceMs ?? 0
    return await ctx.db
      .query("response_feedback")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.gte(q.field("createdAt"), since))
      .collect()
  },
})
