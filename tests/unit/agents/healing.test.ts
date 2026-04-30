/**
 * HealingLoop — 5-rule RetryPolicy + surgical healing prompt tests.
 */

import { describe, it, expect } from "vitest"
import {
  shouldRetry,
  buildHealingPrompt,
  createHealingRecord,
  recordAttempt,
  type HealingContext,
  type RetryPolicyConfig,
  type RetryDecision,
} from "@/lib/agent-kit/core/healing"

// ---------------------------------------------------------------------------
// shouldRetry — rule ladder
// ---------------------------------------------------------------------------

describe("shouldRetry", () => {
  // Rule 1: good-enough
  it("rule 1 — score >= 0.85 stops (good enough)", () => {
    const ctx: HealingContext = {
      attempt: 0,
      currentScore: 0.9,
      previousScore: null,
      currentIssues: ["minor style nit"],
      previousIssues: null,
    }
    const decision = shouldRetry(ctx)
    expect(decision.retry).toBe(false)
    expect((decision as { reason: string }).reason).toContain("good-enough")
  })

  it("rule 1 — score exactly at threshold stops", () => {
    const ctx: HealingContext = {
      attempt: 0,
      currentScore: 0.85,
      previousScore: null,
      currentIssues: [],
      previousIssues: null,
    }
    const decision = shouldRetry(ctx)
    expect(decision.retry).toBe(false)
  })

  // Rule 2: marginal gap (plateau)
  it("rule 2 — improvement < 0.05 stops (plateau)", () => {
    const ctx: HealingContext = {
      attempt: 1,
      currentScore: 0.52,
      previousScore: 0.50,
      currentIssues: ["error A"],
      previousIssues: ["error B"],
    }
    const decision = shouldRetry(ctx)
    expect(decision.retry).toBe(false)
    expect((decision as { reason: string }).reason).toContain("Improvement")
    expect((decision as { reason: string }).reason).toContain("below minimum")
  })

  it("rule 2 — regression (negative improvement) stops", () => {
    const ctx: HealingContext = {
      attempt: 1,
      currentScore: 0.40,
      previousScore: 0.50,
      currentIssues: ["error X"],
      previousIssues: ["error Y"],
    }
    const decision = shouldRetry(ctx)
    expect(decision.retry).toBe(false)
    expect((decision as { reason: string }).reason).toContain("Improvement")
  })

  // Rule 3: hopeless
  it("rule 3 — score < 0.2 stops (hopeless)", () => {
    const ctx: HealingContext = {
      attempt: 0,
      currentScore: 0.1,
      previousScore: null,
      currentIssues: ["catastrophic failure"],
      previousIssues: null,
    }
    const decision = shouldRetry(ctx)
    expect(decision.retry).toBe(false)
    expect((decision as { reason: string }).reason).toContain("hopeless")
  })

  // Rule 4: max attempts
  it("rule 4 — attempt >= maxAttempts stops", () => {
    const ctx: HealingContext = {
      attempt: 3,
      currentScore: 0.5,
      previousScore: 0.3,
      currentIssues: ["something"],
      previousIssues: ["something else"],
    }
    const decision = shouldRetry(ctx)
    expect(decision.retry).toBe(false)
    expect((decision as { reason: string }).reason).toContain("Max attempts")
  })

  // Rule 5: same issues — stuck
  it("rule 5 — identical issues stops (stuck model)", () => {
    const issues = ["Type error in utils.ts:42", "Missing return in handler"]
    const ctx: HealingContext = {
      attempt: 1,
      currentScore: 0.5,
      previousScore: 0.3,
      currentIssues: [...issues],
      previousIssues: [...issues],
    }
    const decision = shouldRetry(ctx)
    expect(decision.retry).toBe(false)
    expect((decision as { reason: string }).reason).toContain("stuck")
  })

  it("rule 5 — different issues allows retry", () => {
    const ctx: HealingContext = {
      attempt: 1,
      currentScore: 0.5,
      previousScore: 0.3,
      currentIssues: ["new issue A"],
      previousIssues: ["old issue B"],
    }
    const decision = shouldRetry(ctx)
    expect(decision.retry).toBe(true)
  })

  it("rule 5 — subset of issues allows retry (issues reduced)", () => {
    const ctx: HealingContext = {
      attempt: 1,
      currentScore: 0.5,
      previousScore: 0.3,
      currentIssues: ["error A"],
      previousIssues: ["error A", "error B"],
    }
    // Not identical sets (different lengths) — should allow retry
    const decision = shouldRetry(ctx)
    expect(decision.retry).toBe(true)
  })

  // Happy path: moderate score, first attempt
  it("happy path — moderate score on first attempt retries", () => {
    const ctx: HealingContext = {
      attempt: 0,
      currentScore: 0.5,
      previousScore: null,
      currentIssues: ["error in foo.ts"],
      previousIssues: null,
    }
    const decision = shouldRetry(ctx)
    expect(decision.retry).toBe(true)
  })

  it("happy path — sufficient improvement retries", () => {
    const ctx: HealingContext = {
      attempt: 1,
      currentScore: 0.6,
      previousScore: 0.4,
      currentIssues: ["remaining error"],
      previousIssues: ["different error"],
    }
    const decision = shouldRetry(ctx)
    expect(decision.retry).toBe(true)
  })

  // Custom config overrides
  it("custom config — override thresholds", () => {
    const config: RetryPolicyConfig = {
      goodEnoughThreshold: 0.7,
      minImprovement: 0.1,
      hopelessThreshold: 0.3,
      maxAttempts: 5,
    }

    // Score 0.75 would pass default good-enough (0.85) but hits custom 0.7
    const ctx: HealingContext = {
      attempt: 0,
      currentScore: 0.75,
      previousScore: null,
      currentIssues: [],
      previousIssues: null,
    }
    const decision = shouldRetry(ctx, config)
    expect(decision.retry).toBe(false)
    expect((decision as { reason: string }).reason).toContain("good-enough")
  })

  it("custom config — higher maxAttempts allows more retries", () => {
    const config: RetryPolicyConfig = { maxAttempts: 10 }
    const ctx: HealingContext = {
      attempt: 5,
      currentScore: 0.5,
      previousScore: 0.3,
      currentIssues: ["issue"],
      previousIssues: ["other issue"],
    }
    const decision = shouldRetry(ctx, config)
    expect(decision.retry).toBe(true)
  })

  it("custom config — stricter minImprovement stops earlier", () => {
    const config: RetryPolicyConfig = { minImprovement: 0.15 }
    const ctx: HealingContext = {
      attempt: 1,
      currentScore: 0.6,
      previousScore: 0.5, // improvement = 0.10, below custom 0.15
      currentIssues: ["issue"],
      previousIssues: ["other issue"],
    }
    const decision = shouldRetry(ctx, config)
    expect(decision.retry).toBe(false)
    expect((decision as { reason: string }).reason).toContain("Improvement")
  })

  // Rule priority: max attempts is checked BEFORE good-enough
  it("rule priority — max attempts (rule 4) beats good-enough (rule 1)", () => {
    const ctx: HealingContext = {
      attempt: 3, // >= maxAttempts (default 3)
      currentScore: 0.9, // above good-enough threshold
      previousScore: null,
      currentIssues: [],
      previousIssues: null,
    }
    const decision = shouldRetry(ctx)
    expect(decision.retry).toBe(false)
    // Should cite max attempts, not good-enough
    expect((decision as { reason: string }).reason).toContain("Max attempts")
  })

  it("rule priority — max attempts (rule 4) beats hopeless (rule 3)", () => {
    const ctx: HealingContext = {
      attempt: 3,
      currentScore: 0.05, // below hopeless
      previousScore: null,
      currentIssues: [],
      previousIssues: null,
    }
    const decision = shouldRetry(ctx)
    expect(decision.retry).toBe(false)
    expect((decision as { reason: string }).reason).toContain("Max attempts")
  })
})

