import { describe, it, expect } from "vitest"
import {
  PLAN_DAILY_DEPLOY_LIMITS,
  enforceDeployCostCeiling,
} from "@/features/deploy/lib/cost-ceiling"

describe("PLAN_DAILY_DEPLOY_LIMITS", () => {
  it("enforces sub-plan 07 ceilings", () => {
    expect(PLAN_DAILY_DEPLOY_LIMITS.free).toBe(1)
    expect(PLAN_DAILY_DEPLOY_LIMITS.pro).toBe(10)
    expect(PLAN_DAILY_DEPLOY_LIMITS.team).toBe(50)
  })
})

describe("enforceDeployCostCeiling", () => {
  it("allows deploy when under the limit", () => {
    expect(() =>
      enforceDeployCostCeiling({ plan: "free", deploysToday: 0 }),
    ).not.toThrow()
    expect(() =>
      enforceDeployCostCeiling({ plan: "pro", deploysToday: 9 }),
    ).not.toThrow()
  })

  it("rejects deploy when at the limit", () => {
    expect(() =>
      enforceDeployCostCeiling({ plan: "free", deploysToday: 1 }),
    ).toThrow(/limit/)
    expect(() =>
      enforceDeployCostCeiling({ plan: "team", deploysToday: 50 }),
    ).toThrow(/limit/)
  })

  it("rejects deploy when over the limit", () => {
    expect(() =>
      enforceDeployCostCeiling({ plan: "pro", deploysToday: 100 }),
    ).toThrow(/limit/)
  })

  it("includes plan and limit in the error message", () => {
    expect(() =>
      enforceDeployCostCeiling({ plan: "free", deploysToday: 1 }),
    ).toThrow(/free/)
  })

  it("defaults to free when plan is unknown", () => {
    expect(() =>
      enforceDeployCostCeiling({ plan: "unknown" as any, deploysToday: 1 }),
    ).toThrow(/limit/)
    expect(() =>
      enforceDeployCostCeiling({ plan: "unknown" as any, deploysToday: 0 }),
    ).not.toThrow()
  })
})
