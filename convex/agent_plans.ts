/**
 * Structured plan storage — Phase 3.3.
 *
 * Replaces the file-only handoff via /docs/plan.md (which is now a
 * generated read-only view). The planner subagent populates this
 * directly; the executor reads + updates it through dedicated tools.
 *
 * Two tables:
 *   - plans: per-project feature list (one row per project)
 *   - plan_clarifications: round-trip channel between executor and
 *     planner subagent during a run
 *
 * NOTE: this module is named `agent_plans` to avoid colliding with the
 * existing `plans` table (billing-tier limits) which has a `plans.ts`
 * Convex module. Same table name is fine — Convex tables and module
 * filenames are independent — but we want the API surface
 * `api.agent_plans.*` rather than `api.plans.*` (which is taken).
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import type { Id } from "./_generated/dataModel"

const validateInternalKey = (key: string) => {
  const expected = process.env.POLARIS_CONVEX_INTERNAL_KEY
  if (!expected) throw new Error("POLARIS_CONVEX_INTERNAL_KEY is not configured")
  if (key !== expected) throw new Error("Invalid internal key")
}

const featureStatusValidator = v.union(
  v.literal("pending"),
  v.literal("in_progress"),
  v.literal("done"),
  v.literal("blocked"),
)

const featureValidator = v.object({
  id: v.string(),
  title: v.string(),
  description: v.string(),
  acceptanceCriteria: v.array(v.string()),
  dependencies: v.array(v.string()),
  status: featureStatusValidator,
  blockers: v.optional(v.array(v.string())),
  updatedAt: v.optional(v.number()),
})

/* ─────────────────────────────────────────────────────────────────────────
 * Plans
 * ───────────────────────────────────────────────────────────────────── */

export const getByProjectInternal = query({
  args: { internalKey: v.string(), projectId: v.id("projects") },
  handler: async (ctx, { internalKey, projectId }) => {
    validateInternalKey(internalKey)
    return await ctx.db
      .query("agent_plans")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .first()
  },
})

export const upsertInternal = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    title: v.string(),
    features: v.array(featureValidator),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey)
    const now = Date.now()
    const existing = await ctx.db
      .query("agent_plans")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first()
    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title,
        features: args.features,
        updatedAt: now,
      })
      return existing._id
    }
    return await ctx.db.insert("agent_plans", {
      projectId: args.projectId,
      title: args.title,
      features: args.features,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const updateFeatureStatusInternal = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    featureId: v.string(),
    status: featureStatusValidator,
    blocker: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey)
    const plan = await ctx.db
      .query("agent_plans")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first()
    if (!plan) throw new Error("No plan for this project")
    const now = Date.now()
    const newFeatures = plan.features.map((f) => {
      if (f.id !== args.featureId) return f
      return {
        ...f,
        status: args.status,
        blockers:
          args.blocker !== undefined
            ? [...(f.blockers ?? []), args.blocker]
            : f.blockers,
        updatedAt: now,
      }
    })
    if (!newFeatures.some((f) => f.id === args.featureId)) {
      throw new Error(`Feature ${args.featureId} not found in plan`)
    }
    await ctx.db.patch(plan._id, { features: newFeatures, updatedAt: now })
    return plan._id
  },
})

/* ─────────────────────────────────────────────────────────────────────────
 * Plan clarifications — round-trips between executor and planner
 * ───────────────────────────────────────────────────────────────────── */

export const askClarificationInternal = mutation({
  args: {
    internalKey: v.string(),
    planId: v.id("agent_plans"),
    projectId: v.id("projects"),
    runId: v.string(),
    question: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey)
    return await ctx.db.insert("plan_clarifications", {
      planId: args.planId,
      projectId: args.projectId,
      runId: args.runId,
      question: args.question,
      status: "pending",
      askedAt: Date.now(),
    })
  },
})

export const answerClarificationInternal = mutation({
  args: {
    internalKey: v.string(),
    id: v.id("plan_clarifications"),
    answer: v.string(),
  },
  handler: async (ctx, { internalKey, id, answer }) => {
    validateInternalKey(internalKey)
    const row = await ctx.db.get(id)
    if (!row) throw new Error("Clarification not found")
    if (row.status !== "pending") return row._id
    await ctx.db.patch(id, {
      status: "answered",
      answer,
      answeredAt: Date.now(),
    })
    return id
  },
})

export const getClarificationInternal = query({
  args: { internalKey: v.string(), id: v.id("plan_clarifications") },
  handler: async (ctx, { internalKey, id }) => {
    validateInternalKey(internalKey)
    return await ctx.db.get(id)
  },
})

export const expireOldClarificationsInternal = mutation({
  args: { internalKey: v.string(), maxAgeMs: v.number() },
  handler: async (ctx, { internalKey, maxAgeMs }) => {
    validateInternalKey(internalKey)
    const cutoff = Date.now() - maxAgeMs
    const rows = await ctx.db
      .query("plan_clarifications")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect()
    const expired: Id<"plan_clarifications">[] = []
    for (const row of rows) {
      if (row.askedAt < cutoff) {
        await ctx.db.patch(row._id, { status: "timed_out" })
        expired.push(row._id)
      }
    }
    return expired
  },
})
