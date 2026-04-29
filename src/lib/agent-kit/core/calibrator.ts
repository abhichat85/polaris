/**
 * Calibrator -- auto-tunes agent parameters from past run stats.
 *
 * The Calibrator reads a UserProfile's RunStats and suggests parameter
 * adjustments. It does NOT apply them directly -- adjustments go through
 * OverrideClamps before reaching the agent.
 *
 * Philosophy: nudge, don't override. The Calibrator's suggestions are
 * conservative -- it only adjusts when there's enough data (>= 5 runs)
 * and the signal is clear.
 *
 * Authority: Praxiom Architecture SS5.3 -- adaptive calibration.
 */

import type { RunStats } from "./user-profile"
import type { RetryPolicyConfig } from "./healing"
import { DEFAULT_CLAMP_REGISTRY } from "./override-clamps"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single calibration suggestion for one parameter. */
export interface CalibrationSuggestion {
  /** Parameter path (matches ClampRegistry key, e.g. "budget.maxIterations"). */
  parameter: string
  /** Suggested new value. */
  suggestedValue: number | boolean
  /** Why this adjustment is suggested. */
  reason: string
  /** Confidence: 0-1. Higher = more data supporting the suggestion. */
  confidence: number
}

/** Result of a calibration run. */
export interface CalibrationResult {
  /** Suggested parameter adjustments. */
  suggestions: CalibrationSuggestion[]
  /** How many runs the calibration was based on. */
  basedOnRuns: number
  /** Whether there's enough data for calibration (>= minRuns). */
  hasEnoughData: boolean
}

