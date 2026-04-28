/**
 * D-025 — runBudget(plan) per-tier numbers locked here so accidental
 * downgrades require deliberate test-update + commit.
 */

import { describe, it, expect } from "vitest"
import { runBudget, runBudgetForTask } from "@/lib/agents/agent-runner"

describe("runBudget — D-025 tier-aware run budgets", () => {
  it("free tier = 5min / 50 iter / 150K tokens", () => {
    const b = runBudget("free")
    expect(b.maxDurationMs).toBe(5 * 60_000)
    expect(b.maxIterations).toBe(50)
    expect(b.maxTokens).toBe(150_000)
  })

  it("pro tier = 30min / 100 iter / 300K tokens", () => {
    const b = runBudget("pro")
    expect(b.maxDurationMs).toBe(30 * 60_000)
    expect(b.maxIterations).toBe(100)
    expect(b.maxTokens).toBe(300_000)
  })

  it("team tier = 2hr / 200 iter / 600K tokens", () => {
    const b = runBudget("team")
    expect(b.maxDurationMs).toBe(2 * 60 * 60_000)
    expect(b.maxIterations).toBe(200)
    expect(b.maxTokens).toBe(600_000)
  })

  it("budgets are strictly increasing across tiers", () => {
    const free = runBudget("free")
    const pro = runBudget("pro")
    const team = runBudget("team")
    expect(pro.maxDurationMs).toBeGreaterThan(free.maxDurationMs)
    expect(team.maxDurationMs).toBeGreaterThan(pro.maxDurationMs)
    expect(pro.maxTokens).toBeGreaterThan(free.maxTokens)
    expect(team.maxTokens).toBeGreaterThan(pro.maxTokens)
    expect(pro.maxIterations).toBeGreaterThan(free.maxIterations)
    expect(team.maxIterations).toBeGreaterThan(pro.maxIterations)
  })
})

describe("runBudgetForTask — D-041 task-class multipliers", () => {
  it("trivial scales budget down (~0.2-0.3x)", () => {
    const base = runBudget("pro")
    const trivial = runBudgetForTask("pro", "trivial")
    expect(trivial.maxIterations).toBeLessThan(base.maxIterations)
    expect(trivial.maxTokens).toBeLessThan(base.maxTokens)
    expect(trivial.maxDurationMs).toBeLessThan(base.maxDurationMs)
    // 100 * 0.2 = 20 iter
    expect(trivial.maxIterations).toBe(20)
  })

  it("standard equals base budget", () => {
    const base = runBudget("pro")
    const standard = runBudgetForTask("pro", "standard")
    expect(standard).toEqual(base)
  })

  it("hard scales budget up (~1.6x)", () => {
    const base = runBudget("pro")
    const hard = runBudgetForTask("pro", "hard")
    expect(hard.maxIterations).toBeGreaterThan(base.maxIterations)
    expect(hard.maxTokens).toBeGreaterThan(base.maxTokens)
    expect(hard.maxDurationMs).toBeGreaterThan(base.maxDurationMs)
    // 100 * 1.6 = 160 iter
    expect(hard.maxIterations).toBe(160)
  })

  it("respects floor: maxIterations >= 1, maxTokens >= 1000, maxDurationMs >= 60s", () => {
    // Even on free tier with trivial multiplier, no field collapses to zero.
    const trivial = runBudgetForTask("free", "trivial")
    expect(trivial.maxIterations).toBeGreaterThanOrEqual(1)
    expect(trivial.maxTokens).toBeGreaterThanOrEqual(1_000)
    expect(trivial.maxDurationMs).toBeGreaterThanOrEqual(60_000)
  })

  it("hard on team tier scales appropriately (200 * 1.6 = 320 iter)", () => {
    const hard = runBudgetForTask("team", "hard")
    expect(hard.maxIterations).toBe(320)
    expect(hard.maxTokens).toBe(960_000) // 600K * 1.6
  })
})
