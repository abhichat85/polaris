/**
 * Plan tier definitions + quota assertion. Authority: CONSTITUTION §17.2,
 * Decision Log D-019.
 *
 * The `plans` table is the source of truth for tier limits. `customers.plan`
 * names which tier a user is on; this module joins the two and consults
 * the existing `usage` and `usage_daily` tables to answer "is this user
 * within their quota for operation X".
 *
 * `seedDefaults` is intentionally an internalMutation — seed numbers are a
 * product decision, never auto-applied on schema deploy. Run once after
 * pulling: `npx convex run plans:seedDefaults`.
 */

import { v } from "convex/values"
import { internalMutation, query } from "./_generated/server"
import { verifyAuth } from "./auth"

// Internal-key gate — matches the pattern used throughout convex/system.ts.
// Server-side callers (API routes, Inngest functions) pass POLARIS_CONVEX_INTERNAL_KEY.
const requireInternalKey = (key: string) => {
  const expected = process.env.POLARIS_CONVEX_INTERNAL_KEY
  if (!expected) {
    throw new Error("POLARIS_CONVEX_INTERNAL_KEY is not configured")
  }
  if (key !== expected) {
    throw new Error("Invalid internal key")
  }
}

const planLiteral = v.union(
  v.literal("free"),
  v.literal("pro"),
  v.literal("team"),
)

interface SeedRow {
  id: "free" | "pro" | "team"
  monthlyTokenLimit: number
  dailyCostCeilingCents: number
  projectsAllowed: number
  deploysAllowedPerMonth: number
  seats: number
}

const SEED_ROWS: readonly SeedRow[] = [
  {
    id: "free",
    monthlyTokenLimit: 50_000,
    dailyCostCeilingCents: 0,
    projectsAllowed: 3,
    deploysAllowedPerMonth: 1,
    seats: 1,
  },
  {
    id: "pro",
    monthlyTokenLimit: 2_000_000,
    dailyCostCeilingCents: 2_000, // $20/day
    projectsAllowed: 50,
    deploysAllowedPerMonth: 100,
    seats: 1,
  },
  {
    id: "team",
    monthlyTokenLimit: 10_000_000,
    dailyCostCeilingCents: 10_000, // $100/day
    projectsAllowed: 200,
    deploysAllowedPerMonth: 500,
    seats: 5,
  },
] as const

/**
 * Idempotent seed — running twice patches existing rows with current numbers
 * (so changing the constants above + re-running is the supported way to
 * adjust limits without a migration).
 */
export const seedDefaults = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    for (const row of SEED_ROWS) {
      const existing = await ctx.db
        .query("plans")
        .withIndex("by_plan_id", (q) => q.eq("id", row.id))
        .first()
      if (existing) {
        await ctx.db.patch(existing._id, {
          monthlyTokenLimit: row.monthlyTokenLimit,
          dailyCostCeilingCents: row.dailyCostCeilingCents,
          projectsAllowed: row.projectsAllowed,
          deploysAllowedPerMonth: row.deploysAllowedPerMonth,
          seats: row.seats,
          updatedAt: now,
        })
      } else {
        await ctx.db.insert("plans", { ...row, updatedAt: now })
      }
    }
    return { seeded: SEED_ROWS.length }
  },
})

export const getById = query({
  args: { id: planLiteral },
  handler: async (ctx, { id }) => {
    const row = await ctx.db
      .query("plans")
      .withIndex("by_plan_id", (q) => q.eq("id", id))
      .first()
    if (!row) {
      throw new Error(
        `Plan "${id}" not seeded. Run \`npx convex run plans:seedDefaults\`.`,
      )
    }
    return row
  },
})

const opLiteral = v.union(
  v.literal("agent_run"),
  v.literal("deploy"),
  v.literal("project_create"),
)

