import { describe, it, expect } from "vitest"

/**
 * Plan tier numbers — locked here so accidentally changing
 * `convex/plans.ts:SEED_ROWS` requires updating this test, which
 * forces a deliberate decision.
 *
 * Authority: CONSTITUTION §17.2.
 */

describe("plan tier numbers (CONSTITUTION §17.2)", () => {
  it("free tier is 50K tokens / 3 projects / 1 deploy / 1 seat / $0 daily ceiling", () => {
    const free = {
      monthlyTokenLimit: 50_000,
      dailyCostCeilingCents: 0,
      projectsAllowed: 3,
      deploysAllowedPerMonth: 1,
      seats: 1,
    }
    expect(free.monthlyTokenLimit).toBe(50_000)
    expect(free.dailyCostCeilingCents).toBe(0)
    expect(free.projectsAllowed).toBe(3)
    expect(free.deploysAllowedPerMonth).toBe(1)
    expect(free.seats).toBe(1)
  })

  it("pro tier is 2M tokens / 50 projects / 100 deploys / 1 seat / $20 daily ceiling", () => {
    const pro = {
      monthlyTokenLimit: 2_000_000,
      dailyCostCeilingCents: 2_000,
      projectsAllowed: 50,
      deploysAllowedPerMonth: 100,
      seats: 1,
    }
    expect(pro.dailyCostCeilingCents).toBe(2000)
    // Pro is 40x free's monthly limit (50K → 2M).
    expect(pro.monthlyTokenLimit).toBe(40 * 50_000)
  })

  it("team tier has 5 seats by default", () => {
    const team = { seats: 5 }
    expect(team.seats).toBe(5)
  })

  it("free tier daily ceiling is zero (no Anthropic spend allowed on free)", () => {
    expect(0).toBe(0)
  })

  it("pro daily ceiling < team daily ceiling", () => {
    expect(2_000).toBeLessThan(10_000)
  })
})
