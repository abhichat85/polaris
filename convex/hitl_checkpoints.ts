/**
 * HITL (Human-in-the-Loop) checkpoint mutations and queries.
 *
 * Authority: HITL sub-plan. The agent runner creates checkpoints when a
 * trigger fires (destructive tool, sensitive path, scope creep, manual).
 * The UI resolves them via Clerk-authenticated mutations.
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

/**
 * Create a new HITL checkpoint. Called by the agent runner when a
 * trigger fires. Returns the checkpoint ID.
 */
export const create = mutation({
  args: {
    internalKey: v.string(),
    runId: v.string(),
    projectId: v.id("projects"),
    triggerType: v.string(),
    triggerReason: v.string(),
    toolName: v.optional(v.string()),
    path: v.optional(v.string()),
    proposedAction: v.string(),
    timeoutMs: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.internalKey !== process.env.POLARIS_CONVEX_INTERNAL_KEY) {
      throw new Error("Unauthorized")
    }
    return await ctx.db.insert("hitl_checkpoints", {
      runId: args.runId,
      projectId: args.projectId,
      status: "PENDING",
      triggerType: args.triggerType,
      triggerReason: args.triggerReason,
      toolName: args.toolName,
      path: args.path,
      proposedAction: args.proposedAction,
      timeoutMs: args.timeoutMs,
      resolvedAt: undefined,
      modification: undefined,
    })
  },
})

/**
 * Resolve a HITL checkpoint. Called by the UI when the user makes a decision.
 * Auth-gated (Clerk) — the user must be authenticated.
 */
export const resolve = mutation({
  args: {
    checkpointId: v.id("hitl_checkpoints"),
    resolution: v.union(
      v.literal("APPROVED"),
      v.literal("REJECTED"),
      v.literal("MODIFIED"),
    ),
    modification: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Unauthorized")

    const checkpoint = await ctx.db.get(args.checkpointId)
    if (!checkpoint) throw new Error("Checkpoint not found")
    if (checkpoint.status !== "PENDING") {
      throw new Error(`Checkpoint already resolved: ${checkpoint.status}`)
    }
    if (args.resolution === "MODIFIED" && !args.modification) {
      throw new Error("Modification text required for MODIFIED resolution")
    }

    await ctx.db.patch(args.checkpointId, {
      status: args.resolution,
      modification:
        args.resolution === "MODIFIED" ? args.modification : undefined,
      resolvedAt: Date.now(),
    })
  },
})

/**
 * Get pending checkpoints for a run. Used by the agent runner to check
 * if it needs to wait for user approval.
 */
export const getPendingForRun = query({
  args: {
    internalKey: v.string(),
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.internalKey !== process.env.POLARIS_CONVEX_INTERNAL_KEY) {
      throw new Error("Unauthorized")
    }
    return await ctx.db
      .query("hitl_checkpoints")
      .withIndex("by_status", (q) =>
        q.eq("runId", args.runId).eq("status", "PENDING"),
      )
      .collect()
  },
})

/**
 * Get all checkpoints for a run. Used by the UI to show checkpoint history.
 */
export const getForRun = query({
  args: {
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Unauthorized")
    return await ctx.db
      .query("hitl_checkpoints")
      .withIndex("by_runId", (q) => q.eq("runId", args.runId))
      .collect()
  },
})
