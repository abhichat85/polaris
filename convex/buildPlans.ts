/**
 * Build Plans (Technical Spec) — agent-owned implementation plans.
 *
 * One active build plan per project, derived from the Product Spec.
 * Tasks are implementation-level items grouped into sprints with
 * traceability links back to spec features.
 *
 * Ownership: Build plans are written ONLY by the Polaris agent.
 * Users can view them and trigger regeneration, but never edit
 * task content directly.
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

const validateInternalKey = (key: string) => {
  const expected = process.env.POLARIS_CONVEX_INTERNAL_KEY
  if (!expected) throw new Error("POLARIS_CONVEX_INTERNAL_KEY is not configured")
  if (key !== expected) throw new Error("Invalid internal key")
}

const taskValidator = v.object({
  id: v.string(),
  specFeatureId: v.optional(v.string()),
  title: v.string(),
  description: v.optional(v.string()),
  fileTargets: v.optional(v.array(v.string())),
  status: v.union(
    v.literal("todo"),
    v.literal("in_progress"),
    v.literal("done"),
    v.literal("blocked"),
  ),
  priority: v.union(v.literal("p0"), v.literal("p1"), v.literal("p2")),
  sprint: v.optional(v.number()),
  praxiomEvidenceIds: v.optional(v.array(v.string())),
})

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch the active build plan for a project.
 * Returns null if the agent hasn't generated a plan yet.
 */
export const getByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("buildPlans")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first()
  },
})

/**
 * Sprint-completion detection. Returns the sprint index (if any) that
 * just became fully `done` AND has not yet been evaluated. Used by
 * agent-loop after each runner.run to decide whether to fire eval/run.
 */
export const findSprintReadyForEval = query({
  args: { internalKey: v.string(), projectId: v.id("projects") },
  handler: async (ctx, { internalKey, projectId }) => {
    validateInternalKey(internalKey)
    const plan = await ctx.db
      .query("buildPlans")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .first()
    if (!plan || !plan.tasks?.length) return null

    const evaluated = new Set(plan.evaluatedSprints ?? [])
    const bySprint = new Map<number, typeof plan.tasks>()
    for (const t of plan.tasks) {
      const k = t.sprint ?? 0
      if (!bySprint.has(k)) bySprint.set(k, [])
      bySprint.get(k)!.push(t)
    }
    for (const [sprint, tasks] of bySprint.entries()) {
      if (evaluated.has(sprint)) continue
      const allDone = tasks.every((t) => t.status === "done")
      if (allDone && tasks.length > 0) return sprint
    }
    return null
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Mutations — agent-only (internalKey-gated)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist a plan from the Planner agent. Always overwrites — plan
 * regeneration replaces the whole document.
 *
 * Takes the structured tasks + round-trip markdown form. Maps features
 * from the planner output to tasks with specFeatureId links preserved.
 */
export const writePlan = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    title: v.string(),
    tasks: v.array(taskValidator),
    planMarkdown: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey)
    const existing = await ctx.db
      .query("buildPlans")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first()
    const data = {
      projectId: args.projectId,
      title: args.title,
      tasks: args.tasks,
      planMarkdown: args.planMarkdown,
      generatedAt: Date.now(),
      generatedBy: "agent" as const,
    }
    if (existing) {
      await ctx.db.patch(existing._id, data)
      return existing._id
    }
    return await ctx.db.insert("buildPlans", data)
  },
})

/**
 * Agent-callable task status flip. Used by the code agent loop to
 * mark tasks as in_progress/done/blocked during code generation.
 */
export const setTaskStatus = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    taskId: v.string(),
    status: v.union(
      v.literal("todo"),
      v.literal("in_progress"),
      v.literal("done"),
      v.literal("blocked"),
    ),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey)
    const plan = await ctx.db
      .query("buildPlans")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first()
    if (!plan) return { ok: false, reason: "no_plan" }
    const tasks = plan.tasks.map((t) =>
      t.id === args.taskId ? { ...t, status: args.status } : t,
    )
    const found = tasks.some((t) => t.id === args.taskId)
    if (!found) return { ok: false, reason: "task_not_found" }
    await ctx.db.patch(plan._id, {
      tasks,
      generatedAt: Date.now(),
    })
    return { ok: true }
  },
})

/**
 * Mark a sprint as evaluated. Prevents double-eval when the Generator
 * nudges task statuses post-grading.
 */
export const markSprintEvaluated = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    sprint: v.number(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey)
    const plan = await ctx.db
      .query("buildPlans")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first()
    if (!plan) return
    const existing = new Set(plan.evaluatedSprints ?? [])
    if (existing.has(args.sprint)) return
    existing.add(args.sprint)
    await ctx.db.patch(plan._id, {
      evaluatedSprints: Array.from(existing).sort((a, b) => a - b),
      generatedAt: Date.now(),
    })
  },
})