// ---------------------------------------------------------------------------
// buildHealingPrompt
// ---------------------------------------------------------------------------

describe("buildHealingPrompt", () => {
  it("returns empty string for empty issues", () => {
    expect(buildHealingPrompt([], 0, 3)).toBe("")
  })

  it("includes header with attempt numbers", () => {
    const prompt = buildHealingPrompt(["error A"], 0, 3)
    expect(prompt).toContain("## Healing Round 1/3")
  })

  it("includes numbered issue list", () => {
    const prompt = buildHealingPrompt(
      ["Type error in foo.ts:10", "Missing semicolon in bar.ts:5"],
      0,
      3,
    )
    expect(prompt).toContain("1. Type error in foo.ts:10")
    expect(prompt).toContain("2. Missing semicolon in bar.ts:5")
  })

  it("includes instruction to fix only listed issues", () => {
    const prompt = buildHealingPrompt(["some issue"], 0, 3)
    expect(prompt).toContain("Fix ONLY these issues")
    expect(prompt).toContain("do not change anything else")
  })

  it("shows remaining attempts when not last attempt", () => {
    const prompt = buildHealingPrompt(["error"], 0, 3)
    expect(prompt).toContain("2 attempt(s) remaining")
  })

  it("shows last attempt warning on final attempt", () => {
    const prompt = buildHealingPrompt(["error"], 2, 3)
    expect(prompt).toContain("LAST attempt")
    expect(prompt).toContain("Make it count")
  })

  it("second attempt shows 1 remaining", () => {
    const prompt = buildHealingPrompt(["error"], 1, 3)
    expect(prompt).toContain("1 attempt(s) remaining")
  })
})

