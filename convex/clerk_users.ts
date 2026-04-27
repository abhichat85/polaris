/**
 * Clerk user cache. Authority: D-020.
 *
 * Populated by the Clerk webhook (`/api/webhooks/clerk`) on user.created
 * and user.updated. The workspace UI reads from here to render member
 * email + name without an HTTP roundtrip per row.
 *
 * Pattern: public mutations/queries gated on POLARIS_CONVEX_INTERNAL_KEY
 * (matches `convex/system.ts`).
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

const validateInternalKey = (key: string) => {
  const expected = process.env.POLARIS_CONVEX_INTERNAL_KEY
  if (!expected) throw new Error("POLARIS_CONVEX_INTERNAL_KEY is not configured")
  if (key !== expected) throw new Error("Invalid internal key")
}

export const upsertFromWebhook = mutation({
  args: {
    internalKey: v.string(),
    userId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey)
    const existing = await ctx.db
      .query("clerk_user_cache")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first()
    const now = Date.now()
    const payload = {
      userId: args.userId,
      email: args.email,
      firstName: args.firstName,
      lastName: args.lastName,
      imageUrl: args.imageUrl,
      updatedAt: now,
    }
    if (existing) {
      await ctx.db.patch(existing._id, payload)
      return existing._id
    }
    return await ctx.db.insert("clerk_user_cache", payload)
  },
})

export const getByUserId = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("clerk_user_cache")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first()
  },
})

export const getByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    return await ctx.db
      .query("clerk_user_cache")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first()
  },
})

export const getManyByUserId = query({
  args: { userIds: v.array(v.string()) },
  handler: async (ctx, { userIds }) => {
    const out = []
    for (const uid of userIds) {
      const row = await ctx.db
        .query("clerk_user_cache")
        .withIndex("by_user", (q) => q.eq("userId", uid))
        .first()
      if (row) out.push(row)
    }
    return out
  },
})
