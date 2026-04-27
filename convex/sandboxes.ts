/**
 * Per-project sandbox lifecycle. Authority: CONSTITUTION D-018.
 *
 * The `sandboxes` table caches one row per project. The agent loop
 * fetches before each run and reuses while alive + within TTL; otherwise
 * it provisions a new sandbox via `getSandboxProvider().create()` and
 * persists via `setForProject`. On `SandboxDeadError` mid-run, `markDead`
 * flips `alive=false` and the loop reprovisions exactly once.
 *
 * Pattern matches `convex/system.ts:validateInternalKey` — public
 * queries/mutations gated on `POLARIS_CONVEX_INTERNAL_KEY` so HTTP and
 * Inngest callers can reach them without piping Clerk auth.
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

const validateInternalKey = (key: string) => {
  const expected = process.env.POLARIS_CONVEX_INTERNAL_KEY
  if (!expected) throw new Error("POLARIS_CONVEX_INTERNAL_KEY is not configured")
  if (key !== expected) throw new Error("Invalid internal key")
}

export const getByProject = query({
  args: { internalKey: v.string(), projectId: v.id("projects") },
  handler: async (ctx, { internalKey, projectId }) => {
    validateInternalKey(internalKey)
    return await ctx.db
      .query("sandboxes")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .first()
  },
})

export const setForProject = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    sandboxId: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey)
    const now = Date.now()
    const existing = await ctx.db
      .query("sandboxes")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first()
    if (existing) {
      await ctx.db.patch(existing._id, {
        sandboxId: args.sandboxId,
        alive: true,
        createdAt: now,
        expiresAt: args.expiresAt,
        lastAlive: now,
        needsResync: false,
      })
      return existing._id
    }
    return await ctx.db.insert("sandboxes", {
      projectId: args.projectId,
      sandboxId: args.sandboxId,
      alive: true,
      createdAt: now,
      expiresAt: args.expiresAt,
      lastAlive: now,
      needsResync: false,
    })
  },
})

export const markDead = mutation({
  args: { internalKey: v.string(), sandboxId: v.string() },
  handler: async (ctx, { internalKey, sandboxId }) => {
    validateInternalKey(internalKey)
    const row = await ctx.db
      .query("sandboxes")
      .withIndex("by_sandbox_id", (q) => q.eq("sandboxId", sandboxId))
      .first()
    if (!row) return null
    await ctx.db.patch(row._id, { alive: false, needsResync: true })
    return row._id
  },
})

export const touch = mutation({
  args: { internalKey: v.string(), sandboxId: v.string() },
  handler: async (ctx, { internalKey, sandboxId }) => {
    validateInternalKey(internalKey)
    const row = await ctx.db
      .query("sandboxes")
      .withIndex("by_sandbox_id", (q) => q.eq("sandboxId", sandboxId))
      .first()
    if (!row) return null
    await ctx.db.patch(row._id, { lastAlive: Date.now() })
    return row._id
  },
})
