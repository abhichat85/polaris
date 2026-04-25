/**
 * Streaming-friendly message mutations for AgentRunner.
 * Authority: sub-plan 01 §14, CONSTITUTION §10 (Convex source of truth).
 *
 * Distinct from `messages.ts` because the AgentRunner uses internal-key auth
 * (via Inngest) and needs append-style semantics for streaming. The legacy
 * mutations in `system.ts` are preserved for the existing UI.
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

const validateInternalKey = (key: string) => {
  const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY
  if (!internalKey) {
    throw new Error("POLARIS_CONVEX_INTERNAL_KEY is not configured")
  }
  if (key !== internalKey) {
    throw new Error("Invalid internal key")
  }
}

export const appendText = mutation({
  args: {
    internalKey: v.string(),
    messageId: v.id("messages"),
    delta: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey)
    const message = await ctx.db.get(args.messageId)
    if (!message) throw new Error("Message not found")
    const next = (message.streamingContent ?? "") + args.delta
    await ctx.db.patch(args.messageId, {
      streamingContent: next,
      status: "streaming" as const,
    })
  },
})

export const appendToolCall = mutation({
  args: {
    internalKey: v.string(),
    messageId: v.id("messages"),
    toolCall: v.object({
      id: v.string(),
      name: v.string(),
      input: v.any(),
    }),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey)
    const message = await ctx.db.get(args.messageId)
    if (!message) throw new Error("Message not found")
    const existing = message.toolCalls ?? []
    await ctx.db.patch(args.messageId, {
      toolCalls: [
        ...existing,
        {
          id: args.toolCall.id,
          name: args.toolCall.name,
          args: args.toolCall.input,
          status: "running" as const,
        },
      ],
    })
  },
})

export const appendToolResult = mutation({
  args: {
    internalKey: v.string(),
    messageId: v.id("messages"),
    toolCallId: v.string(),
    ok: v.boolean(),
    data: v.optional(v.any()),
    error: v.optional(v.string()),
    errorCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey)
    const message = await ctx.db.get(args.messageId)
    if (!message) throw new Error("Message not found")
    const calls = message.toolCalls ?? []
    const next = calls.map((c) =>
      c.id === args.toolCallId
        ? {
            ...c,
            result: args.ok
              ? args.data
              : { error: args.error, errorCode: args.errorCode },
            status: (args.ok ? "completed" : "error") as "completed" | "error",
          }
        : c,
    )
    await ctx.db.patch(args.messageId, { toolCalls: next })
  },
})

export const markDone = mutation({
  args: {
    internalKey: v.string(),
    messageId: v.id("messages"),
    status: v.union(
      v.literal("completed"),
      v.literal("error"),
      v.literal("cancelled"),
    ),
    errorMessage: v.optional(v.string()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey)
    const message = await ctx.db.get(args.messageId)
    if (!message) throw new Error("Message not found")
    // Promote streamingContent → content on completion.
    const content =
      args.status === "completed" && message.streamingContent
        ? message.streamingContent
        : message.content
    await ctx.db.patch(args.messageId, {
      status: args.status,
      content,
      errorMessage: args.errorMessage,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
    })
  },
})

export const isCancelled = query({
  args: { internalKey: v.string(), messageId: v.id("messages") },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey)
    const message = await ctx.db.get(args.messageId)
    return message?.status === "cancelled"
  },
})
