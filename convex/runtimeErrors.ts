/**
 * D-043 — Runtime error capture from preview iframe.
 *
 * Browser-side `polaris-runtime-tap.js` POSTs runtime events to a
 * Polaris HTTP proxy which forwards here. The agent reads these via
 * `read_runtime_errors` tool (C.3) and the runner auto-injects
 * unconsumed errors at turn start (C.4).
 *
 * Three responsibilities:
 *   - ingest: validate + dedupe + persist (rate-limited per-project)
 *   - listUnconsumed / list: read for agent + UI
 *   - markConsumed: agent says "I saw these"; clear: user says "trust me"
 *
 * Design notes:
 *   - Dedupe within DEDUPE_WINDOW_MS by (kind, message, url). Increments
 *     count on the existing row instead of creating a new one.
 *   - Per-project rate limit: max RATE_LIMIT_PER_MIN inserts per minute.
 *     Beyond that, the ingest silently no-ops to protect Convex storage
 *     from a runaway preview that's emitting thousands of errors/sec.
 *   - `consumed` flips when the agent reads them; rows stay in the
 *     table for ~24h so the UI chip can show recent error history,
 *     then a daily cron GCs old rows (TODO: separate task).
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

const validateInternalKey = (key: string) => {
  const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY
  if (!internalKey) throw new Error("POLARIS_CONVEX_INTERNAL_KEY is not configured")
  if (key !== internalKey) throw new Error("invalid_internal_key")
}

const DEDUPE_WINDOW_MS = 1_000
const RATE_LIMIT_PER_MIN = 50

const KIND_VALIDATOR = v.union(
  v.literal("error"),
  v.literal("unhandled_rejection"),
  v.literal("console_error"),
  v.literal("network_error"),
  v.literal("react_error_boundary"),
)

/**
 * Public ingest mutation — called by the Next.js HTTP proxy
 * `/api/runtime-error` after origin validation. The proxy is
 * trusted to set internalKey; browsers cannot call this directly.
 */
export const ingest = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    sandboxId: v.optional(v.string()),
    kind: KIND_VALIDATOR,
    message: v.string(),
    stack: v.optional(v.string()),
    url: v.optional(v.string()),
    componentStack: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    timestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey)

    const now = args.timestamp ?? Date.now()

    // Rate-limit per project — count inserts in the last minute.
    const recent = await ctx.db
      .query("runtimeErrors")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(RATE_LIMIT_PER_MIN + 1)
    const fresh = recent.filter((r) => now - r.timestamp <= 60_000)
    if (fresh.length >= RATE_LIMIT_PER_MIN) {
      // Silent drop — preview is in a bad state. UI surfaces this via
      // the chip's "more than N in last minute" branch.
      return { ok: false as const, reason: "rate_limited" as const }
    }

    // Dedupe: same (kind, message, url) within DEDUPE_WINDOW_MS bumps count.
    const candidates = await ctx.db
      .query("runtimeErrors")
      .withIndex("by_project_kind_message", (q) =>
        q.eq("projectId", args.projectId).eq("kind", args.kind).eq("message", args.message),
      )
      .order("desc")
      .take(1)
    const last = candidates[0]
    if (
      last &&
      last.url === args.url &&
      now - last.timestamp <= DEDUPE_WINDOW_MS
    ) {
      await ctx.db.patch(last._id, {
        count: (last.count ?? 1) + 1,
        // Refresh timestamp so dedupe window slides
        timestamp: now,
      })
      return { ok: true as const, deduped: true as const, id: last._id }
    }

    const id = await ctx.db.insert("runtimeErrors", {
      projectId: args.projectId,
      sandboxId: args.sandboxId,
      kind: args.kind,
      message: args.message,
      stack: args.stack,
      url: args.url,
      componentStack: args.componentStack,
      userAgent: args.userAgent,
      timestamp: now,
      consumed: false,
      count: 1,
    })
    return { ok: true as const, deduped: false as const, id }
  },
})

/** Internal — agent runner queries unconsumed errors at turn start. */
export const listUnconsumedInternal = query({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    /** Optional cutoff: only return errors at-or-after this timestamp. */
    since: v.optional(v.number()),
    /** Cap on returned rows (defensive). Default 50. */
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey)
    const limit = Math.min(args.limit ?? 50, 200)
    const rows = await ctx.db
      .query("runtimeErrors")
      .withIndex("by_project_unconsumed", (q) =>
        q.eq("projectId", args.projectId).eq("consumed", false),
      )
      .order("desc")
      .take(limit)
    return rows
      .filter((r) => (args.since ? r.timestamp >= args.since : true))
      // Return oldest-first so the agent reads them in chronological order.
      .sort((a, b) => a.timestamp - b.timestamp)
  },
})

/** Public — UI chip live-queries this to show "N errors" badge. */
export const listForProject = query({
  args: {
    projectId: v.id("projects"),
    /** Default: only unconsumed. Set false to show full recent history. */
    onlyUnconsumed: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 200)
    if (args.onlyUnconsumed === false) {
      const rows = await ctx.db
        .query("runtimeErrors")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .order("desc")
        .take(limit)
      return rows
    }
    const rows = await ctx.db
      .query("runtimeErrors")
      .withIndex("by_project_unconsumed", (q) =>
        q.eq("projectId", args.projectId).eq("consumed", false),
      )
      .order("desc")
      .take(limit)
    return rows
  },
})

/** Internal — agent calls after read_runtime_errors with markConsumed=true. */
export const markConsumedInternal = mutation({
  args: {
    internalKey: v.string(),
    ids: v.array(v.id("runtimeErrors")),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey)
    for (const id of args.ids) {
      const row = await ctx.db.get(id)
      if (row && !row.consumed) {
        await ctx.db.patch(id, { consumed: true })
      }
    }
    return { marked: args.ids.length }
  },
})

/** Public — user clicks "clear errors" in the chip. */
export const clearForProject = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("runtimeErrors")
      .withIndex("by_project_unconsumed", (q) =>
        q.eq("projectId", args.projectId).eq("consumed", false),
      )
      .collect()
    for (const r of rows) {
      await ctx.db.patch(r._id, { consumed: true })
    }
    return { cleared: rows.length }
  },
})
