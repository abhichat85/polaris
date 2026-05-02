/**
 * Warm sandbox pool — Phase 3.1.
 *
 * Atomic claim/replenish API for the warm pool. Three knobs:
 *   - claimOneInternal: pop the oldest unclaimed sandbox, marking
 *     claimedAt/claimedBy in a single mutation
 *   - listIdleInternal: count unclaimed sandboxes (used by the cron
 *     replenisher to decide how many to spin up)
 *   - addInternal: insert a freshly-created warm sandbox
 *   - rotateExpiredInternal: list sandboxes older than maxAgeMs that are
 *     still unclaimed (the replenisher kills them)
 *   - removeInternal: delete a row by sandboxId
 *
 * All operations are gated on internalKey because the pool lives in
 * a different trust domain than per-project state.
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

const validateInternalKey = (key: string) => {
  const expected = process.env.POLARIS_CONVEX_INTERNAL_KEY
  if (!expected) throw new Error("POLARIS_CONVEX_INTERNAL_KEY is not configured")
  if (key !== expected) throw new Error("Invalid internal key")
}

export const listIdleInternal = query({
  args: {
    internalKey: v.string(),
    template: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { internalKey, template, limit }) => {
    validateInternalKey(internalKey)
    const rows = await ctx.db
      .query("warm_sandboxes")
      .withIndex("by_claimed", (q) => q.eq("claimedAt", undefined))
      .order("asc")
      .take(Math.min(limit ?? 100, 500))
    return template ? rows.filter((r) => r.template === template) : rows
  },
})

export const claimOneInternal = mutation({
  args: {
    internalKey: v.string(),
    template: v.string(),
    claimedBy: v.string(),
  },
  handler: async (ctx, { internalKey, template, claimedBy }) => {
    validateInternalKey(internalKey)
    // Find oldest unclaimed sandbox of the requested template.
    const candidates = await ctx.db
      .query("warm_sandboxes")
      .withIndex("by_claimed", (q) => q.eq("claimedAt", undefined))
      .order("asc")
      .take(50)
    const match = candidates.find((r) => r.template === template)
    if (!match) return null
    const now = Date.now()
    await ctx.db.patch(match._id, { claimedAt: now, claimedBy })
    return { sandboxId: match.sandboxId, template: match.template, createdAt: match.createdAt }
  },
})

export const addInternal = mutation({
  args: {
    internalKey: v.string(),
    sandboxId: v.string(),
    template: v.string(),
  },
  handler: async (ctx, { internalKey, sandboxId, template }) => {
    validateInternalKey(internalKey)
    return await ctx.db.insert("warm_sandboxes", {
      sandboxId,
      template,
      createdAt: Date.now(),
      claimedAt: undefined,
      claimedBy: undefined,
    })
  },
})

export const rotateExpiredInternal = query({
  args: {
    internalKey: v.string(),
    maxAgeMs: v.number(),
  },
  handler: async (ctx, { internalKey, maxAgeMs }) => {
    validateInternalKey(internalKey)
    const cutoff = Date.now() - maxAgeMs
    const rows = await ctx.db
      .query("warm_sandboxes")
      .withIndex("by_claimed", (q) => q.eq("claimedAt", undefined))
      .collect()
    return rows.filter((r) => r.createdAt < cutoff)
  },
})

export const removeInternal = mutation({
  args: { internalKey: v.string(), sandboxId: v.string() },
  handler: async (ctx, { internalKey, sandboxId }) => {
    validateInternalKey(internalKey)
    const row = await ctx.db
      .query("warm_sandboxes")
      .withIndex("by_sandbox_id", (q) => q.eq("sandboxId", sandboxId))
      .first()
    if (!row) return null
    await ctx.db.delete(row._id)
    return row._id
  },
})
