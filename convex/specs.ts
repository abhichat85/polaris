/**
 * Spec panel CRUD. Authority: sub-plan 05, CONSTITUTION §11.2 (typed validators
 * per D-016, ULID feature ids).
 *
 * One spec document per project. Features are stored inline as a typed array
 * (not a separate sub-table) so the panel can render the whole list with one
 * Convex query and reorder client-side.
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

const featureValidator = v.object({
  id: v.string(),
  title: v.string(),
  description: v.string(),
  acceptanceCriteria: v.array(v.string()),
  status: v.union(
    v.literal("todo"),
    v.literal("in_progress"),
    v.literal("done"),
    v.literal("blocked"),
  ),
  priority: v.union(v.literal("p0"), v.literal("p1"), v.literal("p2")),
  praxiomEvidenceIds: v.optional(v.array(v.string())),
})

export const getByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("specs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first()
  },
})

export const upsertSpec = mutation({
  args: {
    projectId: v.id("projects"),
    features: v.array(featureValidator),
    updatedBy: v.union(
      v.literal("user"),
      v.literal("agent"),
      v.literal("praxiom"),
    ),
    praxiomDocumentId: v.optional(v.string()),
    source: v.optional(
      v.union(
        v.literal("user"),
        v.literal("praxiom"),
        v.literal("agent"),
        v.literal("upload"),
        v.literal("github"),
      ),
    ),
    specStatus: v.optional(
      v.union(v.literal("drafting"), v.literal("complete")),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("specs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first()

    const data: Record<string, unknown> = {
      projectId: args.projectId,
      features: args.features,
      updatedAt: Date.now(),
      updatedBy: args.updatedBy,
      praxiomDocumentId: args.praxiomDocumentId,
    }
    // Only set source/specStatus if provided (don't overwrite with undefined)
    if (args.source) data.source = args.source
    if (args.specStatus) data.specStatus = args.specStatus

    if (existing) {
      await ctx.db.patch(existing._id, data)
    } else {
      await ctx.db.insert("specs", data as any)
    }
  },
})

export const updateFeatureStatus = mutation({
  args: {
    projectId: v.id("projects"),
    featureId: v.string(),
    status: v.union(
      v.literal("todo"),
      v.literal("in_progress"),
      v.literal("done"),
      v.literal("blocked"),
    ),
  },
  handler: async (ctx, args) => {
    const spec = await ctx.db
      .query("specs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first()
    if (!spec) throw new Error("Spec not found for project")

    const features = spec.features.map((f) =>
      f.id === args.featureId ? { ...f, status: args.status } : f,
    )
    await ctx.db.patch(spec._id, { features, updatedAt: Date.now(), updatedBy: "user" })
  },
})

export const reorderCriteria = mutation({
  args: {
    projectId: v.id("projects"),
    featureId: v.string(),
    nextOrder: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const spec = await ctx.db
      .query("specs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first()
    if (!spec) throw new Error("Spec not found")

    const features = spec.features.map((f) => {
      if (f.id !== args.featureId) return f
      // Preserve criteria not in nextOrder at the end (defensive — UI shouldn't drop any).
      const set = new Set(args.nextOrder)
      const trailing = f.acceptanceCriteria.filter((c) => !set.has(c))
      return { ...f, acceptanceCriteria: [...args.nextOrder, ...trailing] }
    })
    await ctx.db.patch(spec._id, { features, updatedAt: Date.now(), updatedBy: "user" })
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// D-026 — plan-mode CRUD. The Planner agent calls these to persist its
// output; the IDE plan pane reads them. internalKey-gated mutations match
// the convex/system.ts pattern so HTTP/Inngest callers can reach them.
// ─────────────────────────────────────────────────────────────────────────────

const validateInternalKey = (key: string) => {
  const expected = process.env.POLARIS_CONVEX_INTERNAL_KEY
  if (!expected) throw new Error("POLARIS_CONVEX_INTERNAL_KEY is not configured")
  if (key !== expected) throw new Error("Invalid internal key")
}

const planFeatureValidator = v.object({
  id: v.string(),
  title: v.string(),
  description: v.string(),
  acceptanceCriteria: v.array(v.string()),
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

/**
 * Persist a plan from the Planner agent. The agent passes the structured
 * features + the round-trip markdown form. We always overwrite; plan
 * regeneration replaces the whole document.
 */
