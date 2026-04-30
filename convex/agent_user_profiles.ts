/**
 * agent_user_profiles — per-user agent preferences and adaptation signals.
 *
 * Distinct from `user_profiles` (Clerk onboarding state). This table holds
 * what the AGENT needs to know about the user: verbosity, code style,
 * override bag, run stats for the Calibrator, persistent notes.
 *
 * Writes are mostly Clerk-auth gated (user updates own profile from
 * settings UI), with one internal-key-gated mutation for the agent loop
 * to record run stats post-run.
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

const codeStyleValidator = v.object({
  paradigm: v.union(v.literal("functional"), v.literal("oop"), v.null()),
  exportStyle: v.union(v.literal("named"), v.literal("default"), v.null()),
  typeStyle: v.union(v.literal("inline"), v.literal("separate"), v.null()),
  maxLineLength: v.union(v.number(), v.null()),
})

const runStatsValidator = v.object({
  totalRuns: v.number(),
  successfulRuns: v.number(),
  averageIterations: v.number(),
  averageTokens: v.number(),
  averageDurationMs: v.number(),
  taskClassDistribution: v.any(),
  averageEvalScore: v.union(v.number(), v.null()),
})

function defaultProfile(userId: string) {
  const now = Date.now()
  return {
    userId,
    verbosity: "normal",
    codeStyle: {
      paradigm: null,
      exportStyle: null,
      typeStyle: null,
      maxLineLength: null,
    },
    overrides: {},
    runStats: {
      totalRuns: 0,
      successfulRuns: 0,
      averageIterations: 0,
      averageTokens: 0,
      averageDurationMs: 0,
      taskClassDistribution: {},
      averageEvalScore: null,
    },
    persistentNotes: [] as string[],
    createdAt: now,
    updatedAt: now,
  }
}

/** Get the calling user's profile (creates one with defaults if missing). */
export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    const profile = await ctx.db
      .query("agent_user_profiles")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .first()
    return profile
  },
})

/**
 * Internal getter — used by agent-loop pre-flight to inject preferences.
 * Returns defaults (NOT inserted) if no profile exists yet — pre-flight
 * is read-only.
 */
export const getOrDefaultInternal = query({
  args: { internalKey: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    if (args.internalKey !== process.env.POLARIS_CONVEX_INTERNAL_KEY) {
      throw new Error("Unauthorized")
    }
    const profile = await ctx.db
      .query("agent_user_profiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first()
    return profile ?? defaultProfile(args.userId)
  },
})

/** Update profile fields the user explicitly tunes from settings UI. */
export const update = mutation({
  args: {
    verbosity: v.optional(v.string()),
    codeStyle: v.optional(codeStyleValidator),
    overrides: v.optional(v.any()),
    persistentNotes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Unauthorized")
    const userId = identity.subject

    const existing = await ctx.db
      .query("agent_user_profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first()

    if (!existing) {
      const seed = defaultProfile(userId)
      const id = await ctx.db.insert("agent_user_profiles", seed)
      const patch: Record<string, unknown> = { updatedAt: Date.now() }
      if (args.verbosity !== undefined) patch.verbosity = args.verbosity
      if (args.codeStyle !== undefined) patch.codeStyle = args.codeStyle
      if (args.overrides !== undefined) patch.overrides = args.overrides
      if (args.persistentNotes !== undefined) {
        patch.persistentNotes = args.persistentNotes
      }
      await ctx.db.patch(id, patch)
      return id
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() }
    if (args.verbosity !== undefined) patch.verbosity = args.verbosity
    if (args.codeStyle !== undefined) patch.codeStyle = args.codeStyle
    if (args.overrides !== undefined) patch.overrides = args.overrides
    if (args.persistentNotes !== undefined) {
      patch.persistentNotes = args.persistentNotes
    }
    await ctx.db.patch(existing._id, patch)
    return existing._id
  },
})

/**
 * Internal — record a finished run's stats into the profile's runStats.
 * Called by agent-loop after the runner returns. Uses incremental
 * running averages to avoid storing full history.
 */
export const recordRunInternal = mutation({
  args: {
    internalKey: v.string(),
    userId: v.string(),
    iterations: v.number(),
    tokens: v.number(),
    durationMs: v.number(),
    taskClass: v.string(),
    evalScore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.internalKey !== process.env.POLARIS_CONVEX_INTERNAL_KEY) {
      throw new Error("Unauthorized")
    }
    const existing = await ctx.db
      .query("agent_user_profiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first()
    const profile = existing ?? defaultProfile(args.userId)

    const prev = profile.runStats
    const newCount = prev.totalRuns + 1

    // Incremental running averages
    const averageIterations =
      prev.averageIterations + (args.iterations - prev.averageIterations) / newCount
    const averageTokens =
      prev.averageTokens + (args.tokens - prev.averageTokens) / newCount
    const averageDurationMs =
      prev.averageDurationMs + (args.durationMs - prev.averageDurationMs) / newCount

    const dist =
      typeof prev.taskClassDistribution === "object" &&
      prev.taskClassDistribution !== null
        ? { ...(prev.taskClassDistribution as Record<string, number>) }
        : ({} as Record<string, number>)
    dist[args.taskClass] = (dist[args.taskClass] ?? 0) + 1

    let averageEvalScore = prev.averageEvalScore
    let successfulRuns = prev.successfulRuns
    if (args.evalScore !== undefined) {
      const newScored = successfulRuns + 1
      averageEvalScore =
        averageEvalScore === null
          ? args.evalScore
          : averageEvalScore + (args.evalScore - averageEvalScore) / newScored
      successfulRuns = newScored
    }

    const newRunStats = {
      totalRuns: newCount,
      successfulRuns,
      averageIterations,
      averageTokens,
      averageDurationMs,
      taskClassDistribution: dist,
      averageEvalScore,
    }

    if (!existing) {
      const seed = defaultProfile(args.userId)
      const id = await ctx.db.insert("agent_user_profiles", seed)
      await ctx.db.patch(id, {
        runStats: newRunStats,
        updatedAt: Date.now(),
      })
      return id
    }

    await ctx.db.patch(existing._id, {
      runStats: newRunStats,
      updatedAt: Date.now(),
    })
    return existing._id
  },
})
