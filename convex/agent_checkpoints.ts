/**
 * Agent checkpoint persistence. Authority: CONSTITUTION §12.3, plan 01 §17.
 *
 * Saved after every iteration. Used by Inngest retries: if `processMessage`
 * fails partway through, the next attempt loads the most recent checkpoint and
 * resumes from there rather than re-running everything.
 *
 * Per D-016 the messages array is typed (no JSON-string antipattern). The
 * shape mirrors src/lib/agents/sink.ts AgentCheckpoint.messages.
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

const messageBlockValidator = v.object({
  type: v.union(
    v.literal("text"),
    v.literal("tool_use"),
    v.literal("tool_result"),
  ),
  text: v.optional(v.string()),
  id: v.optional(v.string()),
  name: v.optional(v.string()),
  input: v.optional(v.any()),
  toolUseId: v.optional(v.string()),
  content: v.optional(v.string()),
  isError: v.optional(v.boolean()),
})

const checkpointMessageValidator = v.object({
  role: v.union(
    v.literal("system"),
    v.literal("user"),
    v.literal("assistant"),
    v.literal("tool"),
  ),
  contentText: v.optional(v.string()),
  blocks: v.optional(v.array(messageBlockValidator)),
})

export const save = mutation({
  args: {
    messageId: v.id("messages"),
    projectId: v.id("projects"),
    messages: v.array(checkpointMessageValidator),
    iterationCount: v.number(),
    totalInputTokens: v.number(),
    totalOutputTokens: v.number(),
    lastToolCallName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agent_checkpoints")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .first()

    const data = {
      messageId: args.messageId,
      projectId: args.projectId,
      messages: args.messages,
      iterationCount: args.iterationCount,
      totalInputTokens: args.totalInputTokens,
      totalOutputTokens: args.totalOutputTokens,
      lastToolCallName: args.lastToolCallName,
      savedAt: Date.now(),
    }

    if (existing) {
      await ctx.db.patch(existing._id, data)
    } else {
      await ctx.db.insert("agent_checkpoints", data)
    }
  },
})

export const get = query({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agent_checkpoints")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .first()
  },
})

export const clear = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agent_checkpoints")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .first()
    if (existing) await ctx.db.delete(existing._id)
  },
})
