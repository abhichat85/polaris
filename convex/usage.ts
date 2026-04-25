/**
 * Usage tracking. Authority: sub-plan 08 (billing) — the row exists from
 * sub-plan 01 so the agent loop can record tokens as it generates them.
 *
 * One row per (ownerId, yearMonth). Increments are non-transactional but
 * idempotent enough for v1 — Convex serializes mutations per row, so two
 * concurrent increments do not lose updates.
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

function currentYearMonth(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

export const increment = mutation({
  args: {
    ownerId: v.string(),
    anthropicTokens: v.optional(v.number()),
    e2bSeconds: v.optional(v.number()),
    deployments: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const yearMonth = currentYearMonth()
    const existing = await ctx.db
      .query("usage")
      .withIndex("by_owner_month", (q) =>
        q.eq("ownerId", args.ownerId).eq("yearMonth", yearMonth),
      )
      .first()

    const delta = {
      anthropicTokens: args.anthropicTokens ?? 0,
      e2bSeconds: args.e2bSeconds ?? 0,
      deployments: args.deployments ?? 0,
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        anthropicTokens: existing.anthropicTokens + delta.anthropicTokens,
        e2bSeconds: existing.e2bSeconds + delta.e2bSeconds,
        deployments: existing.deployments + delta.deployments,
        updatedAt: Date.now(),
      })
    } else {
      await ctx.db.insert("usage", {
        ownerId: args.ownerId,
        yearMonth,
        anthropicTokens: delta.anthropicTokens,
        e2bSeconds: delta.e2bSeconds,
        deployments: delta.deployments,
        updatedAt: Date.now(),
      })
    }
  },
})

export const getCurrentMonth = query({
  args: { ownerId: v.string() },
  handler: async (ctx, args) => {
    const yearMonth = currentYearMonth()
    return await ctx.db
      .query("usage")
      .withIndex("by_owner_month", (q) =>
        q.eq("ownerId", args.ownerId).eq("yearMonth", yearMonth),
      )
      .first()
  },
})
