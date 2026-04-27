/**
 * D-033 — steering queue (pi-mono port).
 *
 * Public mutation `enqueue` is auth-bound (the user is the only one who
 * can steer their own runs). Internal-key-gated query `nextPending` and
 * mutation `markConsumed` are called from the AgentRunner between
 * iterations.
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { verifyAuth } from "./auth"

const requireInternalKey = (key: string) => {
  const expected = process.env.POLARIS_CONVEX_INTERNAL_KEY
  if (!expected) throw new Error("POLARIS_CONVEX_INTERNAL_KEY is not configured")
  if (key !== expected) throw new Error("Invalid internal key")
}

export const enqueue = mutation({
  args: {
    messageId: v.id("messages"),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    await verifyAuth(ctx)
    if (args.text.trim().length === 0) {
      throw new Error("Steering message cannot be empty")
    }
    return await ctx.db.insert("steering_queue", {
      messageId: args.messageId,
      text: args.text.trim(),
      createdAt: Date.now(),
      consumed: false,
    })
  },
})

export const nextPending = query({
  args: { internalKey: v.string(), messageId: v.id("messages") },
  handler: async (ctx, { internalKey, messageId }) => {
    requireInternalKey(internalKey)
    return await ctx.db
      .query("steering_queue")
      .withIndex("by_message_consumed", (q) =>
        q.eq("messageId", messageId).eq("consumed", false),
      )
      .order("asc")
      .first()
  },
})

export const markConsumed = mutation({
  args: { internalKey: v.string(), id: v.id("steering_queue") },
  handler: async (ctx, { internalKey, id }) => {
    requireInternalKey(internalKey)
    await ctx.db.patch(id, { consumed: true })
  },
})

export const listForMessage = query({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    return await ctx.db
      .query("steering_queue")
      .withIndex("by_message", (q) => q.eq("messageId", messageId))
      .order("asc")
      .collect()
  },
})
