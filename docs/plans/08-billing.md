# Sub-Plan 08 — Billing & Quotas

> **Authority:** Derives from `docs/CONSTITUTION.md` (esp. Articles XI §11.2, XIII §13.1/§13.6, XVII in full) and `docs/ROADMAP.md` Phase 2 (Days 8-9).
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Stand up the full billing & quota stack — a `plans` table, Stripe Checkout + Customer Portal flows, an idempotent webhook receiver covering the five subscription lifecycle events, a `checkQuota` middleware called before every model call / sandbox spawn / deploy / project-create, a daily-cost-ceiling kill-switch, an Inngest cron that materializes E2B seconds into the `usage` table, and the user-facing UI (plan picker, usage meters, upgrade CTA, billing dashboard, quota-exceeded banner). All wired into the existing `usage` rows that sub-plan 01 increments from inside the agent loop.

**Architecture:** `processMessage` (sub-plan 01) → before model call invokes `checkQuota(ownerId, "anthropicTokens", estimatedTokens)` and `checkDailyCeiling(ownerId)` → either proceeds or persists a `quota_exceeded` error message. Stripe webhook → `convex.mutation("stripe_events:recordIfNew")` (idempotency) → routed handler → `plans:setStripe` + `plans:setTier`. UI subscribes to `plans:get` and `usage:current` via Convex live queries.

**Tech Stack:** `stripe` (Node SDK, installed in sub-plan 01), `inngest`, `convex`, `vitest`, Resend (email — installed in sub-plan 09 if not earlier; we no-op gracefully if missing), Next.js App Router route handlers.

**Phase:** 2 — Integrations (Days 8-9 of 17-day plan).

**Constitution articles you must re-read before starting:**
- Article XI §11.2 — `plans`, `usage` table shapes, indexes, invariants.
- Article XIII §13.1 — Stripe webhook replay attack threat row.
- Article XIII §13.6 — Abuse prevention; daily ceiling.
- Article XVII (entire) — pricing, plan tiers, quota enforcement pseudocode, daily ceiling, Stripe integration scope, free-tier honesty rule.
- Article XIX §19.2 — Migration order: this sub-plan executes the billing slice (after agent loop and E2B).

---

## Table of Contents

