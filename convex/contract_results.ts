/**
 * contract_results — per-run quality evaluation produced by
 * `Contract.evaluate()` after the agent loop completes.
 *
 * Writes are internal-key gated (called by Inngest agent-loop).
 * Reads are Clerk-auth gated (UI shows the verdict in the QualityBadge).
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

const constraintResultValidator = v.object({
  constraintId: v.string(),
  passed: v.boolean(),
  detail: v.optional(v.string()),
})

/**
 * Persist a contract evaluation result. Called by agent-loop after the
 * runner stops emitting tool calls.
 */
export const create = mutation({
  args: {
    internalKey: v.string(),
    messageId: v.id("messages"),
    conversationId: v.id("conversations"),
    projectId: v.id("projects"),
    contractType: v.string(),
    passed: v.boolean(),
    score: v.number(),
    constraintResults: v.array(constraintResultValidator),
    issues: v.array(v.string()),
    attemptIndex: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.internalKey !== process.env.POLARIS_CONVEX_INTERNAL_KEY) {
      throw new Error("Unauthorized")
    }
    return await ctx.db.insert("contract_results", {
      messageId: args.messageId,
      conversationId: args.conversationId,
      projectId: args.projectId,
      contractType: args.contractType,
      passed: args.passed,
      score: args.score,
      constraintResults: args.constraintResults,
      issues: args.issues,
      attemptIndex: args.attemptIndex,
      createdAt: Date.now(),
    })
  },
})

/** Get the latest contract result for a message (UI: QualityBadge). */
export const getByMessage = query({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Unauthorized")
    const rows = await ctx.db
      .query("contract_results")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .collect()
    if (rows.length === 0) return null
    // Highest attemptIndex = latest
    return rows.reduce((latest, r) =>
      r.attemptIndex > latest.attemptIndex ? r : latest,
    )
  },
})

/** Stats for a project's contract pass rate (used by Calibrator). */
export const getProjectStatsInternal = query({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    sinceMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.internalKey !== process.env.POLARIS_CONVEX_INTERNAL_KEY) {
      throw new Error("Unauthorized")
    }
    const since = args.sinceMs ?? 0
    const rows = await ctx.db
      .query("contract_results")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) => q.gte(q.field("createdAt"), since))
      .collect()
    if (rows.length === 0) {
      return { count: 0, passRate: 0, averageScore: 0 }
    }
    const passed = rows.filter((r) => r.passed).length
    const sumScore = rows.reduce((s, r) => s + r.score, 0)
    return {
      count: rows.length,
      passRate: passed / rows.length,
      averageScore: sumScore / rows.length,
    }
  },
})