/** Configuration for the calibrator. */
export interface CalibratorConfig {
  /** Minimum runs before calibration kicks in. Default: 5 */
  minRuns?: number
  /** Maximum confidence a suggestion can have. Default: 0.9 */
  maxConfidence?: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MIN_RUNS = 5
const DEFAULT_MAX_CONFIDENCE = 0.9

/** Usage ratio above which we suggest increasing a budget parameter. */
const HIGH_USAGE_RATIO = 0.8
/** Usage ratio below which we suggest decreasing a budget parameter. */
const LOW_USAGE_RATIO = 0.2

/** Eval score above which we suggest raising goodEnoughThreshold. */
const HIGH_EVAL_SCORE = 0.9
/** Eval score below which we suggest lowering goodEnoughThreshold. */
const LOW_EVAL_SCORE = 0.4

/** Multiplier applied when suggesting an increase. */
const INCREASE_FACTOR = 1.5
/** Multiplier applied when suggesting a decrease. */
const DECREASE_FACTOR = 0.5

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read the current value of a parameter from overrides, falling back to
 * the DEFAULT_CLAMP_REGISTRY default.
 */
function getCurrentValue(
  key: string,
  overrides: Record<string, number | boolean>,
): number | boolean {
  if (key in overrides) return overrides[key]
  const def = DEFAULT_CLAMP_REGISTRY[key]
  if (def) return def.default
  return 0
}

/**
 * Calculate confidence for a given number of runs.
 * Formula: min(maxConfidence, sqrt(runs / 100)).
 */
function computeConfidence(runs: number, maxConfidence: number): number {
  return Math.min(maxConfidence, Math.sqrt(runs / 100))
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Run calibration against a user's run stats. Returns suggested parameter
 * adjustments that should be passed through OverrideClamps.
 *
 * Calibration rules:
 * 1. Budget tuning: if average iterations > 80% of maxIterations, suggest increasing.
 *    If average iterations < 20% of maxIterations, suggest decreasing.
 * 2. Token budget: same logic as iterations but for tokens.
 * 3. Duration: if average duration > 80% of maxDuration, suggest increasing.
 * 4. Healing: if average eval score > 0.9, suggest raising goodEnoughThreshold.
 *    If average eval score < 0.4, suggest lowering it.
 * 5. Confidence scales with sqrt(runs / 100), capped at maxConfidence.
 */
export function calibrate(
  stats: RunStats,
  currentOverrides: Record<string, number | boolean>,
  config?: CalibratorConfig,
): CalibrationResult {
  const minRuns = config?.minRuns ?? DEFAULT_MIN_RUNS
  const maxConfidence = config?.maxConfidence ?? DEFAULT_MAX_CONFIDENCE

  // Not enough data -- return early.
  if (stats.totalRuns < minRuns) {
    return {
      suggestions: [],
      basedOnRuns: stats.totalRuns,
      hasEnoughData: false,
    }
  }

  const confidence = computeConfidence(stats.totalRuns, maxConfidence)
  const suggestions: CalibrationSuggestion[] = []

  // Rule 1: Budget iteration tuning
  {
    const key = "budget.maxIterations"
    const current = getCurrentValue(key, currentOverrides) as number
    if (current > 0) {
      const ratio = stats.averageIterations / current
      if (ratio > HIGH_USAGE_RATIO) {
        const suggested = Math.round(current * INCREASE_FACTOR)
        if (suggested !== current) {
          suggestions.push({
            parameter: key,
            suggestedValue: suggested,
            reason: `Average iterations (${stats.averageIterations.toFixed(1)}) exceed ${(HIGH_USAGE_RATIO * 100).toFixed(0)}% of limit (${current}). Suggesting increase to avoid hitting the cap.`,
            confidence,
          })
        }
      } else if (ratio < LOW_USAGE_RATIO) {
        const suggested = Math.round(current * DECREASE_FACTOR)
        if (suggested !== current) {
          suggestions.push({
            parameter: key,
            suggestedValue: suggested,
            reason: `Average iterations (${stats.averageIterations.toFixed(1)}) use less than ${(LOW_USAGE_RATIO * 100).toFixed(0)}% of limit (${current}). Suggesting decrease to conserve resources.`,
            confidence,
          })
        }
      }
    }
  }

  // Rule 2: Token budget tuning
  {
    const key = "budget.maxTokens"
    const current = getCurrentValue(key, currentOverrides) as number
    if (current > 0) {
      const ratio = stats.averageTokens / current
      if (ratio > HIGH_USAGE_RATIO) {
        const suggested = Math.round(current * INCREASE_FACTOR)
        if (suggested !== current) {
          suggestions.push({
            parameter: key,
            suggestedValue: suggested,
            reason: `Average tokens (${stats.averageTokens.toFixed(0)}) exceed ${(HIGH_USAGE_RATIO * 100).toFixed(0)}% of limit (${current}). Suggesting increase.`,
            confidence,
          })
        }
      } else if (ratio < LOW_USAGE_RATIO) {
        const suggested = Math.round(current * DECREASE_FACTOR)
        if (suggested !== current) {
          suggestions.push({
            parameter: key,
            suggestedValue: suggested,
            reason: `Average tokens (${stats.averageTokens.toFixed(0)}) use less than ${(LOW_USAGE_RATIO * 100).toFixed(0)}% of limit (${current}). Suggesting decrease.`,
            confidence,
          })
        }
      }
    }
  }

  // Rule 3: Duration tuning (only suggests increase for high usage)
  {
    const key = "budget.maxDurationMs"
    const current = getCurrentValue(key, currentOverrides) as number
    if (current > 0) {
      const ratio = stats.averageDurationMs / current
      if (ratio > HIGH_USAGE_RATIO) {
        const suggested = Math.round(current * INCREASE_FACTOR)
        if (suggested !== current) {
          suggestions.push({
            parameter: key,
            suggestedValue: suggested,
            reason: `Average duration (${(stats.averageDurationMs / 1000).toFixed(1)}s) exceeds ${(HIGH_USAGE_RATIO * 100).toFixed(0)}% of limit (${(current / 1000).toFixed(1)}s). Suggesting increase.`,
            confidence,
          })
        }
      }
    }
  }

  // Rule 4: Healing threshold tuning (only when we have eval scores)
  if (stats.averageEvalScore != null) {
    const key = "healing.goodEnoughThreshold"
    const current = getCurrentValue(key, currentOverrides) as number
    if (stats.averageEvalScore > HIGH_EVAL_SCORE) {
      // Agent is consistently scoring very high -- raise the bar
      const suggested = Math.min(1.0, current + 0.05)
      if (suggested !== current) {
        suggestions.push({
          parameter: key,
          suggestedValue: suggested,
          reason: `Average eval score (${stats.averageEvalScore.toFixed(2)}) is above ${HIGH_EVAL_SCORE}. Raising goodEnoughThreshold to maintain quality bar.`,
          confidence,
        })
      }
    } else if (stats.averageEvalScore < LOW_EVAL_SCORE) {
      // Agent is struggling -- lower the bar so it doesn't loop forever
      const suggested = Math.max(0.5, current - 0.1)
      if (suggested !== current) {
        suggestions.push({
          parameter: key,
          suggestedValue: suggested,
          reason: `Average eval score (${stats.averageEvalScore.toFixed(2)}) is below ${LOW_EVAL_SCORE}. Lowering goodEnoughThreshold to reduce retries on difficult tasks.`,
          confidence,
        })
      }
    }
  }

  return {
    suggestions,
    basedOnRuns: stats.totalRuns,
    hasEnoughData: true,
  }
}

/**
 * Extract healing-specific suggestions as a RetryPolicyConfig.
 * Convenience function for wiring into the healing loop.
 *
 * Filters suggestions whose parameter starts with "healing." and maps
 * them to the corresponding RetryPolicyConfig field.
 */
export function extractHealingSuggestions(
  result: CalibrationResult,
): Partial<RetryPolicyConfig> {
  const patch: Partial<RetryPolicyConfig> = {}

  for (const suggestion of result.suggestions) {
    if (!suggestion.parameter.startsWith("healing.")) continue

    const field = suggestion.parameter.slice("healing.".length)
    const value = suggestion.suggestedValue

    switch (field) {
      case "goodEnoughThreshold":
        if (typeof value === "number") patch.goodEnoughThreshold = value
        break
      case "minImprovement":
        if (typeof value === "number") patch.minImprovement = value
        break
      case "hopelessThreshold":
        if (typeof value === "number") patch.hopelessThreshold = value
        break
      case "maxAttempts":
        if (typeof value === "number") patch.maxAttempts = value
        break
    }
  }

  return patch
}