// ---------------------------------------------------------------------------
// recordAttempt + createHealingRecord
// ---------------------------------------------------------------------------

describe("recordAttempt", () => {
  it("creates initial record correctly", () => {
    const record = createHealingRecord()
    expect(record.attempts).toHaveLength(0)
    expect(record.finalScore).toBe(0)
    expect(record.totalAttempts).toBe(0)
  })

  it("records a single attempt", () => {
    const record = createHealingRecord()
    const decision: RetryDecision = { retry: true }
    const updated = recordAttempt(record, 0.5, ["error A"], decision)

    expect(updated.attempts).toHaveLength(1)
    expect(updated.attempts[0].score).toBe(0.5)
    expect(updated.attempts[0].issues).toEqual(["error A"])
    expect(updated.attempts[0].retried).toBe(true)
    expect(updated.attempts[0].retryReason).toBeUndefined()
    expect(updated.finalScore).toBe(0.5)
    expect(updated.finalIssues).toEqual(["error A"])
    expect(updated.totalAttempts).toBe(1)
  })

  it("records a stopped attempt with reason", () => {
    const record = createHealingRecord()
    const decision: RetryDecision = {
      retry: false,
      reason: "Score 0.90 meets good-enough threshold (0.85)",
    }
    const updated = recordAttempt(record, 0.9, [], decision)

    expect(updated.attempts[0].retried).toBe(false)
    expect(updated.attempts[0].retryReason).toBe(
      "Score 0.90 meets good-enough threshold (0.85)",
    )
  })

  it("accumulates multiple attempts", () => {
    let record = createHealingRecord()

    const d1: RetryDecision = { retry: true }
    record = recordAttempt(record, 0.3, ["error A", "error B"], d1)

    const d2: RetryDecision = { retry: true }
    record = recordAttempt(record, 0.5, ["error A"], d2)

    const d3: RetryDecision = {
      retry: false,
      reason: "Score 0.85 meets good-enough threshold (0.85)",
    }
    record = recordAttempt(record, 0.85, [], d3)

    expect(record.attempts).toHaveLength(3)
    expect(record.totalAttempts).toBe(3)
    expect(record.finalScore).toBe(0.85)
    expect(record.finalIssues).toEqual([])

    // Verify individual attempts
    expect(record.attempts[0].score).toBe(0.3)
    expect(record.attempts[1].score).toBe(0.5)
    expect(record.attempts[2].score).toBe(0.85)
    expect(record.attempts[0].retried).toBe(true)
    expect(record.attempts[2].retried).toBe(false)
  })

  it("does not mutate the original record", () => {
    const record = createHealingRecord()
    const decision: RetryDecision = { retry: true }
    const updated = recordAttempt(record, 0.5, ["error"], decision)

    expect(record.attempts).toHaveLength(0)
    expect(record.totalAttempts).toBe(0)
    expect(updated.attempts).toHaveLength(1)
  })

  it("defensive-copies issue arrays", () => {
    const issues = ["error A"]
    const record = createHealingRecord()
    const decision: RetryDecision = { retry: true }
    const updated = recordAttempt(record, 0.5, issues, decision)

    // Mutating the input array should not affect the record
    issues.push("error B")
    expect(updated.attempts[0].issues).toEqual(["error A"])
    expect(updated.finalIssues).toEqual(["error A"])
  })
})
