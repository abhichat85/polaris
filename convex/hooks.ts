/**
 * Hook configuration — D-055 / Phase 2.2.
 *
 * Per-project HTTP hooks invoked by the agent harness at lifecycle
 * events. Public mutations require Clerk auth + project ownership;
 * the internal listing query (for agent-loop) uses the internalKey.
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import type { Id } from "./_generated/dataModel"

const validateInternalKey = (key: string) => {
  const expected = process.env.POLARIS_CONVEX_INTERNAL_KEY
  if (!expected) throw new Error("POLARIS_CONVEX_INTERNAL_KEY is not configured")
  if (key !== expected) throw new Error("Invalid internal key")
}

const eventValidator = v.union(
  v.literal("pre_tool_call"),
  v.literal("post_tool_call"),
  v.literal("iteration_start"),
  v.literal("agent_done"),
)

const targetValidator = v.object({
  url: v.string(),
  headers: v.optional(v.record(v.string(), v.string())),
})

const assertProjectOwner = async (
  ctx: {
    auth: { getUserIdentity: () => Promise<{ subject: string } | null> }
    db: { get: (id: Id<"projects">) => Promise<{ ownerId: string } | null> }
  },
  projectId: Id<"projects">,
) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Not authenticated")
  const project = await ctx.db.get(projectId)
  if (!project) throw new Error("Project not found")
  if (project.ownerId !== identity.subject) {
    throw new Error("Not authorized for this project")
  }
  return identity.subject
}

/* ─────────────────────────────────────────────────────────────────────────
 * Internal query — used by agent-loop to assemble HookRunner config.
 * ───────────────────────────────────────────────────────────────────── */

export const listEnabledForProjectInternal = query({
  args: { internalKey: v.string(), projectId: v.id("projects") },
  handler: async (ctx, { internalKey, projectId }) => {
    validateInternalKey(internalKey)
    const rows = await ctx.db
      .query("hooks")
      .withIndex("by_project_enabled", (q) =>
        q.eq("projectId", projectId).eq("enabled", true),
      )
      .collect()
    return rows.map((r) => ({
      _id: r._id,
      hookId: r.hookId,
      event: r.event,
      target: r.target,
      failMode: r.failMode,
      timeoutMs: r.timeoutMs,
    }))
  },
})

/* ─────────────────────────────────────────────────────────────────────────
 * Public CRUD
 * ───────────────────────────────────────────────────────────────────── */

export const listForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await assertProjectOwner(ctx, projectId)
    return await ctx.db
      .query("hooks")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect()
  },
})

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    hookId: v.string(),
    event: eventValidator,
    target: targetValidator,
    failMode: v.optional(v.union(v.literal("open"), v.literal("closed"))),
    timeoutMs: v.optional(v.number()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await assertProjectOwner(ctx, args.projectId)
    const existing = await ctx.db
      .query("hooks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect()
    if (existing.some((r) => r.hookId === args.hookId)) {
      throw new Error(`Hook with id "${args.hookId}" already exists for this project`)
    }
    const now = Date.now()
    return await ctx.db.insert("hooks", {
      projectId: args.projectId,
      hookId: args.hookId,
      event: args.event,
      target: args.target,
      failMode: args.failMode,
      timeoutMs: args.timeoutMs,
      enabled: args.enabled ?? true,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const setEnabled = mutation({
  args: { id: v.id("hooks"), enabled: v.boolean() },
  handler: async (ctx, { id, enabled }) => {
    const row = await ctx.db.get(id)
    if (!row) throw new Error("Hook not found")
    await assertProjectOwner(ctx, row.projectId)
    await ctx.db.patch(id, { enabled, updatedAt: Date.now() })
    return id
  },
})

export const remove = mutation({
  args: { id: v.id("hooks") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id)
    if (!row) return null
    await assertProjectOwner(ctx, row.projectId)
    await ctx.db.delete(id)
    return id
  },
})
