/**
 * User onboarding state. Authority: sub-plan 10 Task 1/2.
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { verifyAuth } from "./auth"

/**
 * Authenticated convenience read: returns the *current* user's profile,
 * synthesising a default shape when no row exists yet. Settings UI relies
 * on never seeing `undefined` after auth is established.
 */
export const getCurrent = query({
  args: {},
  handler: async (ctx) => {
    const identity = await verifyAuth(ctx)
    const row = await ctx.db
      .query("user_profiles")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .first()
    if (row) return row
    return {
      _id: null,
      _creationTime: 0,
      userId: identity.subject,
      onboardingCompleted: false,
      onboardingStep: "welcome",
      marketingOptIn: false,
      cookieConsent: undefined,
      createdAt: 0,
      updatedAt: 0,
    }
  },
})

/**
 * Authenticated preference mutation. Unlike `upsert` (called by onboarding,
 * which trusts the supplied userId), this derives userId from auth so the
 * Settings UI cannot write to a different user's profile.
 */
export const updatePreferences = mutation({
  args: {
    marketingOptIn: v.optional(v.boolean()),
    cookieConsent: v.optional(
      v.object({
        analytics: v.boolean(),
        marketing: v.boolean(),
        timestamp: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx)
    const existing = await ctx.db
      .query("user_profiles")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .first()
    const now = Date.now()
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(args.marketingOptIn !== undefined && {
          marketingOptIn: args.marketingOptIn,
        }),
        ...(args.cookieConsent && { cookieConsent: args.cookieConsent }),
        updatedAt: now,
      })
      return existing._id
    }
    return await ctx.db.insert("user_profiles", {
      userId: identity.subject,
      onboardingCompleted: false,
      onboardingStep: "welcome",
      marketingOptIn: args.marketingOptIn,
      cookieConsent: args.cookieConsent,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const get = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("user_profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first()
  },
})

export const upsert = mutation({
  args: {
    userId: v.string(),
    onboardingCompleted: v.optional(v.boolean()),
    onboardingStep: v.optional(v.string()),
    marketingOptIn: v.optional(v.boolean()),
    cookieConsent: v.optional(
      v.object({
        analytics: v.boolean(),
        marketing: v.boolean(),
        timestamp: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("user_profiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first()
    const now = Date.now()
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(args.onboardingCompleted !== undefined && {
          onboardingCompleted: args.onboardingCompleted,
        }),
        ...(args.onboardingStep && { onboardingStep: args.onboardingStep }),
        ...(args.marketingOptIn !== undefined && {
          marketingOptIn: args.marketingOptIn,
        }),
        ...(args.cookieConsent && { cookieConsent: args.cookieConsent }),
        updatedAt: now,
      })
      return existing._id
    }
    return await ctx.db.insert("user_profiles", {
      userId: args.userId,
      onboardingCompleted: args.onboardingCompleted ?? false,
      onboardingStep: args.onboardingStep ?? "welcome",
      marketingOptIn: args.marketingOptIn,
      cookieConsent: args.cookieConsent,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const completeOnboarding = mutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const existing = await ctx.db
      .query("user_profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first()
    const now = Date.now()
    if (existing) {
      await ctx.db.patch(existing._id, {
        onboardingCompleted: true,
        onboardingStep: "done",
        updatedAt: now,
      })
      return existing._id
    }
    return await ctx.db.insert("user_profiles", {
      userId,
      onboardingCompleted: true,
      onboardingStep: "done",
      createdAt: now,
      updatedAt: now,
    })
  },
})