- [File Structure](#file-structure)
- [Task 1: Schema — `plans` and `stripe_events` Tables](#task-1-schema--plans-and-stripe_events-tables)
- [Task 2: Plan Tier Constants](#task-2-plan-tier-constants)
- [Task 3: Convex Plan Functions](#task-3-convex-plan-functions)
- [Task 4: Convex Stripe Event Idempotency Table](#task-4-convex-stripe-event-idempotency-table)
- [Task 5: Stripe Server Singleton](#task-5-stripe-server-singleton)
- [Task 6: Stripe Checkout Route](#task-6-stripe-checkout-route)
- [Task 7: Stripe Customer Portal Route](#task-7-stripe-customer-portal-route)
- [Task 8: Stripe Webhook Route — Verification & Idempotency](#task-8-stripe-webhook-route--verification--idempotency)
- [Task 9: Stripe Webhook Route — Event Handlers](#task-9-stripe-webhook-route--event-handlers)
- [Task 10: Quota Enforcement Middleware](#task-10-quota-enforcement-middleware)
- [Task 11: Wire `checkQuota` into Agent Loop, Sandbox, Deploy, Project Create](#task-11-wire-checkquota-into-agent-loop-sandbox-deploy-project-create)
- [Task 12: Daily Cost Ceiling](#task-12-daily-cost-ceiling)
- [Task 13: Inngest — Track E2B Usage Cron](#task-13-inngest--track-e2b-usage-cron)
- [Task 14: Inngest — Daily Ceiling Alert Cron](#task-14-inngest--daily-ceiling-alert-cron)
- [Task 15: PlanPicker Component](#task-15-planpicker-component)
- [Task 16: UsageMeter Component](#task-16-usagemeter-component)
- [Task 17: UpgradeCTA Modal](#task-17-upgradecta-modal)
- [Task 18: QuotaExceededBanner](#task-18-quotaexceededbanner)
- [Task 19: Billing Dashboard Page](#task-19-billing-dashboard-page)
- [Task 20: Free-Tier Honesty Surface](#task-20-free-tier-honesty-surface)
- [Task 21: End-to-End Smoke Test (Stripe Test Mode)](#task-21-end-to-end-smoke-test-stripe-test-mode)
- [Task 22: Documentation and .env.example Additions](#task-22-documentation-and-envexample-additions)

---

## File Structure

### Files to create

```
convex/plans.ts                                              ← NEW
convex/stripe_events.ts                                      ← NEW: idempotency table fns
src/lib/billing/plan-tiers.ts                                ← NEW: FREE/PRO/TEAM constants
src/lib/billing/enforce-quota.ts                             ← NEW: checkQuota
src/lib/billing/daily-ceiling.ts                             ← NEW: checkDailyCeiling
src/lib/billing/stripe-server.ts                             ← NEW: Stripe singleton
src/lib/billing/cost-math.ts                                 ← NEW: token×rate, sec×rate helpers
src/app/api/stripe/checkout/route.ts                         ← NEW
src/app/api/stripe/portal/route.ts                           ← NEW
src/app/api/stripe/webhook/route.ts                          ← NEW
src/app/(app)/billing/page.tsx                               ← NEW: dashboard page
src/features/billing/components/plan-picker.tsx              ← NEW
src/features/billing/components/usage-meter.tsx              ← NEW
src/features/billing/components/upgrade-cta.tsx              ← NEW
src/features/billing/components/quota-exceeded-banner.tsx    ← NEW
src/features/billing/components/billing-history.tsx          ← NEW
src/features/billing/hooks/use-plan.ts                       ← NEW: live query wrapper
src/features/billing/hooks/use-usage.ts                      ← NEW: live query wrapper
src/inngest/functions/track-e2b-usage.ts                     ← NEW: 5-min cron
src/inngest/functions/daily-ceiling-alert.ts                 ← NEW: hourly cron

tests/unit/billing/plan-tiers.test.ts                        ← NEW
tests/unit/billing/enforce-quota.test.ts                     ← NEW
tests/unit/billing/daily-ceiling.test.ts                     ← NEW
tests/unit/billing/cost-math.test.ts                         ← NEW
tests/unit/billing/stripe-webhook.test.ts                    ← NEW
tests/unit/billing/stripe-checkout.test.ts                   ← NEW
tests/unit/billing/plans-mutation.test.ts                    ← NEW
tests/fixtures/stripe-events.ts                              ← NEW: recorded test fixtures
```

### Files to modify

```
convex/schema.ts                                             ← Add plans, stripe_events
src/app/api/inngest/route.ts                                 ← Register new cron functions
src/features/conversations/inngest/process-message.ts        ← Call checkQuota before model
src/lib/sandbox/ensure-sandbox.ts                            ← Call checkQuota("e2bSeconds")
src/features/projects/server/deploy-project.ts               ← Call checkQuota("deployments")
src/features/projects/server/create-project.ts               ← Call checkQuota("activeProjects")
src/app/(marketing)/pricing/page.tsx                         ← Surface limits (free-tier honesty)
src/app/(app)/onboarding/page.tsx                            ← Mention limits in onboarding (sub-plan 10 may amend)
.env.example                                                 ← STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, etc.
```

---

## Task 1: Schema — `plans` and `stripe_events` Tables

**Why first:** Every downstream task reads or writes `plans`. We can't write Convex functions, mock idempotency, or test webhooks until the schema is in place. Deploy this in isolation so any schema-validation errors surface before they're entangled with handler logic.

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1.1: Add `plans` table to schema (verbatim from CONSTITUTION §11.2)**

```typescript
// convex/schema.ts — additions only, leave existing tables intact

import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  // ... existing tables (projects, files, messages, conversations, agent_checkpoints, usage, ...)

  plans: defineTable({
    ownerId: v.string(),                              // Clerk userId — unique
    tier: v.union(v.literal("free"), v.literal("pro"), v.literal("team")),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("past_due"),
      v.literal("cancelled"),
      v.literal("trial"),
    ),
    limits: v.object({
      anthropicTokensPerMonth: v.number(),
      e2bSecondsPerMonth: v.number(),
      deploymentsPerMonth: v.number(),
      activeProjects: v.number(),
    }),
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"])
    .index("by_stripe_customer", ["stripeCustomerId"]),  // needed for webhook lookup

  stripe_events: defineTable({
    eventId: v.string(),                              // Stripe event id (evt_*)
    type: v.string(),                                 // e.g. "customer.subscription.created"
    processedAt: v.number(),
    payloadHash: v.optional(v.string()),              // sha256 of body for forensic audit
  }).index("by_event_id", ["eventId"]),
})
```

- [ ] **Step 1.2: Verify migration**

```bash
npx convex dev
```

Watch the dev console for "schema applied". If you see "ownerId index conflict" — sub-plan 01 may already have an index by the same name on a different table (`agent_checkpoints` uses `messageId`, `usage` uses `(ownerId, yearMonth)`). The index name is scoped per-table in Convex, so it should be fine.

- [ ] **Step 1.3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(billing): add plans and stripe_events tables"
```

---

## Task 2: Plan Tier Constants

**Why second:** Both Convex functions (`plans.setTier`) and the React UI (PlanPicker) need the same source of truth for limits. Putting it in `src/lib/billing/plan-tiers.ts` makes it importable from both server and client.

**Files:**
- Create: `src/lib/billing/plan-tiers.ts`
- Test: `tests/unit/billing/plan-tiers.test.ts`

- [ ] **Step 2.1: Write the failing test**

```typescript
// tests/unit/billing/plan-tiers.test.ts
import { describe, it, expect } from "vitest"
import {
  FREE_LIMITS,
  PRO_LIMITS,
  TEAM_LIMITS,
  DAILY_COST_CEILING_USD,
  limitsForTier,
} from "@/lib/billing/plan-tiers"

describe("plan-tiers", () => {
  it("FREE_LIMITS matches Constitution §17.2", () => {
    expect(FREE_LIMITS).toEqual({
      anthropicTokensPerMonth: 50_000,
      e2bSecondsPerMonth: 1800,        // 30 minutes
      deploymentsPerMonth: 1,
      activeProjects: 3,
    })
  })

  it("PRO_LIMITS matches Constitution §17.2", () => {
    expect(PRO_LIMITS).toEqual({
      anthropicTokensPerMonth: 2_000_000,
      e2bSecondsPerMonth: 36_000,      // 10 hours
      deploymentsPerMonth: 20,
      activeProjects: 50,
    })
  })

  it("TEAM_LIMITS matches Constitution §17.2", () => {
    expect(TEAM_LIMITS).toEqual({
      anthropicTokensPerMonth: 10_000_000,
      e2bSecondsPerMonth: 180_000,     // 50 hours
      deploymentsPerMonth: Number.POSITIVE_INFINITY,
      activeProjects: Number.POSITIVE_INFINITY,
    })
  })

  it("DAILY_COST_CEILING_USD matches Constitution §17.4", () => {
    expect(DAILY_COST_CEILING_USD).toEqual({
      free: 0.5,
      pro: 20,
      team: 100,
    })
  })

  it("limitsForTier returns FREE_LIMITS when tier=free", () => {
    expect(limitsForTier("free")).toEqual(FREE_LIMITS)
  })

  it("limitsForTier returns PRO_LIMITS when tier=pro", () => {
    expect(limitsForTier("pro")).toEqual(PRO_LIMITS)
  })

  it("limitsForTier returns TEAM_LIMITS when tier=team", () => {
    expect(limitsForTier("team")).toEqual(TEAM_LIMITS)
  })
})
```

```bash
npm run test:unit -- plan-tiers
```

Should fail: module not found.

- [ ] **Step 2.2: Implement the constants**

```typescript
// src/lib/billing/plan-tiers.ts

export type PlanTier = "free" | "pro" | "team"

export interface PlanLimits {
  anthropicTokensPerMonth: number
  e2bSecondsPerMonth: number
  deploymentsPerMonth: number
  activeProjects: number
}

export const FREE_LIMITS: PlanLimits = {
  anthropicTokensPerMonth: 50_000,
  e2bSecondsPerMonth: 1800,             // 30 minutes
  deploymentsPerMonth: 1,
  activeProjects: 3,
}

export const PRO_LIMITS: PlanLimits = {
  anthropicTokensPerMonth: 2_000_000,
  e2bSecondsPerMonth: 36_000,           // 10 hours
  deploymentsPerMonth: 20,
  activeProjects: 50,
}

export const TEAM_LIMITS: PlanLimits = {
  anthropicTokensPerMonth: 10_000_000,
  e2bSecondsPerMonth: 180_000,          // 50 hours
  deploymentsPerMonth: Number.POSITIVE_INFINITY,
  activeProjects: Number.POSITIVE_INFINITY,
}

export const DAILY_COST_CEILING_USD: Record<PlanTier, number> = {
  free: 0.5,
  pro: 20,
  team: 100,
}

export const TIER_PRICE_USD: Record<PlanTier, number> = {
  free: 0,
  pro: 29,
  team: 99,
}

export function limitsForTier(tier: PlanTier): PlanLimits {
  switch (tier) {
    case "free": return FREE_LIMITS
    case "pro":  return PRO_LIMITS
    case "team": return TEAM_LIMITS
  }
}

/**
 * Stripe price IDs are environment-specific. They live in env vars.
 * Keep the price→tier mapping here so webhook handlers can resolve a
 * subscription's tier from its line items.
 */
export function tierForStripePriceId(priceId: string): PlanTier | null {
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro"
  if (priceId === process.env.STRIPE_PRICE_TEAM) return "team"
  return null
}

export function stripePriceIdForTier(tier: PlanTier): string | null {
  if (tier === "pro")  return process.env.STRIPE_PRICE_PRO ?? null
  if (tier === "team") return process.env.STRIPE_PRICE_TEAM ?? null
  return null
}
```

```bash
npm run test:unit -- plan-tiers
```

Green.

- [ ] **Step 2.3: Commit**

```bash
git add src/lib/billing/plan-tiers.ts tests/unit/billing/plan-tiers.test.ts
git commit -m "feat(billing): add tier limits and daily ceiling constants per Constitution §17"
```

---

## Task 3: Convex Plan Functions

**Files:**
- Create: `convex/plans.ts`
- Test: `tests/unit/billing/plans-mutation.test.ts`

- [ ] **Step 3.1: Write the failing test using `convex-test`**

```typescript
// tests/unit/billing/plans-mutation.test.ts
import { describe, it, expect } from "vitest"
import { convexTest } from "convex-test"
import schema from "@/../convex/schema"
import { api } from "@/../convex/_generated/api"
import { FREE_LIMITS, PRO_LIMITS } from "@/lib/billing/plan-tiers"

describe("convex/plans", () => {
  it("get returns default-free plan when no row exists", async () => {
    const t = convexTest(schema)
    const plan = await t.query(api.plans.get, { ownerId: "user_xxx" })
    expect(plan.tier).toBe("free")
    expect(plan.status).toBe("active")
    expect(plan.limits).toEqual(FREE_LIMITS)
    expect(plan.stripeCustomerId).toBeUndefined()
  })

  it("setStripe upserts the row", async () => {
    const t = convexTest(schema)
    await t.mutation(api.plans.setStripe, {
      ownerId: "user_xxx",
      customerId: "cus_111",
      subscriptionId: "sub_222",
      status: "active",
      currentPeriodStart: 1_700_000_000_000,
      currentPeriodEnd: 1_702_592_000_000,
    })
    const plan = await t.query(api.plans.get, { ownerId: "user_xxx" })
    expect(plan.stripeCustomerId).toBe("cus_111")
    expect(plan.stripeSubscriptionId).toBe("sub_222")
    expect(plan.status).toBe("active")
  })

  it("setTier updates limits to match the new tier", async () => {
    const t = convexTest(schema)
    await t.mutation(api.plans.setTier, { ownerId: "user_xxx", tier: "pro" })
    const plan = await t.query(api.plans.get, { ownerId: "user_xxx" })
    expect(plan.tier).toBe("pro")
    expect(plan.limits).toEqual(PRO_LIMITS)
  })

  it("cancel sets status to cancelled but does not erase customer/subscription", async () => {
    const t = convexTest(schema)
    await t.mutation(api.plans.setStripe, {
      ownerId: "user_xxx",
      customerId: "cus_111",
      subscriptionId: "sub_222",
      status: "active",
      currentPeriodStart: 0,
      currentPeriodEnd: 1,
    })
    await t.mutation(api.plans.cancel, { ownerId: "user_xxx" })
    const plan = await t.query(api.plans.get, { ownerId: "user_xxx" })
    expect(plan.status).toBe("cancelled")
    expect(plan.stripeCustomerId).toBe("cus_111")  // preserved for portal access
  })
})
```

- [ ] **Step 3.2: Implement Convex plan functions**

```typescript
// convex/plans.ts
import { v } from "convex/values"
import { query, mutation } from "./_generated/server"
import { FREE_LIMITS, PRO_LIMITS, TEAM_LIMITS } from "../src/lib/billing/plan-tiers"

const limitsForTier = (tier: "free" | "pro" | "team") => {
  switch (tier) {
    case "free": return FREE_LIMITS
    case "pro":  return PRO_LIMITS
    case "team": return TEAM_LIMITS
  }
}

export const get = query({
  args: { ownerId: v.string() },
  handler: async (ctx, { ownerId }) => {
    const row = await ctx.db
      .query("plans")
      .withIndex("by_owner", q => q.eq("ownerId", ownerId))
      .unique()
    if (row) return row
    // Default-free synthetic row (NOT persisted)
    return {
      _id: undefined as unknown as string,
      ownerId,
      tier: "free" as const,
      status: "active" as const,
      limits: FREE_LIMITS,
      currentPeriodStart: 0,
      currentPeriodEnd: 0,
      updatedAt: Date.now(),
    }
  },
})

export const getByStripeCustomer = query({
  args: { customerId: v.string() },
  handler: async (ctx, { customerId }) => {
    return await ctx.db
      .query("plans")
      .withIndex("by_stripe_customer", q => q.eq("stripeCustomerId", customerId))
      .unique()
  },
})

export const setStripe = mutation({
  args: {
    ownerId: v.string(),
    customerId: v.string(),
    subscriptionId: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("past_due"),
      v.literal("cancelled"),
      v.literal("trial"),
    ),
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("plans")
      .withIndex("by_owner", q => q.eq("ownerId", args.ownerId))
      .unique()

    const patch = {
      stripeCustomerId: args.customerId,
      stripeSubscriptionId: args.subscriptionId,
      status: args.status,
      currentPeriodStart: args.currentPeriodStart,
      currentPeriodEnd: args.currentPeriodEnd,
      updatedAt: Date.now(),
    }

    if (existing) {
      await ctx.db.patch(existing._id, patch)
    } else {
      await ctx.db.insert("plans", {
        ownerId: args.ownerId,
        tier: "free",
        limits: FREE_LIMITS,
        ...patch,
      })
    }
  },
})

export const setTier = mutation({
  args: {
    ownerId: v.string(),
    tier: v.union(v.literal("free"), v.literal("pro"), v.literal("team")),
  },
  handler: async (ctx, { ownerId, tier }) => {
    const existing = await ctx.db
      .query("plans")
      .withIndex("by_owner", q => q.eq("ownerId", ownerId))
      .unique()
    const limits = limitsForTier(tier)
    if (existing) {
      await ctx.db.patch(existing._id, { tier, limits, updatedAt: Date.now() })
    } else {
      await ctx.db.insert("plans", {
        ownerId,
        tier,
        status: "active",
        limits,
        currentPeriodStart: 0,
        currentPeriodEnd: 0,
        updatedAt: Date.now(),
      })
    }
  },
})

export const cancel = mutation({
  args: { ownerId: v.string() },
  handler: async (ctx, { ownerId }) => {
    const existing = await ctx.db
      .query("plans")
      .withIndex("by_owner", q => q.eq("ownerId", ownerId))
      .unique()
    if (!existing) return
    await ctx.db.patch(existing._id, {
      status: "cancelled",
      updatedAt: Date.now(),
    })
  },
})

/**
 * Called by the daily cron when a subscription has lapsed past its
 * currentPeriodEnd — flips tier back to free and resets limits.
 */
export const revertToFree = mutation({
  args: { ownerId: v.string() },
  handler: async (ctx, { ownerId }) => {
    const existing = await ctx.db
      .query("plans")
      .withIndex("by_owner", q => q.eq("ownerId", ownerId))
      .unique()
    if (!existing) return
    await ctx.db.patch(existing._id, {
      tier: "free",
      limits: FREE_LIMITS,
      updatedAt: Date.now(),
    })
  },
})
```

- [ ] **Step 3.3: Run tests**

```bash
npm run test:unit -- plans-mutation
```

All four tests green.

- [ ] **Step 3.4: Commit**

```bash
git add convex/plans.ts tests/unit/billing/plans-mutation.test.ts
git commit -m "feat(billing): convex plans functions — get, setStripe, setTier, cancel, revertToFree"
```

---

## Task 4: Convex Stripe Event Idempotency Table

**Why now:** Webhook handler in Task 8 needs `recordIfNew(eventId)` to be a single atomic Convex call. Building it standalone now means Task 8 can be entirely about routing.

**Files:**
- Create: `convex/stripe_events.ts`

- [ ] **Step 4.1: Implement**

```typescript
// convex/stripe_events.ts
import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

/**
 * Returns true iff the event was newly recorded (i.e., not a duplicate).
 * Returns false if we've already processed this Stripe event.
 *
 * Atomicity: Convex serializes mutations against the same row, so two
 * concurrent webhook deliveries for the same eventId will see one
 * insert and one collision.
 */
export const recordIfNew = mutation({
  args: {
    eventId: v.string(),
    type: v.string(),
    payloadHash: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, type, payloadHash }) => {
    const existing = await ctx.db
      .query("stripe_events")
      .withIndex("by_event_id", q => q.eq("eventId", eventId))
      .unique()
    if (existing) return false
    await ctx.db.insert("stripe_events", {
      eventId,
      type,
      payloadHash,
      processedAt: Date.now(),
    })
    return true
  },
})

export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 50 }) => {
    return await ctx.db
      .query("stripe_events")
      .order("desc")
      .take(limit)
  },
})
```

- [ ] **Step 4.2: Smoke test**

```bash
npx convex run stripe_events:recordIfNew '{"eventId": "evt_test_1", "type": "test"}'
# → true
npx convex run stripe_events:recordIfNew '{"eventId": "evt_test_1", "type": "test"}'
# → false
```

- [ ] **Step 4.3: Commit**

```bash
git add convex/stripe_events.ts
git commit -m "feat(billing): convex stripe_events idempotency table fns"
```

---

## Task 5: Stripe Server Singleton

**Files:**
- Create: `src/lib/billing/stripe-server.ts`

- [ ] **Step 5.1: Implement**

```typescript
// src/lib/billing/stripe-server.ts
import Stripe from "stripe"

if (!process.env.STRIPE_SECRET_KEY && process.env.NODE_ENV !== "test") {
  // Don't throw at import time during tests where the mock is applied.
  console.warn("[stripe] STRIPE_SECRET_KEY not set — Stripe calls will fail")
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_dummy", {
  // Pin the API version. Bump deliberately, never silently.
  apiVersion: "2025-09-30.basil",
  typescript: true,
  // Stripe SDK retries idempotency-safe POSTs by default; keep that.
  maxNetworkRetries: 2,
  appInfo: {
    name: "Polaris",
    url: "https://build.praxiomai.xyz",
  },
})
```

- [ ] **Step 5.2: Commit**

```bash
git add src/lib/billing/stripe-server.ts
git commit -m "feat(billing): pin stripe client to 2025-09-30 api version"
```

---

## Task 6: Stripe Checkout Route

**Files:**
- Create: `src/app/api/stripe/checkout/route.ts`
- Test: `tests/unit/billing/stripe-checkout.test.ts`

- [ ] **Step 6.1: Write the failing test**

```typescript
// tests/unit/billing/stripe-checkout.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

const createSession = vi.fn()
vi.mock("@/lib/billing/stripe-server", () => ({
  stripe: { checkout: { sessions: { create: createSession } } },
}))
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user_abc" })),
}))

describe("POST /api/stripe/checkout", () => {
  beforeEach(() => {
    createSession.mockReset()
    process.env.STRIPE_PRICE_PRO = "price_pro_test"
    process.env.STRIPE_PRICE_TEAM = "price_team_test"
    process.env.NEXT_PUBLIC_APP_URL = "https://build.praxiomai.xyz"
  })

  it("creates a checkout session with client_reference_id=ownerId", async () => {
    createSession.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/x" })
    const { POST } = await import("@/app/api/stripe/checkout/route")
    const req = new Request("http://x/api/stripe/checkout", {
      method: "POST",
      body: JSON.stringify({ tier: "pro" }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      mode: "subscription",
      client_reference_id: "user_abc",
      line_items: [{ price: "price_pro_test", quantity: 1 }],
      success_url: expect.stringContaining("/billing?checkout=success"),
      cancel_url: expect.stringContaining("/billing?checkout=cancel"),
    }))
    const body = await res.json()
    expect(body.url).toBe("https://checkout.stripe.com/x")
  })

  it("rejects tier=free", async () => {
    const { POST } = await import("@/app/api/stripe/checkout/route")
    const req = new Request("http://x/api/stripe/checkout", {
      method: "POST",
      body: JSON.stringify({ tier: "free" }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@clerk/nextjs/server")
    ;(auth as any).mockResolvedValueOnce({ userId: null })
    const { POST } = await import("@/app/api/stripe/checkout/route")
    const req = new Request("http://x/api/stripe/checkout", {
      method: "POST",
      body: JSON.stringify({ tier: "pro" }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 6.2: Implement the route**

```typescript
// src/app/api/stripe/checkout/route.ts
import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { stripe } from "@/lib/billing/stripe-server"
import { stripePriceIdForTier, type PlanTier } from "@/lib/billing/plan-tiers"

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { tier?: PlanTier }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (body.tier !== "pro" && body.tier !== "team") {
    return NextResponse.json({ error: "tier must be 'pro' or 'team'" }, { status: 400 })
  }

  const priceId = stripePriceIdForTier(body.tier)
  if (!priceId) {
    return NextResponse.json({ error: "Stripe price not configured" }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://build.praxiomai.xyz"

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: userId,                  // critical: webhook attribution
    success_url: `${appUrl}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${appUrl}/billing?checkout=cancel`,
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { ownerId: userId },              // belt-and-suspenders for sub events
    },
    // Idempotency on the *creation* of the session itself; the user clicking
    // "Upgrade" twice within 60s should not create two sessions.
  }, { idempotencyKey: `checkout-${userId}-${body.tier}-${Math.floor(Date.now() / 60_000)}` })

  return NextResponse.json({ url: session.url, id: session.id })
}
```

- [ ] **Step 6.3: Run tests**

```bash
npm run test:unit -- stripe-checkout
```

- [ ] **Step 6.4: Commit**

```bash
git add src/app/api/stripe/checkout/route.ts tests/unit/billing/stripe-checkout.test.ts
git commit -m "feat(billing): stripe checkout route with client_reference_id attribution"
```

---

## Task 7: Stripe Customer Portal Route

**Files:**
- Create: `src/app/api/stripe/portal/route.ts`

- [ ] **Step 7.1: Implement**

```typescript
// src/app/api/stripe/portal/route.ts
import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { fetchQuery } from "convex/nextjs"
import { api } from "@/../convex/_generated/api"
import { stripe } from "@/lib/billing/stripe-server"

export async function POST(_req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const plan = await fetchQuery(api.plans.get, { ownerId: userId })
  if (!plan?.stripeCustomerId) {
    return NextResponse.json({ error: "No Stripe customer" }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://build.praxiomai.xyz"

  const session = await stripe.billingPortal.sessions.create({
    customer: plan.stripeCustomerId,
    return_url: `${appUrl}/billing`,
  })

  return NextResponse.json({ url: session.url })
}
```

- [ ] **Step 7.2: Commit**

```bash
git add src/app/api/stripe/portal/route.ts
git commit -m "feat(billing): stripe customer portal route"
```

---

## Task 8: Stripe Webhook Route — Verification & Idempotency

**Why split from handlers:** Verifying the signature and rejecting duplicates are the two security-critical responsibilities. Doing them in their own task lets us write tight tests against the boundary, then add handlers in Task 9 with the boundary already trusted.

**Files:**
- Create: `src/app/api/stripe/webhook/route.ts` (skeleton with verification + idempotency only)
- Create: `tests/fixtures/stripe-events.ts`
- Test: `tests/unit/billing/stripe-webhook.test.ts` (verification cases)

- [ ] **Step 8.1: Stripe event fixtures**

```typescript
// tests/fixtures/stripe-events.ts
// Captured from `stripe trigger customer.subscription.created` (test mode).
// Trim to the fields our handlers actually read.

export const subscriptionCreatedEvent = {
  id: "evt_subscription_created_1",
  type: "customer.subscription.created",
  data: {
    object: {
      id: "sub_111",
      customer: "cus_111",
      status: "active",
      current_period_start: 1_700_000_000,
      current_period_end:   1_702_592_000,
      items: { data: [{ price: { id: "price_pro_test" } }] },
      metadata: { ownerId: "user_abc" },
    },
  },
}

export const subscriptionUpdatedEvent = {
  id: "evt_subscription_updated_1",
  type: "customer.subscription.updated",
  data: {
    object: {
      id: "sub_111",
      customer: "cus_111",
      status: "active",
      current_period_start: 1_702_592_000,
      current_period_end:   1_705_184_000,
      items: { data: [{ price: { id: "price_team_test" } }] },
      metadata: { ownerId: "user_abc" },
    },
  },
}

export const subscriptionDeletedEvent = {
  id: "evt_subscription_deleted_1",
  type: "customer.subscription.deleted",
  data: {
    object: {
      id: "sub_111",
      customer: "cus_111",
      status: "canceled",
      current_period_end: 1_705_184_000,
      metadata: { ownerId: "user_abc" },
    },
  },
}

export const invoicePaymentFailedEvent = {
  id: "evt_invoice_failed_1",
  type: "invoice.payment_failed",
  data: {
    object: {
      id: "in_111",
      customer: "cus_111",
      subscription: "sub_111",
      period_start: 1_700_000_000,
      period_end:   1_702_592_000,
    },
  },
}

export const invoicePaymentSucceededEvent = {
  id: "evt_invoice_succeeded_1",
  type: "invoice.payment_succeeded",
  data: {
    object: {
      id: "in_222",
      customer: "cus_111",
      subscription: "sub_111",
      period_start: 1_702_592_000,
      period_end:   1_705_184_000,
    },
  },
}
```

- [ ] **Step 8.2: Write failing tests for verification + idempotency**

```typescript
// tests/unit/billing/stripe-webhook.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { subscriptionCreatedEvent } from "@/../tests/fixtures/stripe-events"

const constructEvent = vi.fn()
const recordIfNew  = vi.fn()
const fetchMutation = vi.fn(async (_fn: any, args: any) => {
  if (_fn?.name === "stripe_events:recordIfNew") return recordIfNew(args)
  return undefined
})

vi.mock("@/lib/billing/stripe-server", () => ({
  stripe: { webhooks: { constructEvent } },
}))
vi.mock("convex/nextjs", () => ({
  fetchMutation: (fn: any, args: any) => fetchMutation(fn, args),
  fetchQuery:    vi.fn(),
}))

describe("POST /api/stripe/webhook — verification & idempotency", () => {
  beforeEach(() => {
    constructEvent.mockReset()
    recordIfNew.mockReset()
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test"
  })

  it("returns 400 when signature header is missing", async () => {
    const { POST } = await import("@/app/api/stripe/webhook/route")
    const req = new Request("http://x/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("returns 400 when constructEvent throws (bad signature)", async () => {
    constructEvent.mockImplementation(() => { throw new Error("bad sig") })
    const { POST } = await import("@/app/api/stripe/webhook/route")
    const req = new Request("http://x/api/stripe/webhook", {
      method: "POST",
      body: "{}",
      headers: { "stripe-signature": "t=1,v1=deadbeef" },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("returns 200 and short-circuits when event is duplicate", async () => {
    constructEvent.mockReturnValue(subscriptionCreatedEvent)
    recordIfNew.mockResolvedValue(false)               // duplicate
    const { POST } = await import("@/app/api/stripe/webhook/route")
    const req = new Request("http://x/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify(subscriptionCreatedEvent),
      headers: { "stripe-signature": "t=1,v1=ok" },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ received: true, duplicate: true })
  })

  it("calls constructEvent with raw body, sig header, and webhook secret", async () => {
    constructEvent.mockReturnValue(subscriptionCreatedEvent)
    recordIfNew.mockResolvedValue(false)               // short-circuit; we only check verify
    const raw = JSON.stringify(subscriptionCreatedEvent)
    const { POST } = await import("@/app/api/stripe/webhook/route")
    const req = new Request("http://x/api/stripe/webhook", {
      method: "POST",
      body: raw,
      headers: { "stripe-signature": "t=1,v1=ok" },
    })
    await POST(req)
    expect(constructEvent).toHaveBeenCalledWith(raw, "t=1,v1=ok", "whsec_test")
  })
})
```

- [ ] **Step 8.3: Implement skeleton**

```typescript
// src/app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server"
import { fetchMutation } from "convex/nextjs"
import { api } from "@/../convex/_generated/api"
import { stripe } from "@/lib/billing/stripe-server"
import type Stripe from "stripe"

// Stripe sends raw bytes; we MUST NOT use Next's automatic JSON parsing.
export const runtime = "nodejs"

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature")
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 })

  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET unset")
    return NextResponse.json({ error: "Misconfigured" }, { status: 500 })
  }

  const rawBody = await req.text()                    // text(), not json()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret)
  } catch (err) {
    console.warn("[stripe-webhook] signature verification failed:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  // Idempotency: insert event row; if it already existed, we've processed it.
  const isNew = await fetchMutation(api.stripe_events.recordIfNew, {
    eventId: event.id,
    type: event.type,
  })
  if (!isNew) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  // Handlers added in Task 9
  try {
    await routeEvent(event)
  } catch (err) {
    console.error("[stripe-webhook] handler error:", err)
    // Return 500 so Stripe retries — but only if the failure was transient.
    // Permanent failures (e.g. missing ownerId) we log+ack to avoid retry storm.
    return NextResponse.json({ error: "Handler failed" }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

// Stub — Task 9 fills this in
async function routeEvent(_event: Stripe.Event): Promise<void> {
  return
}
```

- [ ] **Step 8.4: Run tests**

```bash
npm run test:unit -- stripe-webhook
```

All four cases green.

- [ ] **Step 8.5: Commit**

```bash
git add src/app/api/stripe/webhook/route.ts tests/fixtures/stripe-events.ts tests/unit/billing/stripe-webhook.test.ts
git commit -m "feat(billing): stripe webhook signature verification + idempotency"
```

---

## Task 9: Stripe Webhook Route — Event Handlers

**Files:**
- Modify: `src/app/api/stripe/webhook/route.ts` (fill in `routeEvent`)
- Modify: `tests/unit/billing/stripe-webhook.test.ts` (add handler-routing cases)

- [ ] **Step 9.1: Add failing tests for each event type**

Append to `tests/unit/billing/stripe-webhook.test.ts`:

```typescript
import {
  subscriptionUpdatedEvent,
  subscriptionDeletedEvent,
  invoicePaymentFailedEvent,
  invoicePaymentSucceededEvent,
} from "@/../tests/fixtures/stripe-events"

describe("POST /api/stripe/webhook — handlers", () => {
  const setStripe = vi.fn()
  const setTier = vi.fn()
  const cancel = vi.fn()
  const getByCustomer = vi.fn()

  beforeEach(() => {
    constructEvent.mockReset()
    recordIfNew.mockReset()
    setStripe.mockReset()
    setTier.mockReset()
    cancel.mockReset()
    getByCustomer.mockReset()

    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test"
    process.env.STRIPE_PRICE_PRO = "price_pro_test"
    process.env.STRIPE_PRICE_TEAM = "price_team_test"

    fetchMutation.mockImplementation(async (fn: any, args: any) => {
      const name = (fn as any)._name ?? fn?.name ?? ""
      if (name.endsWith("recordIfNew")) return recordIfNew(args)
      if (name.endsWith("setStripe"))   return setStripe(args)
      if (name.endsWith("setTier"))     return setTier(args)
      if (name.endsWith("cancel"))      return cancel(args)
      return undefined
    })
    // Convex functions are typically referenced as object refs; emulate _name:
    ;(api.plans as any).setStripe._name  = "plans:setStripe"
    ;(api.plans as any).setTier._name    = "plans:setTier"
    ;(api.plans as any).cancel._name     = "plans:cancel"
    ;(api.stripe_events as any).recordIfNew._name = "stripe_events:recordIfNew"

    recordIfNew.mockResolvedValue(true)                // every test below: new event
  })

  it("customer.subscription.created → setStripe + setTier(pro)", async () => {
    constructEvent.mockReturnValue(subscriptionCreatedEvent)
    const { POST } = await import("@/app/api/stripe/webhook/route")
    const res = await POST(new Request("http://x", {
      method: "POST",
      body: JSON.stringify(subscriptionCreatedEvent),
      headers: { "stripe-signature": "t=1,v1=ok" },
    }))
    expect(res.status).toBe(200)
    expect(setStripe).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: "user_abc",
      customerId: "cus_111",
      subscriptionId: "sub_111",
      status: "active",
    }))
    expect(setTier).toHaveBeenCalledWith({ ownerId: "user_abc", tier: "pro" })
  })

  it("customer.subscription.updated → setStripe + setTier(team)", async () => {
    constructEvent.mockReturnValue(subscriptionUpdatedEvent)
    const { POST } = await import("@/app/api/stripe/webhook/route")
    await POST(new Request("http://x", {
      method: "POST",
      body: JSON.stringify(subscriptionUpdatedEvent),
      headers: { "stripe-signature": "t=1,v1=ok" },
    }))
    expect(setTier).toHaveBeenCalledWith({ ownerId: "user_abc", tier: "team" })
  })

  it("customer.subscription.deleted → cancel", async () => {
    constructEvent.mockReturnValue(subscriptionDeletedEvent)
    const { POST } = await import("@/app/api/stripe/webhook/route")
    await POST(new Request("http://x", {
      method: "POST",
      body: JSON.stringify(subscriptionDeletedEvent),
      headers: { "stripe-signature": "t=1,v1=ok" },
    }))
    expect(cancel).toHaveBeenCalledWith({ ownerId: "user_abc" })
  })

  it("invoice.payment_failed → setStripe with status=past_due", async () => {
    constructEvent.mockReturnValue(invoicePaymentFailedEvent)
    getByCustomer.mockResolvedValue({ ownerId: "user_abc" })
    const { POST } = await import("@/app/api/stripe/webhook/route")
    await POST(new Request("http://x", {
      method: "POST",
      body: JSON.stringify(invoicePaymentFailedEvent),
      headers: { "stripe-signature": "t=1,v1=ok" },
    }))
    expect(setStripe).toHaveBeenCalledWith(expect.objectContaining({ status: "past_due" }))
  })

  it("invoice.payment_succeeded → setStripe with status=active", async () => {
    constructEvent.mockReturnValue(invoicePaymentSucceededEvent)
    getByCustomer.mockResolvedValue({ ownerId: "user_abc" })
    const { POST } = await import("@/app/api/stripe/webhook/route")
    await POST(new Request("http://x", {
      method: "POST",
      body: JSON.stringify(invoicePaymentSucceededEvent),
      headers: { "stripe-signature": "t=1,v1=ok" },
    }))
    expect(setStripe).toHaveBeenCalledWith(expect.objectContaining({ status: "active" }))
  })
})
```

- [ ] **Step 9.2: Implement `routeEvent`**

Replace the `routeEvent` stub in `src/app/api/stripe/webhook/route.ts`:

```typescript
import { fetchMutation, fetchQuery } from "convex/nextjs"
import { tierForStripePriceId } from "@/lib/billing/plan-tiers"
import type Stripe from "stripe"

async function routeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription
      const ownerId = await resolveOwnerIdFromSubscription(sub)
      if (!ownerId) {
        console.error("[stripe-webhook] no ownerId for subscription", sub.id)
        return
      }
      await fetchMutation(api.plans.setStripe, {
        ownerId,
        customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
        subscriptionId: sub.id,
        status: mapSubscriptionStatus(sub.status),
        currentPeriodStart: sub.current_period_start * 1000,
        currentPeriodEnd:   sub.current_period_end   * 1000,
      })
      const priceId = sub.items.data[0]?.price.id
      const tier = priceId ? tierForStripePriceId(priceId) : null
      if (tier) {
        await fetchMutation(api.plans.setTier, { ownerId, tier })
      }
      return
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription
      const ownerId = await resolveOwnerIdFromSubscription(sub)
      if (!ownerId) return
      // Mark cancelled now; the daily cron will revertToFree at currentPeriodEnd.
      await fetchMutation(api.plans.cancel, { ownerId })
      return
    }
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice
      const ownerId = await resolveOwnerIdFromCustomer(inv.customer)
      if (!ownerId) return
      await fetchMutation(api.plans.setStripe, {
        ownerId,
        customerId: typeof inv.customer === "string" ? inv.customer : inv.customer!.id,
        subscriptionId: typeof inv.subscription === "string" ? inv.subscription : undefined,
        status: "past_due",
        currentPeriodStart: (inv.period_start ?? 0) * 1000,
        currentPeriodEnd:   (inv.period_end   ?? 0) * 1000,
      })
      return
    }
    case "invoice.payment_succeeded": {
      const inv = event.data.object as Stripe.Invoice
      const ownerId = await resolveOwnerIdFromCustomer(inv.customer)
      if (!ownerId) return
      await fetchMutation(api.plans.setStripe, {
        ownerId,
        customerId: typeof inv.customer === "string" ? inv.customer : inv.customer!.id,
        subscriptionId: typeof inv.subscription === "string" ? inv.subscription : undefined,
        status: "active",
        currentPeriodStart: (inv.period_start ?? 0) * 1000,
        currentPeriodEnd:   (inv.period_end   ?? 0) * 1000,
      })
      return
    }
    default:
      // Unknown event types are recorded (idempotency) but otherwise ignored.
      return
  }
}

function mapSubscriptionStatus(s: Stripe.Subscription.Status): "active" | "past_due" | "cancelled" | "trial" {
  switch (s) {
    case "trialing": return "trial"
    case "active":   return "active"
    case "past_due": return "past_due"
    case "unpaid":   return "past_due"
    case "canceled": return "cancelled"
    case "incomplete":
    case "incomplete_expired":
    case "paused":
      return "past_due"
  }
}

async function resolveOwnerIdFromSubscription(sub: Stripe.Subscription): Promise<string | null> {
  // Preferred: metadata.ownerId set in checkout (Task 6)
  if (typeof sub.metadata?.ownerId === "string" && sub.metadata.ownerId) {
    return sub.metadata.ownerId
  }
  // Fallback: look up by customer
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id
  return await resolveOwnerIdFromCustomer(customerId)
}

async function resolveOwnerIdFromCustomer(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): Promise<string | null> {
  if (!customer) return null
  const id = typeof customer === "string" ? customer : customer.id
  const plan = await fetchQuery(api.plans.getByStripeCustomer, { customerId: id })
  return plan?.ownerId ?? null
}
```

- [ ] **Step 9.3: Run tests**

```bash
npm run test:unit -- stripe-webhook
```

All ten cases green.

- [ ] **Step 9.4: Commit**

```bash
git add src/app/api/stripe/webhook/route.ts tests/unit/billing/stripe-webhook.test.ts
git commit -m "feat(billing): stripe webhook handlers for the 5 subscription events"
```

---

## Task 10: Quota Enforcement Middleware

**Files:**
- Create: `src/lib/billing/enforce-quota.ts`
- Create: `src/lib/billing/cost-math.ts`
- Test: `tests/unit/billing/enforce-quota.test.ts`
- Test: `tests/unit/billing/cost-math.test.ts`

- [ ] **Step 10.1: Cost math helpers — failing tests first**

```typescript
// tests/unit/billing/cost-math.test.ts
import { describe, it, expect } from "vitest"
import { tokensCostUsd, e2bSecondsCostUsd, totalCostUsd } from "@/lib/billing/cost-math"

describe("cost-math", () => {
  it("tokens: 1M input + 0 output costs $3", () => {
    expect(tokensCostUsd(1_000_000, 0)).toBeCloseTo(3, 6)
  })
  it("tokens: 0 input + 1M output costs $15", () => {
    expect(tokensCostUsd(0, 1_000_000)).toBeCloseTo(15, 6)
  })
  it("tokens: mixed 500k + 100k = $1.5 + $1.5 = $3.00", () => {
    expect(tokensCostUsd(500_000, 100_000)).toBeCloseTo(3.0, 6)
  })
  it("e2b: 3600 seconds = $0.81", () => {
    expect(e2bSecondsCostUsd(3600)).toBeCloseTo(0.81, 4)
  })
  it("totalCostUsd sums tokens + e2b", () => {
    expect(totalCostUsd({ inputTokens: 1_000_000, outputTokens: 0, e2bSeconds: 3600 })).toBeCloseTo(3.81, 4)
  })
})
```

```typescript
// src/lib/billing/cost-math.ts
// Rates per Constitution §17.1 (locked 2026).

export const ANTHROPIC_INPUT_COST_PER_TOKEN  = 3 / 1_000_000     // $3 / 1M
export const ANTHROPIC_OUTPUT_COST_PER_TOKEN = 15 / 1_000_000    // $15 / 1M
export const E2B_COST_PER_SECOND             = 0.000225          // ~$0.81/hr

export function tokensCostUsd(input: number, output: number): number {
  return input  * ANTHROPIC_INPUT_COST_PER_TOKEN
       + output * ANTHROPIC_OUTPUT_COST_PER_TOKEN
}

export function e2bSecondsCostUsd(seconds: number): number {
  return seconds * E2B_COST_PER_SECOND
}

export function totalCostUsd(args: { inputTokens: number; outputTokens: number; e2bSeconds: number }): number {
  return tokensCostUsd(args.inputTokens, args.outputTokens) + e2bSecondsCostUsd(args.e2bSeconds)
}
```

- [ ] **Step 10.2: Quota check — failing tests**

```typescript
// tests/unit/billing/enforce-quota.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { FREE_LIMITS } from "@/lib/billing/plan-tiers"

const fetchQuery = vi.fn()
vi.mock("convex/nextjs", () => ({ fetchQuery: (...a: any[]) => fetchQuery(...a) }))

describe("checkQuota", () => {
  beforeEach(() => fetchQuery.mockReset())

  function mockPlanAndUsage(planLimits = FREE_LIMITS, used = { anthropicTokens: 0, e2bSeconds: 0, deployments: 0 }, activeProjects = 0) {
    fetchQuery
      .mockResolvedValueOnce({ tier: "free", status: "active", limits: planLimits })  // plans:get
      .mockResolvedValueOnce(used)                                                     // usage:current
      .mockResolvedValueOnce(activeProjects)                                            // projects:countActive
  }

  it("under limit returns ok", async () => {
    mockPlanAndUsage(FREE_LIMITS, { anthropicTokens: 1_000, e2bSeconds: 0, deployments: 0 })
    const { checkQuota } = await import("@/lib/billing/enforce-quota")
    const result = await checkQuota("user_abc", "anthropicTokens", 1_000)
    expect(result.ok).toBe(true)
  })

  it("at limit returns QUOTA_EXCEEDED", async () => {
    mockPlanAndUsage(FREE_LIMITS, { anthropicTokens: 50_000, e2bSeconds: 0, deployments: 0 })
    const { checkQuota } = await import("@/lib/billing/enforce-quota")
    const result = await checkQuota("user_abc", "anthropicTokens", 1)
    expect(result).toMatchObject({ ok: false, errorCode: "QUOTA_EXCEEDED", limit: 50_000, used: 50_000 })
  })

  it("ahead of limit (used + amount > limit) returns QUOTA_EXCEEDED", async () => {
    mockPlanAndUsage(FREE_LIMITS, { anthropicTokens: 49_999, e2bSeconds: 0, deployments: 0 })
    const { checkQuota } = await import("@/lib/billing/enforce-quota")
    const result = await checkQuota("user_abc", "anthropicTokens", 100)
    expect(result.ok).toBe(false)
  })

  it("e2bSeconds quota is checked against e2bSecondsPerMonth", async () => {
    mockPlanAndUsage(FREE_LIMITS, { anthropicTokens: 0, e2bSeconds: 1799, deployments: 0 })
    const { checkQuota } = await import("@/lib/billing/enforce-quota")
    const result = await checkQuota("user_abc", "e2bSeconds", 5)
    expect(result.ok).toBe(false)
  })

  it("deployments quota is checked against deploymentsPerMonth", async () => {
    mockPlanAndUsage(FREE_LIMITS, { anthropicTokens: 0, e2bSeconds: 0, deployments: 1 })
    const { checkQuota } = await import("@/lib/billing/enforce-quota")
    const result = await checkQuota("user_abc", "deployments", 1)
    expect(result.ok).toBe(false)
  })

  it("activeProjects quota is checked against projects:countActive query", async () => {
    mockPlanAndUsage(FREE_LIMITS, { anthropicTokens: 0, e2bSeconds: 0, deployments: 0 }, 3)
    const { checkQuota } = await import("@/lib/billing/enforce-quota")
    const result = await checkQuota("user_abc", "activeProjects", 1)
    expect(result.ok).toBe(false)
  })

  it("amount defaults to 1 when omitted", async () => {
    mockPlanAndUsage(FREE_LIMITS, { anthropicTokens: 49_999, e2bSeconds: 0, deployments: 0 })
    const { checkQuota } = await import("@/lib/billing/enforce-quota")
    const result = await checkQuota("user_abc", "anthropicTokens")
    expect(result.ok).toBe(true)
  })

  it("error result includes upgradeUrl=/billing", async () => {
    mockPlanAndUsage(FREE_LIMITS, { anthropicTokens: 50_000 })
    const { checkQuota } = await import("@/lib/billing/enforce-quota")
    const r = await checkQuota("user_abc", "anthropicTokens", 1)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.upgradeUrl).toBe("/billing")
  })
})
```

- [ ] **Step 10.3: Implement**

```typescript
// src/lib/billing/enforce-quota.ts
import { fetchQuery } from "convex/nextjs"
import { api } from "@/../convex/_generated/api"

export type QuotaType = "anthropicTokens" | "e2bSeconds" | "deployments" | "activeProjects"

export type QuotaResult =
  | { ok: true }
  | {
      ok: false
      errorCode: "QUOTA_EXCEEDED"
      type: QuotaType
      limit: number
      used: number
      upgradeUrl: string
    }

export async function checkQuota(
  ownerId: string,
  type: QuotaType,
  amount: number = 1,
): Promise<QuotaResult> {
  const plan = await fetchQuery(api.plans.get, { ownerId })
  const yearMonth = currentYearMonth()
  const usage = await fetchQuery(api.usage.current, { ownerId, yearMonth })

  let used = 0
  let limit = 0

  if (type === "anthropicTokens") {
    used  = usage?.anthropicTokens ?? 0
    limit = plan.limits.anthropicTokensPerMonth
  } else if (type === "e2bSeconds") {
    used  = usage?.e2bSeconds ?? 0
    limit = plan.limits.e2bSecondsPerMonth
  } else if (type === "deployments") {
    used  = usage?.deployments ?? 0
    limit = plan.limits.deploymentsPerMonth
  } else if (type === "activeProjects") {
    used  = await fetchQuery(api.projects.countActive, { ownerId })
    limit = plan.limits.activeProjects
  }

  if (limit === Number.POSITIVE_INFINITY) return { ok: true }
  if (used + amount > limit) {
    return {
      ok: false,
      errorCode: "QUOTA_EXCEEDED",
      type,
      limit,
      used,
      upgradeUrl: "/billing",
    }
  }
  return { ok: true }
}

export class QuotaExceededError extends Error {
  constructor(public detail: Extract<QuotaResult, { ok: false }>) {
    super(`Quota exceeded: ${detail.type} (used=${detail.used}, limit=${detail.limit})`)
    this.name = "QuotaExceededError"
  }
}

function currentYearMonth(d = new Date()): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  return `${y}-${m}`
}
```

> **Note:** `api.projects.countActive` is a thin Convex query: count projects where `ownerId == args.ownerId && deletedAt == undefined`. Add it in `convex/projects.ts` if it does not yet exist (sub-plan 02 should already define `projects` schema; if `countActive` is missing, add it as part of this task).

- [ ] **Step 10.4: Add `convex/projects.countActive` if missing**

```typescript
// convex/projects.ts (add)
export const countActive = query({
  args: { ownerId: v.string() },
  handler: async (ctx, { ownerId }) => {
    const rows = await ctx.db
      .query("projects")
      .withIndex("by_owner", q => q.eq("ownerId", ownerId))
      .filter(q => q.eq(q.field("deletedAt"), undefined))
      .collect()
    return rows.length
  },
})
```

- [ ] **Step 10.5: Run tests**

```bash
npm run test:unit -- enforce-quota cost-math
```

- [ ] **Step 10.6: Commit**

```bash
git add src/lib/billing/cost-math.ts src/lib/billing/enforce-quota.ts \
        tests/unit/billing/cost-math.test.ts tests/unit/billing/enforce-quota.test.ts \
        convex/projects.ts
git commit -m "feat(billing): checkQuota middleware + cost-math helpers"
```

---

## Task 11: Wire `checkQuota` into Agent Loop, Sandbox, Deploy, Project Create

**Why explicit task:** This is the part most easily forgotten. Each enforcement point must:
1. Call `checkQuota` BEFORE doing the work.
2. Translate the failure into a domain error visible to the user.

**Files:**
- Modify: `src/features/conversations/inngest/process-message.ts`
- Modify: `src/lib/sandbox/ensure-sandbox.ts` (sub-plan 02)
- Modify: `src/features/projects/server/deploy-project.ts` (sub-plan 06)
- Modify: `src/features/projects/server/create-project.ts`

- [ ] **Step 11.1: Agent loop — pre-call check**

In `process-message.ts`, just before `agentRunner.run()`:

```typescript
import { checkQuota, QuotaExceededError } from "@/lib/billing/enforce-quota"
import { checkDailyCeiling } from "@/lib/billing/daily-ceiling"

// ... inside the Inngest function body ...

// Estimate token cost. For pre-flight we use a conservative bound:
// max model output tokens (8192) + a token-per-char of system+messages.
const estimatedTokens = estimateMaxTokens(messages)
const quota = await checkQuota(ownerId, "anthropicTokens", estimatedTokens)
if (!quota.ok) {
  await convex.mutation(api.messages.appendText, {
    messageId,
    text: `**Quota exceeded.** You've used ${quota.used.toLocaleString()} of ${quota.limit.toLocaleString()} tokens this month. [Upgrade](${quota.upgradeUrl})`,
  })
  await convex.mutation(api.messages.setStatus, { messageId, status: "quota_exceeded" })
  return
}

const ceiling = await checkDailyCeiling(ownerId)
if (!ceiling.ok) {
  await convex.mutation(api.messages.appendText, {
    messageId,
    text: `**Daily cost ceiling reached** ($${ceiling.costUsd.toFixed(2)} / $${ceiling.ceiling}). Try again tomorrow or upgrade your plan.`,
  })
  await convex.mutation(api.messages.setStatus, { messageId, status: "quota_exceeded" })
  return
}
```

- [ ] **Step 11.2: Sandbox — pre-spawn check**

In `ensureSandbox(ownerId, projectId)`:

```typescript
const quota = await checkQuota(ownerId, "e2bSeconds", 60)  // expect ≥1 minute
if (!quota.ok) throw new QuotaExceededError(quota)
```

- [ ] **Step 11.3: Deploy — pre-deploy check**

In `deployProject(ownerId, projectId)`:

```typescript
const quota = await checkQuota(ownerId, "deployments", 1)
if (!quota.ok) throw new QuotaExceededError(quota)
```

After deploy succeeds, increment `usage.deployments` (the existing `usage:increment` mutation from sub-plan 01 supports this if it accepts a `deployments` field; if not, extend it with `deployments?: number`).

- [ ] **Step 11.4: Create project — pre-create check**

```typescript
const quota = await checkQuota(ownerId, "activeProjects", 1)
if (!quota.ok) throw new QuotaExceededError(quota)
```

- [ ] **Step 11.5: Manual smoke test**

Set `FREE_LIMITS.anthropicTokensPerMonth = 100` temporarily; run a single message; observe quota_exceeded message in conversation. Revert constant before commit.

- [ ] **Step 11.6: Commit**

```bash
git add src/features/conversations/inngest/process-message.ts \
        src/lib/sandbox/ensure-sandbox.ts \
        src/features/projects/server/deploy-project.ts \
        src/features/projects/server/create-project.ts
git commit -m "feat(billing): enforce quotas at all 4 spend boundaries"
```

---

## Task 12: Daily Cost Ceiling

**Files:**
- Create: `src/lib/billing/daily-ceiling.ts`
- Test: `tests/unit/billing/daily-ceiling.test.ts`

- [ ] **Step 12.1: Failing test**

```typescript
// tests/unit/billing/daily-ceiling.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

const fetchQuery = vi.fn()
vi.mock("convex/nextjs", () => ({ fetchQuery: (...a: any[]) => fetchQuery(...a) }))

describe("checkDailyCeiling", () => {
  beforeEach(() => fetchQuery.mockReset())

  it("free user under $0.50: ok=true", async () => {
    fetchQuery
      .mockResolvedValueOnce({ tier: "free" })                                  // plans:get
      .mockResolvedValueOnce({ inputTokens: 10_000, outputTokens: 1_000, e2bSeconds: 60 })  // usage:today
    const { checkDailyCeiling } = await import("@/lib/billing/daily-ceiling")
    const r = await checkDailyCeiling("u")
    // 10_000 * 3e-6 + 1_000 * 15e-6 + 60 * 0.000225 = 0.03 + 0.015 + 0.0135 = 0.0585
    expect(r.ok).toBe(true)
    expect(r.costUsd).toBeCloseTo(0.0585, 4)
    expect(r.ceiling).toBe(0.5)
  })

  it("pro user at $20.01: ok=false", async () => {
    fetchQuery
      .mockResolvedValueOnce({ tier: "pro" })
      .mockResolvedValueOnce({ inputTokens: 6_700_000, outputTokens: 0, e2bSeconds: 0 })  // 6.7M * 3e-6 = $20.10
    const { checkDailyCeiling } = await import("@/lib/billing/daily-ceiling")
    const r = await checkDailyCeiling("u")
    expect(r.ok).toBe(false)
    expect(r.costUsd).toBeGreaterThan(20)
    expect(r.ceiling).toBe(20)
  })

  it("team user at $99.99: ok=true; at $100.01: ok=false", async () => {
    fetchQuery.mockResolvedValueOnce({ tier: "team" })
              .mockResolvedValueOnce({ inputTokens: 33_330_000, outputTokens: 0, e2bSeconds: 0 })
    const { checkDailyCeiling } = await import("@/lib/billing/daily-ceiling")
    const r = await checkDailyCeiling("u")
    expect(r.ok).toBe(true)

    fetchQuery.mockResolvedValueOnce({ tier: "team" })
              .mockResolvedValueOnce({ inputTokens: 33_340_000, outputTokens: 0, e2bSeconds: 0 })
    const r2 = await checkDailyCeiling("u")
    expect(r2.ok).toBe(false)
  })
})
```

- [ ] **Step 12.2: Implement**

```typescript
// src/lib/billing/daily-ceiling.ts
import { fetchQuery } from "convex/nextjs"
import { api } from "@/../convex/_generated/api"
import { DAILY_COST_CEILING_USD } from "@/lib/billing/plan-tiers"
import { totalCostUsd } from "@/lib/billing/cost-math"

export interface DailyCeilingResult {
  ok: boolean
  costUsd: number
  ceiling: number
}

export async function checkDailyCeiling(ownerId: string): Promise<DailyCeilingResult> {
  const plan = await fetchQuery(api.plans.get, { ownerId })
  const today = new Date().toISOString().slice(0, 10)            // "2026-04-26"

  // Note: requires a `usage:today` query that aggregates the day's usage.
  // We add it in Step 12.3 below if it doesn't exist.
  const usage = await fetchQuery(api.usage.today, { ownerId, day: today })
  const costUsd = totalCostUsd({
    inputTokens:  usage?.inputTokens  ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    e2bSeconds:   usage?.e2bSeconds   ?? 0,
  })
  const ceiling = DAILY_COST_CEILING_USD[plan.tier]
  return { ok: costUsd <= ceiling, costUsd, ceiling }
}
```

- [ ] **Step 12.3: Add `usage.today` Convex query**

If sub-plan 01's `convex/usage.ts` does not have per-day breakdown, add a `usage_daily` table or extend `usage` with `dayCounts`. Simplest: add an `events` log and aggregate. For v1 scope, accept that "today" is approximated by the running monthly counter clipped to today via a separate `usage_daily` table written by the same `increment` mutation:

```typescript
// convex/usage.ts (extend)
usage_daily: defineTable({
  ownerId: v.string(),
  day: v.string(),                       // "2026-04-26"
  inputTokens: v.number(),
  outputTokens: v.number(),
  e2bSeconds: v.number(),
  deployments: v.number(),
  updatedAt: v.number(),
}).index("by_owner_day", ["ownerId", "day"])

export const today = query({
  args: { ownerId: v.string(), day: v.string() },
  handler: async (ctx, { ownerId, day }) => {
    return await ctx.db
      .query("usage_daily")
      .withIndex("by_owner_day", q => q.eq("ownerId", ownerId).eq("day", day))
      .unique()
  },
})
```

Modify `usage.increment` to also write to `usage_daily` (idempotent same-key upsert).

- [ ] **Step 12.4: Run tests**

```bash
npm run test:unit -- daily-ceiling
```

- [ ] **Step 12.5: Commit**

```bash
git add src/lib/billing/daily-ceiling.ts tests/unit/billing/daily-ceiling.test.ts convex/usage.ts convex/schema.ts
git commit -m "feat(billing): daily cost ceiling check + usage_daily aggregation"
```

---

## Task 13: Inngest — Track E2B Usage Cron

**Why a cron:** E2B sandboxes can stream-die or be killed externally; we can't reliably increment usage on session-end alone. A 5-minute cron reads the `projects.sandboxLastAlive` deltas and bumps `usage.e2bSeconds`.

**Files:**
- Create: `src/inngest/functions/track-e2b-usage.ts`
- Modify: `src/app/api/inngest/route.ts` (register function)

- [ ] **Step 13.1: Implement**

```typescript
// src/inngest/functions/track-e2b-usage.ts
import { inngest } from "@/inngest/client"
import { fetchMutation, fetchQuery } from "convex/nextjs"
import { api } from "@/../convex/_generated/api"

/**
 * Every 5 minutes, scan active sandbox sessions and accrue elapsed
 * seconds into `usage.e2bSeconds` per owner.
 *
 * Source of truth: each `sandbox_sessions` row has `startedAt`,
 * optional `endedAt`, and `lastAccountedAt`. We charge the delta
 * between `lastAccountedAt` and min(now, endedAt), then bump
 * `lastAccountedAt`.
 */
export const trackE2bUsage = inngest.createFunction(
  { id: "track-e2b-usage", name: "Track E2B sandbox usage" },
  { cron: "*/5 * * * *" },
  async ({ step }) => {
    const now = Date.now()
    const sessions = await step.run("fetch-active-sessions", async () =>
      fetchQuery(api.sandbox_sessions.listChargeable, {})
    )

    for (const sess of sessions) {
      await step.run(`charge-${sess._id}`, async () => {
        const cap = sess.endedAt ?? now
        const seconds = Math.max(0, Math.floor((cap - sess.lastAccountedAt) / 1000))
        if (seconds === 0) return
        await fetchMutation(api.usage.increment, {
          ownerId: sess.ownerId,
          yearMonth: yearMonth(new Date(now)),
          e2bSeconds: seconds,
        })
        await fetchMutation(api.sandbox_sessions.markAccounted, {
          id: sess._id,
          lastAccountedAt: cap,
        })
      })
    }
  },
)

function yearMonth(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}
```

> **Sub-plan 02 dependency:** `sandbox_sessions` is owned by sub-plan 02. If 02 has not yet created it, this task creates it as a stub: `{ ownerId, projectId, sandboxId, startedAt, endedAt?, lastAccountedAt }` with `by_chargeable` index (status != ended OR lastAccountedAt < endedAt).

- [ ] **Step 13.2: Register**

In `src/app/api/inngest/route.ts`:

```typescript
import { trackE2bUsage } from "@/inngest/functions/track-e2b-usage"
// ... functions: [processMessage, trackE2bUsage, ...]
```

- [ ] **Step 13.3: Smoke test**

Manually trigger the cron via Inngest dev dashboard. Verify `usage.e2bSeconds` ticks up by ~300 per active sandbox.

- [ ] **Step 13.4: Commit**

```bash
git add src/inngest/functions/track-e2b-usage.ts src/app/api/inngest/route.ts
git commit -m "feat(billing): inngest cron — accrue e2b seconds every 5 minutes"
```

---

## Task 14: Inngest — Daily Ceiling Alert Cron

**Files:**
- Create: `src/inngest/functions/daily-ceiling-alert.ts`

- [ ] **Step 14.1: Implement**

```typescript
// src/inngest/functions/daily-ceiling-alert.ts
import { inngest } from "@/inngest/client"
import { fetchQuery } from "convex/nextjs"
import { api } from "@/../convex/_generated/api"
import { DAILY_COST_CEILING_USD } from "@/lib/billing/plan-tiers"
import { totalCostUsd } from "@/lib/billing/cost-math"
import { sendEmail } from "@/lib/email"  // resend wrapper; no-ops if RESEND_API_KEY unset

/**
 * Every hour, scan active users; if today's spend crosses 80% or 100%
 * of their tier ceiling, email them once per threshold per day.
 */
export const dailyCeilingAlert = inngest.createFunction(
  { id: "daily-ceiling-alert", name: "Daily ceiling alert" },
  { cron: "0 * * * *" },
  async ({ step }) => {
    const today = new Date().toISOString().slice(0, 10)
    const rows = await step.run("fetch-today-usage", async () =>
      fetchQuery(api.usage.allForDay, { day: today })
    )

    for (const row of rows) {
      await step.run(`alert-${row.ownerId}`, async () => {
        const plan = await fetchQuery(api.plans.get, { ownerId: row.ownerId })
        const cost = totalCostUsd({
          inputTokens:  row.inputTokens,
          outputTokens: row.outputTokens,
          e2bSeconds:   row.e2bSeconds,
        })
        const ceiling = DAILY_COST_CEILING_USD[plan.tier]
        const pct = cost / ceiling

        if (pct >= 1.0 && !row.alerted100) {
          await sendEmail(row.ownerId, "ceiling-100", { cost, ceiling })
          await fetchQuery(api.usage.markAlerted, { ownerId: row.ownerId, day: today, level: 100 })
        } else if (pct >= 0.8 && !row.alerted80) {
          await sendEmail(row.ownerId, "ceiling-80", { cost, ceiling })
          await fetchQuery(api.usage.markAlerted, { ownerId: row.ownerId, day: today, level: 80 })
        }
      })
    }
  },
)
```

- [ ] **Step 14.2: Register and commit**

```bash
git add src/inngest/functions/daily-ceiling-alert.ts src/app/api/inngest/route.ts
git commit -m "feat(billing): hourly cron — email at 80% and 100% of daily ceiling"
```

---

## Task 15: PlanPicker Component

**Files:**
- Create: `src/features/billing/components/plan-picker.tsx`

- [ ] **Step 15.1: Implement**

```tsx
// src/features/billing/components/plan-picker.tsx
"use client"

import { useState } from "react"
import { FREE_LIMITS, PRO_LIMITS, TEAM_LIMITS, TIER_PRICE_USD } from "@/lib/billing/plan-tiers"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card"

type Tier = "free" | "pro" | "team"

const COPY: Record<Tier, { title: string; tagline: string; limits: typeof FREE_LIMITS; cta: string }> = {
  free: { title: "Free",  tagline: "Try Polaris on a small project", limits: FREE_LIMITS, cta: "Current plan" },
  pro:  { title: "Pro",   tagline: "Build real products",            limits: PRO_LIMITS,  cta: "Upgrade to Pro" },
  team: { title: "Team",  tagline: "For organizations",              limits: TEAM_LIMITS, cta: "Upgrade to Team" },
}

export function PlanPicker({ currentTier }: { currentTier: Tier }) {
  const [busy, setBusy] = useState<Tier | null>(null)

  async function upgrade(tier: Tier) {
    if (tier === "free") return
    setBusy(tier)
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      })
      const { url, error } = await res.json()
      if (!res.ok) throw new Error(error)
      window.location.href = url
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {(["free", "pro", "team"] as const).map(tier => {
        const c = COPY[tier]
        const isCurrent = currentTier === tier
        const isUpgrade = !isCurrent && tier !== "free" && rank(tier) > rank(currentTier)
        return (
          <Card key={tier} className={isCurrent ? "ring-2 ring-primary" : ""}>
            <CardHeader>
              <h3 className="text-lg font-semibold">{c.title}</h3>
              <p className="text-sm text-muted-foreground">{c.tagline}</p>
              <p className="text-3xl font-bold">${TIER_PRICE_USD[tier]}<span className="text-sm font-normal">/mo</span></p>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-1">
                <li>{format(c.limits.anthropicTokensPerMonth)} Claude tokens / mo</li>
                <li>{format(c.limits.e2bSecondsPerMonth / 60)} min sandbox / mo</li>
                <li>{format(c.limits.deploymentsPerMonth)} deploys / mo</li>
                <li>{format(c.limits.activeProjects)} active projects</li>
              </ul>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full"
                disabled={isCurrent || busy !== null}
                variant={isUpgrade ? "default" : "secondary"}
                onClick={() => upgrade(tier)}
              >
                {busy === tier ? "Redirecting…" : isCurrent ? "Current plan" : c.cta}
              </Button>
            </CardFooter>
          </Card>
        )
      })}
    </div>
  )
}

function format(n: number): string {
  if (n === Number.POSITIVE_INFINITY) return "Unlimited"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
  return n.toString()
}

function rank(t: Tier): number { return t === "free" ? 0 : t === "pro" ? 1 : 2 }
```

- [ ] **Step 15.2: Commit**

```bash
git add src/features/billing/components/plan-picker.tsx
git commit -m "feat(billing): plan picker with checkout redirect"
```

---

## Task 16: UsageMeter Component

**Files:**
- Create: `src/features/billing/components/usage-meter.tsx`
- Create: `src/features/billing/hooks/use-plan.ts`
- Create: `src/features/billing/hooks/use-usage.ts`

- [ ] **Step 16.1: Hooks**

```typescript
// src/features/billing/hooks/use-plan.ts
"use client"
import { useQuery } from "convex/react"
import { api } from "@/../convex/_generated/api"

export function usePlan(ownerId: string) {
  return useQuery(api.plans.get, { ownerId })
}
```

```typescript
// src/features/billing/hooks/use-usage.ts
"use client"
import { useQuery } from "convex/react"
import { api } from "@/../convex/_generated/api"

export function useUsage(ownerId: string) {
  const yearMonth = new Date().toISOString().slice(0, 7)
  return useQuery(api.usage.current, { ownerId, yearMonth })
}
```

- [ ] **Step 16.2: Component**

```tsx
// src/features/billing/components/usage-meter.tsx
"use client"

import { Progress } from "@/components/ui/progress"

interface MeterProps {
  label: string
  used: number
  limit: number
  formatter?: (n: number) => string
}

export function UsageMeter({ label, used, limit, formatter }: MeterProps) {
  const fmt = formatter ?? ((n: number) => n.toLocaleString())
  const pct = limit === Number.POSITIVE_INFINITY ? 0 : Math.min(100, (used / limit) * 100)
  const color = pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-primary"
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {fmt(used)} / {limit === Number.POSITIVE_INFINITY ? "Unlimited" : fmt(limit)}
        </span>
      </div>
      <Progress value={pct} className="h-2" indicatorClassName={color} />
    </div>
  )
}
```

- [ ] **Step 16.3: Commit**

```bash
git add src/features/billing/components/usage-meter.tsx src/features/billing/hooks/
git commit -m "feat(billing): usage meter component + plan/usage hooks"
```

---

## Task 17: UpgradeCTA Modal

**Files:**
- Create: `src/features/billing/components/upgrade-cta.tsx`

- [ ] **Step 17.1: Implement**

```tsx
// src/features/billing/components/upgrade-cta.tsx
"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { PlanPicker } from "./plan-picker"

export function UpgradeCTA({
  open,
  onClose,
  reason,
  currentTier,
}: {
  open: boolean
  onClose: () => void
  reason: string                                  // e.g. "You've hit your monthly token limit."
  currentTier: "free" | "pro" | "team"
}) {
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Upgrade to keep building</DialogTitle>
          <DialogDescription>{reason}</DialogDescription>
        </DialogHeader>
        <PlanPicker currentTier={currentTier} />
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 17.2: Commit**

```bash
git add src/features/billing/components/upgrade-cta.tsx
git commit -m "feat(billing): upgrade CTA modal"
```

---

## Task 18: QuotaExceededBanner

**Why this exists:** Per Constitution §17.6, free users at 80% see a non-blocking banner. It must be dismissible (per session) but reappear on next page load if still over threshold.

**Files:**
- Create: `src/features/billing/components/quota-exceeded-banner.tsx`

- [ ] **Step 18.1: Implement**

```tsx
// src/features/billing/components/quota-exceeded-banner.tsx
"use client"

import { useState } from "react"
import { useUser } from "@clerk/nextjs"
import { usePlan } from "../hooks/use-plan"
import { useUsage } from "../hooks/use-usage"
import { UpgradeCTA } from "./upgrade-cta"
import { X } from "lucide-react"

export function QuotaExceededBanner() {
  const { user } = useUser()
  const plan  = usePlan(user?.id ?? "")
  const usage = useUsage(user?.id ?? "")
  const [dismissed, setDismissed] = useState(false)
  const [openModal, setOpenModal] = useState(false)

  if (!plan || !usage || dismissed) return null

  const ratios = [
    usage.anthropicTokens / plan.limits.anthropicTokensPerMonth,
    usage.e2bSeconds      / plan.limits.e2bSecondsPerMonth,
    usage.deployments     / plan.limits.deploymentsPerMonth,
  ]
  const max = Math.max(...ratios.filter(Number.isFinite))

  if (max < 0.8) return null

  const overLimit = max >= 1
  const text = overLimit
    ? "You've reached your monthly limit. Upgrade to keep building."
    : "You're approaching your monthly limit. Upgrade for more capacity."

  return (
    <div className={`flex items-center justify-between px-4 py-2 text-sm ${overLimit ? "bg-destructive text-destructive-foreground" : "bg-amber-100 text-amber-900"}`}>
      <span>{text}</span>
      <div className="flex items-center gap-3">
        <button onClick={() => setOpenModal(true)} className="underline font-medium">Upgrade</button>
        <button onClick={() => setDismissed(true)} aria-label="Dismiss"><X className="h-4 w-4" /></button>
      </div>
      <UpgradeCTA
        open={openModal}
        onClose={() => setOpenModal(false)}
        reason={text}
        currentTier={plan.tier}
      />
    </div>
  )
}
```

- [ ] **Step 18.2: Mount in app shell**

In `src/app/(app)/layout.tsx`, render `<QuotaExceededBanner />` above the main content.

- [ ] **Step 18.3: Commit**

```bash
git add src/features/billing/components/quota-exceeded-banner.tsx src/app/\(app\)/layout.tsx
git commit -m "feat(billing): quota exceeded banner at 80% / 100%"
```

---

## Task 19: Billing Dashboard Page

**Files:**
- Create: `src/app/(app)/billing/page.tsx`
- Create: `src/features/billing/components/billing-history.tsx`

- [ ] **Step 19.1: Page**

```tsx
// src/app/(app)/billing/page.tsx
"use client"

import { useUser } from "@clerk/nextjs"
import { usePlan } from "@/features/billing/hooks/use-plan"
import { useUsage } from "@/features/billing/hooks/use-usage"
import { PlanPicker } from "@/features/billing/components/plan-picker"
import { UsageMeter } from "@/features/billing/components/usage-meter"
import { BillingHistory } from "@/features/billing/components/billing-history"
import { Button } from "@/components/ui/button"

export default function BillingPage() {
  const { user } = useUser()
  const plan  = usePlan(user?.id ?? "")
  const usage = useUsage(user?.id ?? "") ?? { anthropicTokens: 0, e2bSeconds: 0, deployments: 0 }

  if (!plan) return <div className="p-8">Loading…</div>

  async function openPortal() {
    const res = await fetch("/api/stripe/portal", { method: "POST" })
    const { url } = await res.json()
    if (url) window.location.href = url
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-8">
      <header>
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-muted-foreground">Plan: <span className="font-medium capitalize">{plan.tier}</span> · Status: {plan.status}</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">This month</h2>
        <UsageMeter label="Claude tokens"     used={usage.anthropicTokens} limit={plan.limits.anthropicTokensPerMonth} />
        <UsageMeter label="Sandbox seconds"   used={usage.e2bSeconds}      limit={plan.limits.e2bSecondsPerMonth} />
        <UsageMeter label="Deployments"       used={usage.deployments}     limit={plan.limits.deploymentsPerMonth} />
      </section>

      {plan.stripeCustomerId && (
        <section>
          <Button variant="secondary" onClick={openPortal}>Manage subscription</Button>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3">Choose a plan</h2>
        <PlanPicker currentTier={plan.tier} />
      </section>

      {plan.stripeCustomerId && <BillingHistory customerId={plan.stripeCustomerId} />}
    </div>
  )
}
```

- [ ] **Step 19.2: BillingHistory component**

```tsx
// src/features/billing/components/billing-history.tsx
"use client"

import { useEffect, useState } from "react"

interface Invoice {
  id: string
  number: string | null
  amount: number             // cents
  currency: string
  status: string
  created: number            // seconds
  hostedInvoiceUrl: string | null
}

export function BillingHistory({ customerId }: { customerId: string }) {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null)

  useEffect(() => {
    fetch(`/api/stripe/invoices?customer=${encodeURIComponent(customerId)}`)
      .then(r => r.json())
      .then(d => setInvoices(d.invoices ?? []))
      .catch(() => setInvoices([]))
  }, [customerId])

  if (!invoices) return <p className="text-sm text-muted-foreground">Loading invoices…</p>
  if (invoices.length === 0) return null

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Billing history</h2>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-muted-foreground">
          <th className="py-1">Date</th><th>Number</th><th>Amount</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>
          {invoices.map(inv => (
            <tr key={inv.id} className="border-t">
              <td className="py-1">{new Date(inv.created * 1000).toLocaleDateString()}</td>
              <td>{inv.number}</td>
              <td>${(inv.amount / 100).toFixed(2)} {inv.currency.toUpperCase()}</td>
              <td>{inv.status}</td>
              <td>{inv.hostedInvoiceUrl && <a className="underline" href={inv.hostedInvoiceUrl} target="_blank">View</a>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
```

- [ ] **Step 19.3: Invoices API**

Add `src/app/api/stripe/invoices/route.ts`:

```typescript
import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { fetchQuery } from "convex/nextjs"
import { api } from "@/../convex/_generated/api"
import { stripe } from "@/lib/billing/stripe-server"

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const customerId = new URL(req.url).searchParams.get("customer")
  if (!customerId) return NextResponse.json({ invoices: [] })

  // Verify customer belongs to user (don't trust the query string)
  const plan = await fetchQuery(api.plans.get, { ownerId: userId })
  if (plan.stripeCustomerId !== customerId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const list = await stripe.invoices.list({ customer: customerId, limit: 12 })
  return NextResponse.json({
    invoices: list.data.map(i => ({
      id: i.id,
      number: i.number,
      amount: i.amount_paid,
      currency: i.currency,
      status: i.status,
      created: i.created,
      hostedInvoiceUrl: i.hosted_invoice_url,
    })),
  })
}
```

- [ ] **Step 19.4: Commit**

```bash
git add src/app/\(app\)/billing/ src/features/billing/components/billing-history.tsx src/app/api/stripe/invoices/
git commit -m "feat(billing): billing dashboard — usage meters, portal button, invoice history"
```

---

## Task 20: Free-Tier Honesty Surface

**Why explicit:** Constitution §17.6 mandates that limits are visible on the pricing page and in the dashboard. The dashboard (Task 19) already shows them; this task fixes the pricing page and adds a small disclosure to onboarding.

**Files:**
- Modify: `src/app/(marketing)/pricing/page.tsx`
- Modify: `src/app/(app)/onboarding/page.tsx` (or whatever onboarding route exists; sub-plan 10 may finalize)

- [ ] **Step 20.1: Pricing page sourced from `plan-tiers.ts`**

Re-render the pricing table from the same constants used by the runtime, so they cannot drift:

```tsx
// src/app/(marketing)/pricing/page.tsx
import { FREE_LIMITS, PRO_LIMITS, TEAM_LIMITS, TIER_PRICE_USD } from "@/lib/billing/plan-tiers"
// ... render comparison table; explicitly include "Daily cost ceiling: $0.50 / $20 / $100".
```

- [ ] **Step 20.2: Onboarding disclosure**

In the welcome panel, render: "You're on the Free plan. 50K Claude tokens, 30 min sandbox, 1 deploy, 3 projects per month. No credit card required, no auto-charge."

- [ ] **Step 20.3: Commit**

```bash
git add src/app/\(marketing\)/pricing/page.tsx src/app/\(app\)/onboarding/page.tsx
git commit -m "docs(billing): free-tier limits visible on pricing + onboarding"
```

---

## Task 21: End-to-End Smoke Test (Stripe Test Mode)

- [ ] **Step 21.1: Configure Stripe test mode**

In Stripe dashboard (test mode):
1. Create a product with two prices: Pro ($29/mo) and Team ($99/mo).
2. Copy price IDs into `.env.local` as `STRIPE_PRICE_PRO`, `STRIPE_PRICE_TEAM`.
3. Copy `sk_test_…` into `STRIPE_SECRET_KEY`.

- [ ] **Step 21.2: Set up webhook listener**

```bash
stripe listen --forward-to http://localhost:3000/api/stripe/webhook
```

Copy the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET`.

- [ ] **Step 21.3: Run upgrade flow**

1. Sign in as a fresh user.
2. Visit `/billing`. Verify "Free" plan, all meters at 0.
3. Click "Upgrade to Pro". Stripe Checkout opens.
4. Use card `4242 4242 4242 4242`, any future expiry, any CVC.
5. Complete checkout.
6. Verify in Convex dashboard:
   - `plans` row exists with `tier=pro`, `stripeCustomerId`, `stripeSubscriptionId`, `status=active`.
   - `stripe_events` has at least 2 rows (`customer.subscription.created`, `invoice.payment_succeeded`).
7. Verify `/billing` now shows Pro plan + "Manage subscription" button.

- [ ] **Step 21.4: Test idempotent webhook**

```bash
stripe events resend evt_<id_of_subscription_created>
```

Verify:
- HTTP 200 returned with `{ duplicate: true }`.
- No additional `stripe_events` row inserted.
- `plans` row not modified (`updatedAt` unchanged).

- [ ] **Step 21.5: Test quota enforcement**

Temporarily set `FREE_LIMITS.anthropicTokensPerMonth = 100`. Send a message. Verify:
- Conversation shows "Quota exceeded" message.
- Status is `quota_exceeded`.
- Banner appears on `/billing`.

Revert constant.

- [ ] **Step 21.6: Test failed payment**

```bash
stripe trigger invoice.payment_failed
```

Verify `plans.status` flips to `past_due`.

- [ ] **Step 21.7: Test cancellation**

In Stripe portal, cancel subscription. Verify webhook arrives, `plans.status = cancelled`. After `currentPeriodEnd`, the daily cron `revertToFree` should flip tier.

- [ ] **Step 21.8: Verify nothing fails**

```bash
npm run test:unit
npm run typecheck
```

Both green.

- [ ] **Step 21.9: Commit nothing (verification only)**

---

## Task 22: Documentation and .env.example Additions

- [ ] **Step 22.1: Add billing env vars**

Append to `.env.example`:

```bash
# Stripe (Phase 2)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_TEAM=price_...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 22.2: Commit**

```bash
git add .env.example
git commit -m "docs(billing): add stripe env vars to .env.example"
```

---

## Self-Review Checklist

Before marking this sub-plan complete, verify:

- [ ] All 22 tasks have green commits.
- [ ] `npm run test:unit` passes.
- [ ] `npm run typecheck` passes.
- [ ] Manual end-to-end via Stripe test mode (Task 21) passes including idempotent webhook replay.
- [ ] `convex/schema.ts` has `plans` (with `by_owner` and `by_stripe_customer` indexes) and `stripe_events` (with `by_event_id` index).
- [ ] `checkQuota` is invoked at all four spend boundaries: agent loop, sandbox spawn, deploy, project create.
- [ ] `checkDailyCeiling` is invoked in agent loop alongside `checkQuota`.
- [ ] All five Stripe webhook event types map to a Convex mutation.
- [ ] Free-tier limits are sourced from `src/lib/billing/plan-tiers.ts` in BOTH the pricing page and the dashboard (no duplicate constants).
- [ ] `STRIPE_WEBHOOK_SECRET` is required for webhook route; missing secret returns 500.
- [ ] No webhook handler call uses `req.json()` — only `req.text()`, then `stripe.webhooks.constructEvent`.
- [ ] CONSTITUTION conformance: re-read Articles XI §11.2, XIII §13.1, XVII; spot-check that limits, rates, and webhook event list match.

## Deferred to Sub-Plan 09 (Hardening)

- Sentry alerting on quota_exceeded errors (operator visibility).
- Email transactional templates polish (Resend templates beyond plain HTML).
- Dunning emails before subscription lapse.

## Deferred to Sub-Plan 10 (Onboarding)

- The full onboarding tour that mentions limits (Step 20.2 leaves a placeholder; sub-plan 10 finalizes).

## Open Questions

1. **Team seat billing.** The Team tier is $99/seat/month per Constitution §17.2. v1 of this sub-plan treats it as a flat $99 single-seat (1 ownerId = 1 plan). True multi-seat (organizations with multiple Clerk userIds sharing a plan) is deferred — the schema field `ownerId` needs to become `orgId` for that, which is a follow-up migration.
2. **Stripe API version pin.** Pinned to `2025-09-30.basil`. If Stripe deprecates this before Polaris GA, we bump deliberately and re-run Task 21.
3. **E2B billing source of truth.** Step 13 cron approximates seconds from `sandbox_sessions` deltas. If E2B exposes a true billing API later, we can reconcile against it weekly.
