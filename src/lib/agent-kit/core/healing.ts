/**
 * HealingLoop — score-aware retry with surgical re-prompting.
 *
 * The 5-rule retry ladder (from Praxiom architecture):
 *   1. Good-enough cap: if score >= threshold, accept even with soft issues
 *   2. Marginal-gap stop: if score improved by < minImprovement, stop (plateau)
 *   3. Hopeless-gap stop: if score < hopelessThreshold, stop (won't get better)
 *   4. Max attempts: hard cap on retry count
 *   5. Same-issues stop: if the exact same issues repeat, stop (model is stuck)
 *
 * The FailureAnalyzer builds a surgical healing prompt that:
 *   - Lists ONLY the failing constraints (not the whole eval report)
 *   - Gives specific file paths and error text
 *   - Tells the agent exactly what to fix (not "try again")
 */

export interface RetryPolicyConfig {
  /** Score threshold above which we accept (rule 1). Default: 0.85 */
  goodEnoughThreshold?: number
  /** Minimum score improvement to continue retrying (rule 2). Default: 0.05 */
  minImprovement?: number
  /** Score below which we give up (rule 3). Default: 0.2 */
  hopelessThreshold?: number
  /** Maximum retry attempts (rule 4). Default: 3 */
  maxAttempts?: number
}

export interface HealingContext {
  /** Current attempt number (0-based). */
  attempt: number
  /** Score from this attempt. */
  currentScore: number
  /** Score from the previous attempt. null if this is the first attempt. */
  previousScore: number | null
  /** Issues from this attempt. */
  currentIssues: string[]
  /** Issues from the previous attempt. null if this is the first attempt. */
  previousIssues: string[] | null
}

export type RetryDecision =
  | { retry: false; reason: string }
  | { retry: true }

const DEFAULT_GOOD_ENOUGH = 0.85
const DEFAULT_MIN_IMPROVEMENT = 0.05
const DEFAULT_HOPELESS = 0.2
const DEFAULT_MAX_ATTEMPTS = 3

/**
 * Evaluate whether to retry based on the 5-rule ladder.
 * Rules are checked in order; first match wins.
 */
export function shouldRetry(
  ctx: HealingContext,
  config: RetryPolicyConfig = {},
): RetryDecision {
  const goodEnough = config.goodEnoughThreshold ?? DEFAULT_GOOD_ENOUGH
  const minImprovement = config.minImprovement ?? DEFAULT_MIN_IMPROVEMENT
  const hopeless = config.hopelessThreshold ?? DEFAULT_HOPELESS
  const maxAttempts = config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS

  // Rule 4: max attempts (check first — hard ceiling)
  if (ctx.attempt >= maxAttempts) {
    return {
      retry: false,
      reason: `Max attempts reached (${maxAttempts})`,
    }
  }

  // Rule 1: good enough — accept
  if (ctx.currentScore >= goodEnough) {
    return {
      retry: false,
      reason: `Score ${ctx.currentScore.toFixed(2)} meets good-enough threshold (${goodEnough})`,
    }
  }

  // Rule 3: hopeless — give up
  if (ctx.currentScore < hopeless) {
    return {
      retry: false,
      reason: `Score ${ctx.currentScore.toFixed(2)} below hopeless threshold (${hopeless})`,
    }
  }

  // Rule 2: marginal gap — plateau detection
  if (ctx.previousScore !== null) {
    const improvement = ctx.currentScore - ctx.previousScore
    if (improvement < minImprovement) {
      return {
        retry: false,
        reason: `Improvement ${improvement.toFixed(3)} below minimum (${minImprovement})`,
      }
    }
  }

  // Rule 5: same issues — model is stuck
  if (ctx.previousIssues !== null && ctx.currentIssues.length > 0) {
    const prevSet = new Set(ctx.previousIssues)
    const sameCount = ctx.currentIssues.filter((i) => prevSet.has(i)).length
    if (
      sameCount === ctx.currentIssues.length &&
      sameCount === ctx.previousIssues.length
    ) {
      return {
        retry: false,
        reason: "Same issues repeated — model appears stuck",
      }
    }
  }

  // All rules passed — retry
  return { retry: true }
}

/**
 * Build a surgical healing prompt from eval issues.
 *
 * Unlike prepending raw issues to the conversation (which the current
 * eval.ts does), this produces a structured prompt that:
 *   1. States exactly what failed
 *   2. Gives the constraint severity (hard vs soft)
 *   3. Tells the agent to focus only on these issues
 *   4. Includes the attempt number for context
 */
export function buildHealingPrompt(
  issues: string[],
  attempt: number,
  maxAttempts: number,
): string {
  if (issues.length === 0) return ""

  const header = `## Healing Round ${attempt + 1}/${maxAttempts}`
  const intro =
    "The evaluator found the following issues with your work. Fix ONLY these issues — do not change anything else."
  const issueList = issues.map((issue, i) => `${i + 1}. ${issue}`).join("\n")
  const footer =
    attempt >= maxAttempts - 1
      ? "\n⚠️ This is the LAST attempt. Make it count."
      : `\nYou have ${maxAttempts - attempt - 1} attempt(s) remaining.`

  return [header, "", intro, "", issueList, footer].join("\n")
}

/**
 * HealingRecord — tracks one healing loop's history for telemetry.
 */
export interface HealingRecord {
  attempts: Array<{
    score: number
    issues: string[]
    retried: boolean
    retryReason?: string
  }>
  finalScore: number
  finalIssues: string[]
  totalAttempts: number
}

/**
 * Create a new empty HealingRecord.
 */
export function createHealingRecord(): HealingRecord {
  return {
    attempts: [],
    finalScore: 0,
    finalIssues: [],
    totalAttempts: 0,
  }
}

/**
 * Record an attempt in the healing record.
 */
export function recordAttempt(
  record: HealingRecord,
  score: number,
  issues: string[],
  decision: RetryDecision,
): HealingRecord {
  const retryReason = decision.retry === false ? decision.reason : undefined

  return {
    ...record,
    attempts: [
      ...record.attempts,
      {
        score,
        issues: [...issues],
        retried: decision.retry,
        retryReason,
      },
    ],
    finalScore: score,
    finalIssues: [...issues],
    totalAttempts: record.attempts.length + 1,
  }
}
