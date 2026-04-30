/**
 * Calibrator -- auto-tuning from past run stats.
 */

import { describe, it, expect } from "vitest"
import {
  calibrate,
  extractHealingSuggestions,
  type CalibrationResult,
  type CalibratorConfig,
} from "@/lib/agent-kit/core/calibrator"
import type { RunStats } from "@/lib/agent-kit/core/user-profile"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a RunStats with sensible defaults, overriding select fields. */
function makeStats(overrides: Partial<RunStats> = {}): RunStats {
  return {
    totalRuns: 10,
    successfulRuns: 8,
    averageIterations: 25,
    averageTokens: 75_000,
    averageDurationMs: 150_000,
    taskClassDistribution: { standard: 10 },
    averageEvalScore: 0.7,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// calibrate — not enough data
// ---------------------------------------------------------------------------

describe("calibrate — insufficient data", () => {
  it("returns empty suggestions when totalRuns < default minRuns (5)", () => {
    const stats = makeStats({ totalRuns: 3 })
    const result = calibrate(stats, {})
    expect(result.suggestions).toEqual([])
    expect(result.basedOnRuns).toBe(3)
    expect(result.hasEnoughData).toBe(false)
  })

  it("returns empty suggestions when totalRuns is 0", () => {
    const stats = makeStats({ totalRuns: 0 })
    const result = calibrate(stats, {})
    expect(result.suggestions).toEqual([])
    expect(result.basedOnRuns).toBe(0)
    expect(result.hasEnoughData).toBe(false)
  })

  it("returns empty suggestions when totalRuns < custom minRuns", () => {
    const stats = makeStats({ totalRuns: 8 })
    const result = calibrate(stats, {}, { minRuns: 10 })
    expect(result.hasEnoughData).toBe(false)
  })

  it("returns suggestions when totalRuns equals minRuns", () => {
    // 5 runs at moderate usage -- should get hasEnoughData: true
    const stats = makeStats({ totalRuns: 5 })
    const result = calibrate(stats, {})
    expect(result.hasEnoughData).toBe(true)
    expect(result.basedOnRuns).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// calibrate — budget iteration tuning (Rule 1)
// ---------------------------------------------------------------------------

describe("calibrate — budget iteration tuning", () => {
  it("suggests increase when average iterations > 80% of limit", () => {
    // Default limit is 50. Average of 45 = 90% usage.
    const stats = makeStats({ totalRuns: 10, averageIterations: 45 })
    const result = calibrate(stats, {})
    const iterSuggestion = result.suggestions.find(
      (s) => s.parameter === "budget.maxIterations",
    )
    expect(iterSuggestion).toBeDefined()
    expect(iterSuggestion!.suggestedValue).toBe(75) // 50 * 1.5
    expect(iterSuggestion!.confidence).toBeGreaterThan(0)
  })

  it("suggests decrease when average iterations < 20% of limit", () => {
    // Default limit is 50. Average of 5 = 10% usage.
    const stats = makeStats({ totalRuns: 10, averageIterations: 5 })
    const result = calibrate(stats, {})
    const iterSuggestion = result.suggestions.find(
      (s) => s.parameter === "budget.maxIterations",
    )
    expect(iterSuggestion).toBeDefined()
    expect(iterSuggestion!.suggestedValue).toBe(25) // 50 * 0.5
  })

  it("no suggestion when average is between 20% and 80%", () => {
    // Default limit is 50. Average of 25 = 50% usage.
    const stats = makeStats({ totalRuns: 10, averageIterations: 25 })
    const result = calibrate(stats, {})
    const iterSuggestion = result.suggestions.find(
      (s) => s.parameter === "budget.maxIterations",
    )
    expect(iterSuggestion).toBeUndefined()
  })

  it("uses overridden value when present", () => {
    // Override maxIterations to 100. Average of 90 = 90% usage.
    const stats = makeStats({ totalRuns: 10, averageIterations: 90 })
    const result = calibrate(stats, { "budget.maxIterations": 100 })
    const iterSuggestion = result.suggestions.find(
      (s) => s.parameter === "budget.maxIterations",
    )
    expect(iterSuggestion).toBeDefined()
    expect(iterSuggestion!.suggestedValue).toBe(150) // 100 * 1.5
  })
})

// ---------------------------------------------------------------------------
// calibrate — token budget tuning (Rule 2)
// ---------------------------------------------------------------------------

describe("calibrate — token budget tuning", () => {
  it("suggests increase when average tokens > 80% of limit", () => {
    // Default limit is 150000. Average of 130000 = 86.7% usage.
    const stats = makeStats({ totalRuns: 10, averageTokens: 130_000 })
    const result = calibrate(stats, {})
    const tokSuggestion = result.suggestions.find(
      (s) => s.parameter === "budget.maxTokens",
    )
    expect(tokSuggestion).toBeDefined()
    expect(tokSuggestion!.suggestedValue).toBe(225_000) // 150000 * 1.5
  })

  it("suggests decrease when average tokens < 20% of limit", () => {
    // Default limit is 150000. Average of 20000 = 13.3% usage.
    const stats = makeStats({ totalRuns: 10, averageTokens: 20_000 })
    const result = calibrate(stats, {})
    const tokSuggestion = result.suggestions.find(
      (s) => s.parameter === "budget.maxTokens",
    )
    expect(tokSuggestion).toBeDefined()
    expect(tokSuggestion!.suggestedValue).toBe(75_000) // 150000 * 0.5
  })

  it("no suggestion when average is between thresholds", () => {
    const stats = makeStats({ totalRuns: 10, averageTokens: 75_000 })
    const result = calibrate(stats, {})
    const tokSuggestion = result.suggestions.find(
      (s) => s.parameter === "budget.maxTokens",
    )
    expect(tokSuggestion).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// calibrate — duration tuning (Rule 3)
// ---------------------------------------------------------------------------

describe("calibrate — duration tuning", () => {
  it("suggests increase when average duration > 80% of limit", () => {
    // Default limit is 300000ms (5min). Average of 260000ms = 86.7%.
    const stats = makeStats({ totalRuns: 10, averageDurationMs: 260_000 })
    const result = calibrate(stats, {})
    const durSuggestion = result.suggestions.find(
      (s) => s.parameter === "budget.maxDurationMs",
    )
    expect(durSuggestion).toBeDefined()
    expect(durSuggestion!.suggestedValue).toBe(450_000) // 300000 * 1.5
  })

  it("does NOT suggest decrease for low duration usage", () => {
    // Duration only has high-usage check, not low-usage.
    const stats = makeStats({ totalRuns: 10, averageDurationMs: 10_000 })
    const result = calibrate(stats, {})
    const durSuggestion = result.suggestions.find(
      (s) => s.parameter === "budget.maxDurationMs",
    )
    expect(durSuggestion).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// calibrate — healing threshold tuning (Rule 4)
// ---------------------------------------------------------------------------

describe("calibrate — healing threshold tuning", () => {
  it("suggests raising goodEnoughThreshold when avg eval > 0.9", () => {
    const stats = makeStats({ totalRuns: 10, averageEvalScore: 0.95 })
    const result = calibrate(stats, {})
    const healingSuggestion = result.suggestions.find(
      (s) => s.parameter === "healing.goodEnoughThreshold",
    )
    expect(healingSuggestion).toBeDefined()
    // Default goodEnoughThreshold is 0.85, +0.05 = 0.90
    expect(healingSuggestion!.suggestedValue).toBe(0.9)
  })

  it("suggests lowering goodEnoughThreshold when avg eval < 0.4", () => {
    const stats = makeStats({ totalRuns: 10, averageEvalScore: 0.3 })
    const result = calibrate(stats, {})
    const healingSuggestion = result.suggestions.find(
      (s) => s.parameter === "healing.goodEnoughThreshold",
    )
    expect(healingSuggestion).toBeDefined()
    // Default goodEnoughThreshold is 0.85, -0.1 = 0.75
    expect(healingSuggestion!.suggestedValue).toBe(0.75)
  })

  it("no healing suggestion when avg eval is between 0.4 and 0.9", () => {
    const stats = makeStats({ totalRuns: 10, averageEvalScore: 0.7 })
    const result = calibrate(stats, {})
    const healingSuggestion = result.suggestions.find(
      (s) => s.parameter === "healing.goodEnoughThreshold",
    )
    expect(healingSuggestion).toBeUndefined()
  })

  it("no healing suggestion when averageEvalScore is null", () => {
    const stats = makeStats({ totalRuns: 10, averageEvalScore: null })
    const result = calibrate(stats, {})
    const healingSuggestion = result.suggestions.find(
      (s) => s.parameter === "healing.goodEnoughThreshold",
    )
    expect(healingSuggestion).toBeUndefined()
  })

  it("clamps goodEnoughThreshold raise to 1.0", () => {
    // If current is 0.98, raising by 0.05 would exceed 1.0
    const stats = makeStats({ totalRuns: 10, averageEvalScore: 0.95 })
    const result = calibrate(stats, { "healing.goodEnoughThreshold": 0.98 })
    const healingSuggestion = result.suggestions.find(
      (s) => s.parameter === "healing.goodEnoughThreshold",
    )
    // 0.98 + 0.05 = 1.03, clamped to 1.0
    expect(healingSuggestion).toBeDefined()
    expect(healingSuggestion!.suggestedValue).toBe(1.0)
  })

  it("clamps goodEnoughThreshold lower to 0.5", () => {
    // If current is 0.55, lowering by 0.1 = 0.45 -- but min is 0.5
    const stats = makeStats({ totalRuns: 10, averageEvalScore: 0.3 })
    const result = calibrate(stats, { "healing.goodEnoughThreshold": 0.55 })
    const healingSuggestion = result.suggestions.find(
      (s) => s.parameter === "healing.goodEnoughThreshold",
    )
    expect(healingSuggestion).toBeDefined()
    expect(healingSuggestion!.suggestedValue).toBe(0.5)
  })
})

// ---------------------------------------------------------------------------
// calibrate — confidence scaling (Rule 5)
// ---------------------------------------------------------------------------

describe("calibrate — confidence scaling", () => {
  it("confidence = sqrt(runs/100), low run count", () => {
    // 10 runs: sqrt(10/100) = sqrt(0.1) ~ 0.316
    const stats = makeStats({ totalRuns: 10, averageIterations: 45 })
    const result = calibrate(stats, {})
    const suggestion = result.suggestions[0]
    expect(suggestion).toBeDefined()
    expect(suggestion!.confidence).toBeCloseTo(Math.sqrt(10 / 100), 5)
  })

  it("confidence = sqrt(runs/100), high run count", () => {
    // 100 runs: sqrt(100/100) = 1.0, capped at maxConfidence (0.9)
    const stats = makeStats({ totalRuns: 100, averageIterations: 45 })
    const result = calibrate(stats, {})
    const suggestion = result.suggestions[0]
    expect(suggestion).toBeDefined()
    expect(suggestion!.confidence).toBe(0.9)
  })

  it("respects custom maxConfidence", () => {
    const stats = makeStats({ totalRuns: 100, averageIterations: 45 })
    const result = calibrate(stats, {}, { maxConfidence: 0.7 })
    const suggestion = result.suggestions[0]
    expect(suggestion).toBeDefined()
    expect(suggestion!.confidence).toBe(0.7)
  })
})

// ---------------------------------------------------------------------------
// calibrate — edge cases
// ---------------------------------------------------------------------------

describe("calibrate — edge cases", () => {
  it("no suggestions when all averages are at exactly 80% (threshold)", () => {
    // Exactly at 80% should NOT trigger (> not >=).
    const stats = makeStats({
      totalRuns: 10,
      averageIterations: 40, // 40/50 = 0.8
      averageTokens: 120_000, // 120k/150k = 0.8
      averageDurationMs: 240_000, // 240k/300k = 0.8
      averageEvalScore: 0.7,
    })
    const result = calibrate(stats, {})
    expect(result.suggestions).toEqual([])
  })

  it("no suggestions when all averages are at exactly 20% (threshold)", () => {
    const stats = makeStats({
      totalRuns: 10,
      averageIterations: 10, // 10/50 = 0.2
      averageTokens: 30_000, // 30k/150k = 0.2
      averageDurationMs: 60_000, // 60k/300k = 0.2
      averageEvalScore: 0.7,
    })
    const result = calibrate(stats, {})
    expect(result.suggestions).toEqual([])
  })

  it("handles zero averages", () => {
    const stats = makeStats({
      totalRuns: 10,
      averageIterations: 0,
      averageTokens: 0,
      averageDurationMs: 0,
      averageEvalScore: null,
    })
    const result = calibrate(stats, {})
    // 0 < 20% triggers decrease for iterations and tokens
    const iterSuggestion = result.suggestions.find(
      (s) => s.parameter === "budget.maxIterations",
    )
    const tokSuggestion = result.suggestions.find(
      (s) => s.parameter === "budget.maxTokens",
    )
    expect(iterSuggestion).toBeDefined()
    expect(tokSuggestion).toBeDefined()
  })

  it("does not produce a suggestion if current and suggested values match", () => {
    // If the rounding makes suggested == current, skip. E.g. current=1,
    // decrease factor 0.5 would suggest 1 (rounded) -- same value.
    const stats = makeStats({
      totalRuns: 10,
      averageIterations: 0,
    })
    const result = calibrate(stats, { "budget.maxIterations": 1 })
    const iterSuggestion = result.suggestions.find(
      (s) => s.parameter === "budget.maxIterations",
    )
    // round(1 * 0.5) = 1, same as current, so no suggestion
    expect(iterSuggestion).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// extractHealingSuggestions
// ---------------------------------------------------------------------------

describe("extractHealingSuggestions", () => {
  it("extracts healing.goodEnoughThreshold into RetryPolicyConfig", () => {
    const result: CalibrationResult = {
      suggestions: [
        {
          parameter: "healing.goodEnoughThreshold",
          suggestedValue: 0.9,
          reason: "test",
          confidence: 0.5,
        },
      ],
      basedOnRuns: 10,
      hasEnoughData: true,
    }
    const patch = extractHealingSuggestions(result)
    expect(patch.goodEnoughThreshold).toBe(0.9)
  })

  it("ignores non-healing suggestions", () => {
    const result: CalibrationResult = {
      suggestions: [
        {
          parameter: "budget.maxIterations",
          suggestedValue: 75,
          reason: "test",
          confidence: 0.5,
        },
        {
          parameter: "healing.maxAttempts",
          suggestedValue: 5,
          reason: "test",
          confidence: 0.5,
        },
      ],
      basedOnRuns: 10,
      hasEnoughData: true,
    }
    const patch = extractHealingSuggestions(result)
    expect(patch.maxAttempts).toBe(5)
    expect(patch).not.toHaveProperty("maxIterations")
    expect(Object.keys(patch)).toEqual(["maxAttempts"])
  })

  it("returns empty object when no healing suggestions exist", () => {
    const result: CalibrationResult = {
      suggestions: [
        {
          parameter: "budget.maxTokens",
          suggestedValue: 200_000,
          reason: "test",
          confidence: 0.5,
        },
      ],
      basedOnRuns: 10,
      hasEnoughData: true,
    }
    const patch = extractHealingSuggestions(result)
    expect(patch).toEqual({})
  })

  it("returns empty object when suggestions list is empty", () => {
    const result: CalibrationResult = {
      suggestions: [],
      basedOnRuns: 3,
      hasEnoughData: false,
    }
    const patch = extractHealingSuggestions(result)
    expect(patch).toEqual({})
  })

  it("maps multiple healing fields correctly", () => {
    const result: CalibrationResult = {
      suggestions: [
        {
          parameter: "healing.goodEnoughThreshold",
          suggestedValue: 0.9,
          reason: "test",
          confidence: 0.5,
        },
        {
          parameter: "healing.minImprovement",
          suggestedValue: 0.03,
          reason: "test",
          confidence: 0.5,
        },
        {
          parameter: "healing.hopelessThreshold",
          suggestedValue: 0.15,
          reason: "test",
          confidence: 0.5,
        },
        {
          parameter: "healing.maxAttempts",
          suggestedValue: 5,
          reason: "test",
          confidence: 0.5,
        },
      ],
      basedOnRuns: 50,
      hasEnoughData: true,
    }
    const patch = extractHealingSuggestions(result)
    expect(patch.goodEnoughThreshold).toBe(0.9)
    expect(patch.minImprovement).toBe(0.03)
    expect(patch.hopelessThreshold).toBe(0.15)
    expect(patch.maxAttempts).toBe(5)
  })
})
