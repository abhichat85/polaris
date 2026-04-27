/**
 * D-025 — runBudget(plan) per-tier numbers locked here so accidental
 * downgrades require deliberate test-update + commit.
 */

import { describe, it, expect } from "vitest"
import { runBudget } from "@/lib/agents/agent-runner"

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
