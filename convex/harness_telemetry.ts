/**
 * harness_telemetry — canonical per-run telemetry record. One row per
 * `agent/run` event. Folds in pre-flight, in-flight, and post-flight
 * signals so dashboards can roll up quality + cost without joining
 * across multiple tables.
 *
 * Writes are internal-key gated (called by agent-loop after runner returns).
 * Reads are Clerk-auth gated (UI shows the run summary in dashboards).
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

const streamAlertValidator = v.object({
  type: v.string(),
  message: v.string(),
  charOffset: v.number(),
  timestamp: v.number(),
})

/**
 * Persist a telemetry record. Called by agent-loop in a fire-and-forget
 * step (failures here must not break the run).
 */
export const emit = mutation({
  args: {
    internalKey: v.string(),
    messageId: v.id("messages"),
    conversationId: v.id("conversations"),
    projectId: v.id("projects"),
    userId: v.string(),
    provider: v.string(),
    model: v.string(),
    attempt: v.number(),
    contractType: v.optional(v.string()),
    contractPassed: v.optional(v.boolean()),
    contractScore: v.optional(v.number()),
    evaluatorVerdict: v.optional(v.string()),
    iterations: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    durationMs: v.number(),
    streamAlerts: v.array(streamAlertValidator),
    steeringInjected: v.number(),
    healingAttempts: v.number(),
    hitlCheckpoints: v.number(),
    taskClass: v.optional(v.string()),
    /** D-052 / D-054 / D-055 / D-056 telemetry. */
    taskClassifierMethod: v.optional(v.string()),
    verificationLevels: v.optional(v.array(v.string())),
    compactionStrategiesApplied: v.optional(v.array(v.string())),
    compactionTokensSavedEstimate: v.optional(v.number()),
    hooksInvoked: v.optional(v.array(v.string())),
    hooksFailed: v.optional(v.array(v.string())),
    mcpCallsTotal: v.optional(v.number()),
    mcpServersConfigured: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.internalKey !== process.env.POLARIS_CONVEX_INTERNAL_KEY) {
      throw new Error("Unauthorized")
    }
    return await ctx.db.insert("harness_telemetry", {
      messageId: args.messageId,
      conversationId: args.conversationId,
      projectId: args.projectId,
      userId: args.userId,
      provider: args.provider,
      model: args.model,
      attempt: args.attempt,
      contractType: args.contractType,
      contractPassed: args.contractPassed,
      contractScore: args.contractScore,
      evaluatorVerdict: args.evaluatorVerdict,
      iterations: args.iterations,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      durationMs: args.durationMs,
      streamAlerts: args.streamAlerts,
      steeringInjected: args.steeringInjected,
      healingAttempts: args.healingAttempts,
      hitlCheckpoints: args.hitlCheckpoints,
      taskClass: args.taskClass,
      taskClassifierMethod: args.taskClassifierMethod,
      verificationLevels: args.verificationLevels,
      compactionStrategiesApplied: args.compactionStrategiesApplied,
      compactionTokensSavedEstimate: args.compactionTokensSavedEstimate,
      hooksInvoked: args.hooksInvoked,
      hooksFailed: args.hooksFailed,
      mcpCallsTotal: args.mcpCallsTotal,
      mcpServersConfigured: args.mcpServersConfigured,
      createdAt: Date.now(),
    })
  },
})

/** Get a user's recent telemetry records (used by Calibrator). */
export const getRecentForUserInternal = query({
  args: {
    internalKey: v.string(),
    userId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.internalKey !== process.env.POLARIS_CONVEX_INTERNAL_KEY) {
      throw new Error("Unauthorized")
    }
    const limit = args.limit ?? 50
    return await ctx.db
      .query("harness_telemetry")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit)
  },
})

/**
 * Return distinct userIds that have at least one telemetry row newer
 * than `sinceMs`. Used by the nightly preference-mining scheduler to
 * fan out per-user mining jobs only for recently-active users.
 *
 * Convex has no DISTINCT operator, so we collect rows and dedupe in
 * memory. The window is bounded (caller passes ~7 days) so the row
 * count stays manageable.
 */
export const getActiveUsersSinceInternal = query({
  args: {
    internalKey: v.string(),
    sinceMs: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.internalKey !== process.env.POLARIS_CONVEX_INTERNAL_KEY) {
      throw new Error("Unauthorized")
    }
    const rows = await ctx.db
      .query("harness_telemetry")
      .filter((q) => q.gte(q.field("createdAt"), args.sinceMs))
      .collect()
    const seen = new Set<string>()
    for (const r of rows) seen.add(r.userId)
    return [...seen]
  },
})

/** Get telemetry for a single message (UI surface). */
export const getByMessage = query({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Unauthorized")
    const rows = await ctx.db
      .query("harness_telemetry")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .collect()
    return rows[0] ?? null
  },
})
