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
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("specs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first()

    const data = {
      projectId: args.projectId,
      features: args.features,
      updatedAt: Date.now(),
      updatedBy: args.updatedBy,
      praxiomDocumentId: args.praxiomDocumentId,
    }

    if (existing) {
      await ctx.db.patch(existing._id, data)
    } else {
      await ctx.db.insert("specs", data)
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