const yearMonthUtc = (now: number) => {
  const d = new Date(now)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

/**
 * Authenticated quota check. Reads identity → `customers.plan` (or "free"
 * fallback) → matching `plans` row → relevant usage aggregator. Returns a
 * union — callers (API routes, Inngest functions) inspect `ok` and surface
 * upgrade UI on `false`.
 *
 * Tolerant of missing rows: a user with no `usage` row counts as zero usage.
 * That's intentional — the *first* operation never gets blocked by a stale
 * read.
 */
export const assertWithinQuota = query({
  args: { op: opLiteral },
  handler: async (ctx, { op }) => {
    const identity = await verifyAuth(ctx)
    const userId = identity.subject

    // Resolve plan id (default "free" when no customer row exists).
    const customer = await ctx.db
      .query("customers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique()
    const planId = customer?.plan ?? "free"

    const plan = await ctx.db
      .query("plans")
      .withIndex("by_plan_id", (q) => q.eq("id", planId))
      .first()
    if (!plan) {
      throw new Error(
        `Plan "${planId}" not seeded. Run \`npx convex run plans:seedDefaults\` once.`,
      )
    }

    const now = Date.now()

    if (op === "agent_run") {
      const ym = yearMonthUtc(now)
      const usageRow = await ctx.db
        .query("usage")
        .withIndex("by_owner_month", (q) =>
          q.eq("ownerId", userId).eq("yearMonth", ym),
        )
        .first()
      const current = usageRow?.anthropicTokens ?? 0
      if (current >= plan.monthlyTokenLimit) {
        return {
          ok: false as const,
          reason: "monthly_tokens",
          limit: plan.monthlyTokenLimit,
          current,
        }
      }
      return { ok: true as const }
    }

    if (op === "deploy") {
      const ym = yearMonthUtc(now)
      const usageRow = await ctx.db
        .query("usage")
        .withIndex("by_owner_month", (q) =>
          q.eq("ownerId", userId).eq("yearMonth", ym),
        )
        .first()
      const current = usageRow?.deployments ?? 0
      if (current >= plan.deploysAllowedPerMonth) {
        return {
          ok: false as const,
          reason: "monthly_deploys",
          limit: plan.deploysAllowedPerMonth,
          current,
        }
      }
      return { ok: true as const }
    }

    // project_create — count owned projects.
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect()
    const current = projects.length
    if (current >= plan.projectsAllowed) {
      return {
        ok: false as const,
        reason: "projects",
        limit: plan.projectsAllowed,
        current,
      }
    }
    return { ok: true as const }
  },
})

// ---------------------------------------------------------------------------
// Server-side variant — same logic, internalKey-gated, takes userId arg.
// API routes + Inngest functions use this since they don't pipe Clerk auth
// through the Convex client. Pattern matches `convex/system.ts` — exposed as
// public `query` so HTTP-client callers can reach it; the internalKey arg
// is the security boundary.
// ---------------------------------------------------------------------------
export const assertWithinQuotaInternal = query({
  args: {
    internalKey: v.string(),
    userId: v.string(),
    op: opLiteral,
  },
  handler: async (ctx, { internalKey, userId, op }) => {
    requireInternalKey(internalKey)

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique()
    const planId = customer?.plan ?? "free"

    const plan = await ctx.db
      .query("plans")
      .withIndex("by_plan_id", (q) => q.eq("id", planId))
      .first()
    if (!plan) {
      throw new Error(
        `Plan "${planId}" not seeded. Run \`npx convex run plans:seedDefaults\` once.`,
      )
    }

    const now = Date.now()

    if (op === "agent_run") {
      const ym = yearMonthUtc(now)
      const usageRow = await ctx.db
        .query("usage")
        .withIndex("by_owner_month", (q) =>
          q.eq("ownerId", userId).eq("yearMonth", ym),
        )
        .first()
      const current = usageRow?.anthropicTokens ?? 0
      if (current >= plan.monthlyTokenLimit) {
        return {
          ok: false as const,
          reason: "monthly_tokens",
          limit: plan.monthlyTokenLimit,
          current,
        }
      }
      return { ok: true as const }
    }

    if (op === "deploy") {
      const ym = yearMonthUtc(now)
      const usageRow = await ctx.db
        .query("usage")
        .withIndex("by_owner_month", (q) =>
          q.eq("ownerId", userId).eq("yearMonth", ym),
        )
        .first()
      const current = usageRow?.deployments ?? 0
      if (current >= plan.deploysAllowedPerMonth) {
        return {
          ok: false as const,
          reason: "monthly_deploys",
          limit: plan.deploysAllowedPerMonth,
          current,
        }
      }
      return { ok: true as const }
    }

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect()
    const current = projects.length
    if (current >= plan.projectsAllowed) {
      return {
        ok: false as const,
        reason: "projects",
        limit: plan.projectsAllowed,
        current,
      }
    }
    return { ok: true as const }
  },
})
