/**
 * Plan tier definitions. Authority: CONSTITUTION Article XVII (cost discipline,
 * free tier as trial), ROADMAP D-014.
 *
 * Single source of truth — both server (Convex, Stripe webhook, quota guard)
 * and client (PlanPicker, UsageDashboard) import from here.
 */

export type PlanTier = "free" | "pro" | "team"

export interface PlanLimits {
  /** Anthropic tokens (input + output, summed) per calendar month. */
  anthropicTokensPerMonth: number
  /** E2B sandbox seconds per calendar month. */
  e2bSecondsPerMonth: number
  /** Successful deployments per calendar month. */
  deploymentsPerMonth: number
  /** Maximum number of non-archived projects owned by the user. */
  activeProjects: number
}

export interface PlanDefinition {
  id: PlanTier
  name: string
  /** Monthly price in USD (display only — Stripe is authoritative). */
  priceUsd: number
  limits: PlanLimits
  /** Daily cost ceiling per CONSTITUTION §17.4 kill switch. */
  dailyCeilingUsd: number
  features: string[]
  /** Multi-seat plan? Used for Team only. */
  multiSeat: boolean
}

const INF = Number.POSITIVE_INFINITY

export const PLANS: Record<PlanTier, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    priceUsd: 0,
    limits: {
      anthropicTokensPerMonth: 50_000,
      e2bSecondsPerMonth: 1_800, // 30 minutes
      deploymentsPerMonth: 1,
      activeProjects: 3,
    },
    dailyCeilingUsd: 0.5,
    features: [
      "50K Claude tokens / month",
      "30 minutes sandbox / month",
      "1 deploy / month",
      "Up to 3 active projects",
    ],
    multiSeat: false,
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceUsd: 29,
    limits: {
      anthropicTokensPerMonth: 2_000_000,
      e2bSecondsPerMonth: 36_000, // 10 hours
      deploymentsPerMonth: 300, // ≈ 10 / day
      activeProjects: INF,
    },
    dailyCeilingUsd: 20,
    features: [
      "2M Claude tokens / month",
      "10 hours sandbox / month",
      "10 deploys / day",
      "Unlimited projects",
    ],
    multiSeat: false,
  },
  team: {
    id: "team",
    name: "Team",
    priceUsd: 99,
    limits: {
      anthropicTokensPerMonth: INF,
      e2bSecondsPerMonth: INF,
      deploymentsPerMonth: INF,
      activeProjects: INF,
    },
    dailyCeilingUsd: 100,
    features: [
      "Unlimited Claude tokens",
      "Unlimited sandbox time",
      "Unlimited deploys",
      "Unlimited projects",
      "Multi-seat (5 seats included)",
    ],
    multiSeat: true,
  },
} as const

export function getPlan(tier: PlanTier): PlanDefinition {
  return PLANS[tier]
}

export function limitsForTier(tier: PlanTier): PlanLimits {
  return PLANS[tier].limits
}

export function dailyCeilingFor(tier: PlanTier): number {
  return PLANS[tier].dailyCeilingUsd
}

/**
 * Resolve a Stripe price ID (read from env at call-time) to a plan tier.
 * Returns null if the ID does not match any configured plan.
 */
export function tierForStripePriceId(priceId: string): PlanTier | null {
  if (priceId === process.env.STRIPE_PRICE_ID_PRO) return "pro"
  if (priceId === process.env.STRIPE_PRICE_ID_TEAM) return "team"
  return null
}

export function stripePriceIdForTier(tier: PlanTier): string | null {
  if (tier === "pro") return process.env.STRIPE_PRICE_ID_PRO ?? null
  if (tier === "team") return process.env.STRIPE_PRICE_ID_TEAM ?? null
  return null
}

/** Numeric ranking for upgrade/downgrade comparisons. */
export function planRank(tier: PlanTier): number {
  return tier === "free" ? 0 : tier === "pro" ? 1 : 2
}

/** Suggested upgrade target for a given tier (free→pro, pro→team, team→null). */
export function suggestUpgrade(tier: PlanTier): PlanTier | null {
  if (tier === "free") return "pro"
  if (tier === "pro") return "team"
  return null
}