export const writePlan = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    title: v.string(),
    features: v.array(planFeatureValidator),
    planMarkdown: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey)
    const existing = await ctx.db
      .query("specs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first()
    const data = {
      projectId: args.projectId,
      title: args.title,
      features: args.features,
      planMarkdown: args.planMarkdown,
      updatedAt: Date.now(),
      updatedBy: "agent" as const,
    }
    if (existing) {
      await ctx.db.patch(existing._id, data)
      return existing._id
    }
    return await ctx.db.insert("specs", data)
  },
})

/**
 * D-026 — agent-callable status flip. Distinct from `updateFeatureStatus`
 * which is a public auth-bound mutation; this one is internalKey-gated so
 * the agent loop can call it via convex.mutation(...).
 */
export const setFeatureStatus = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    featureId: v.string(),
    status: v.union(
      v.literal("todo"),
      v.literal("in_progress"),
      v.literal("done"),
      v.literal("blocked"),
    ),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey)
    const spec = await ctx.db
      .query("specs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first()
    if (!spec) return { ok: false, reason: "no_spec" }
    const features = spec.features.map((f) =>
      f.id === args.featureId ? { ...f, status: args.status } : f,
    )
    const found = features.some((f) => f.id === args.featureId)
    if (!found) return { ok: false, reason: "feature_not_found" }
    await ctx.db.patch(spec._id, {
      features,
      updatedAt: Date.now(),
      updatedBy: "agent" as const,
    })
    return { ok: true }
  },
})

/**
 * Auth-bound query for the IDE plan pane. Reads the current plan for a
 * project. Returns null if no plan yet (first build hasn't started).
 */
export const getPlan = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("specs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first()
  },
})

/**
 * User-edit path: replace the plan markdown + structured features atomically.
 * Triggered from the IDE plan pane "Save edits" button.
 */
export const userUpdatePlan = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    features: v.array(planFeatureValidator),
    planMarkdown: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("specs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first()
    if (!existing) {
      return await ctx.db.insert("specs", {
        projectId: args.projectId,
        title: args.title,
        features: args.features,
        planMarkdown: args.planMarkdown,
        updatedAt: Date.now(),
        updatedBy: "user" as const,
      })
    }
    await ctx.db.patch(existing._id, {
      title: args.title,
      features: args.features,
      planMarkdown: args.planMarkdown,
      updatedAt: Date.now(),
      updatedBy: "user" as const,
    })
    return existing._id
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// D-028 — sprint-completion detection + eval-state tracking.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the sprint index (if any) that just became fully `done` AND
 * has not yet been evaluated. Used by agent-loop after each runner.run
 * to decide whether to fire eval/run.
 *
 * Returns null when no such sprint exists.
 */
export const findSprintReadyForEval = query({
  args: { internalKey: v.string(), projectId: v.id("projects") },
  handler: async (ctx, { internalKey, projectId }) => {
    validateInternalKey(internalKey)
    const spec = await ctx.db
      .query("specs")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .first()
    if (!spec || !spec.features?.length) return null

    const evaluated = new Set(spec.evaluatedSprints ?? [])
    // Group features by sprint.
    const bySprint = new Map<number, typeof spec.features>()
    for (const f of spec.features) {
      const k = f.sprint ?? 0
      if (!bySprint.has(k)) bySprint.set(k, [])
      bySprint.get(k)!.push(f)
    }
    for (const [sprint, features] of bySprint.entries()) {
      if (evaluated.has(sprint)) continue
      const allDone = features.every((f) => f.status === "done")
      if (allDone && features.length > 0) return sprint
    }
    return null
  },
})

export const markSprintEvaluated = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    sprint: v.number(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey)
    const spec = await ctx.db
      .query("specs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first()
    if (!spec) return
    const existing = new Set(spec.evaluatedSprints ?? [])
    if (existing.has(args.sprint)) return
    existing.add(args.sprint)
    await ctx.db.patch(spec._id, {
      evaluatedSprints: Array.from(existing).sort((a, b) => a - b),
      updatedAt: Date.now(),
    })
  },
})
