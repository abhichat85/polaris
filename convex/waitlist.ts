/**
 * Waitlist. Authority: sub-plan 10 Task 1/2.
 *
 * Public mutation: enroll an email. Internal: list/admin operations.
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

export const enroll = mutation({
  args: {
    email: v.string(),
    referrer: v.optional(v.string()),
  },
  handler: async (ctx, { email, referrer }) => {
    const normalized = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
      throw new Error("invalid_email")
    }
    const existing = await ctx.db
      .query("waitlist")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .first()
    if (existing) return existing._id
    return await ctx.db.insert("waitlist", {
      email: normalized,
      referrer,
      requestedAt: Date.now(),
      status: "pending",
    })
  },
})

export const listByStatus = query({
  args: {
    status: v.union(
      v.literal("pending"),
      v.literal("invited"),
      v.literal("rejected"),
    ),
  },
  handler: async (ctx, { status }) => {
    return await ctx.db
      .query("waitlist")
      .withIndex("by_status", (q) => q.eq("status", status))
      .collect()
  },
})
