/**
 * MCP server configuration — D-056 / Phase 2.1.
 *
 * Per-project list of MCP servers the agent will route tool calls to.
 * Public-shape mutations require Clerk auth + project-owner check;
 * internal queries (called from Inngest) use the internalKey gate.
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import type { Id } from "./_generated/dataModel"

const validateInternalKey = (key: string) => {
  const expected = process.env.POLARIS_CONVEX_INTERNAL_KEY
  if (!expected) throw new Error("POLARIS_CONVEX_INTERNAL_KEY is not configured")
  if (key !== expected) throw new Error("Invalid internal key")
}

const transportValidator = v.union(
  v.object({
    type: v.literal("stdio"),
    command: v.string(),
    args: v.optional(v.array(v.string())),
    env: v.optional(v.record(v.string(), v.string())),
  }),
  v.object({
    type: v.literal("http"),
    url: v.string(),
    headers: v.optional(v.record(v.string(), v.string())),
  }),
  v.object({
    type: v.literal("sse"),
    url: v.string(),
    headers: v.optional(v.record(v.string(), v.string())),
  }),
)

const assertProjectOwner = async (
  ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> }; db: { get: (id: Id<"projects">) => Promise<{ ownerId: string } | null> } },
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
 * Internal queries (used by agent-loop)
 * ───────────────────────────────────────────────────────────────────── */

export const listEnabledForProjectInternal = query({
  args: { internalKey: v.string(), projectId: v.id("projects") },
  handler: async (ctx, { internalKey, projectId }) => {
    validateInternalKey(internalKey)
    const rows = await ctx.db
      .query("mcp_servers")
      .withIndex("by_project_enabled", (q) =>
        q.eq("projectId", projectId).eq("enabled", true),
      )
      .collect()
    return rows.map((r) => ({
      _id: r._id,
      name: r.name,
      transport: r.transport,
      timeoutMs: r.timeoutMs,
      toolAllowlist: r.toolAllowlist,
    }))
  },
})

/* ─────────────────────────────────────────────────────────────────────────
 * Public CRUD (project owner)
 * ───────────────────────────────────────────────────────────────────── */

export const listForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await assertProjectOwner(ctx, projectId)
    return await ctx.db
      .query("mcp_servers")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect()
  },
})

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    transport: transportValidator,
    timeoutMs: v.optional(v.number()),
    toolAllowlist: v.optional(v.array(v.string())),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await assertProjectOwner(ctx, args.projectId)
    const existing = await ctx.db
      .query("mcp_servers")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect()
    if (existing.some((r) => r.name === args.name)) {
      throw new Error(`MCP server with name "${args.name}" already exists for this project`)
    }
    const now = Date.now()
    return await ctx.db.insert("mcp_servers", {
      projectId: args.projectId,
      name: args.name,
      transport: args.transport,
      timeoutMs: args.timeoutMs,
      toolAllowlist: args.toolAllowlist,
      enabled: args.enabled ?? true,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const setEnabled = mutation({
  args: {
    id: v.id("mcp_servers"),
    enabled: v.boolean(),
  },
  handler: async (ctx, { id, enabled }) => {
    const row = await ctx.db.get(id)
    if (!row) throw new Error("MCP server not found")
    await assertProjectOwner(ctx, row.projectId)
    await ctx.db.patch(id, { enabled, updatedAt: Date.now() })
    return id
  },
})

export const remove = mutation({
  args: { id: v.id("mcp_servers") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id)
    if (!row) return null
    await assertProjectOwner(ctx, row.projectId)
    await ctx.db.delete(id)
    return id
  },
})
