/**
 * Cost ceiling guard for deploys. Authority: CONSTITUTION §17.4 + sub-plan 07.
 *
 * Hardcoded plan tiers for now — sub-plan 08 wires Stripe-derived plans into
 * this same function. The shape of the input is intentionally narrow so the
 * Stripe wiring becomes a single call site change.
 */

export type Plan = "free" | "pro" | "team"

export const PLAN_DAILY_DEPLOY_LIMITS: Record<Plan, number> = {
  free: 1,
  pro: 10,
  team: 50,
}

export interface CostCeilingInput {
  plan: Plan
  /** Count of successful + in-flight deploys for this user today (UTC). */
  deploysToday: number
}

export class DeployCostCeilingError extends Error {
  constructor(public readonly plan: Plan, public readonly limit: number) {
    super(
      `Daily deploy limit reached for plan "${plan}" (${limit}/day). Upgrade or wait until tomorrow.`,
    )
    this.name = "DeployCostCeilingError"
  }
}

export function enforceDeployCostCeiling(input: CostCeilingInput): void {
  const limit =
    PLAN_DAILY_DEPLOY_LIMITS[input.plan] ?? PLAN_DAILY_DEPLOY_LIMITS.free
  const plan: Plan = (PLAN_DAILY_DEPLOY_LIMITS[input.plan] !== undefined
    ? input.plan
    : "free") as Plan
  if (input.deploysToday >= limit) {
    throw new DeployCostCeilingError(plan, limit)
  }
}
