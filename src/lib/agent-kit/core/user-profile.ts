/**
 * UserProfile — stores user preferences and adaptation signals.
 *
 * Replaces Praxiom's WorkspaceProfile with a simpler per-user shape.
 * The profile accumulates over time as the user works with Polaris.
 * It's NOT a full preference system — it captures signals that affect
 * agent behavior (style, verbosity, tool preferences).
 *
 * Profiles are persisted in Convex (separate from this pure module)
 * and loaded at pre-flight time by the PreferenceInjector.
 */

/** How verbose should the agent be in its explanations? */
export type VerbosityLevel = "minimal" | "normal" | "detailed"

/** User's preferred code style signals. */
export interface CodeStylePreferences {
  /** Prefer functional or OOP patterns? null = no preference. */
  paradigm: "functional" | "oop" | null
  /** Prefer named exports or default exports? null = no preference. */
  exportStyle: "named" | "default" | null
  /** Prefer inline types or separate interfaces? null = no preference. */
  typeStyle: "inline" | "separate" | null
  /** Maximum line length preference. null = no preference (use project config). */
  maxLineLength: number | null
}

/** Aggregated run statistics for calibration. */
export interface RunStats {
  totalRuns: number
  successfulRuns: number
  averageIterations: number
  averageTokens: number
  averageDurationMs: number
  /** Distribution of task classes seen. */
  taskClassDistribution: Record<string, number>
  /** Average eval score across all evaluated runs. */
  averageEvalScore: number | null
}

export interface UserProfile {
  userId: string
  /** When this profile was created. */
  createdAt: number
  /** When this profile was last updated. */
  updatedAt: number

  /** User's preferred verbosity level. */
  verbosity: VerbosityLevel
  /** User's code style preferences. */
  codeStyle: CodeStylePreferences
  /** User-supplied parameter overrides (pre-clamped). */
  overrides: Record<string, number | boolean>
  /** Aggregated run stats for calibration. */
  runStats: RunStats
  /** Free-form notes the user has asked the agent to remember. */
  persistentNotes: string[]
}

/**
 * Create a fresh profile with sensible defaults.
 */
export function createUserProfile(userId: string): UserProfile {
  const now = Date.now()
  return {
    userId,
    createdAt: now,
    updatedAt: now,
    verbosity: "normal",
    codeStyle: {
      paradigm: null,
      exportStyle: null,
      typeStyle: null,
      maxLineLength: null,
    },
    overrides: {},
    runStats: {
      totalRuns: 0,
      successfulRuns: 0,
      averageIterations: 0,
      averageTokens: 0,
      averageDurationMs: 0,
      taskClassDistribution: {},
      averageEvalScore: null,
    },
    persistentNotes: [],
  }
}

/**
 * Merge a partial update into an existing profile (shallow merge per top-level key).
 * Returns a new profile — does not mutate the input.
 */
export function updateProfile(
  profile: UserProfile,
  updates: Partial<Pick<UserProfile, "verbosity" | "codeStyle" | "overrides" | "persistentNotes">>,
): UserProfile {
  const merged: UserProfile = {
    ...profile,
    updatedAt: Date.now(),
  }

  if (updates.verbosity !== undefined) {
    merged.verbosity = updates.verbosity
  }
  if (updates.codeStyle !== undefined) {
    merged.codeStyle = { ...profile.codeStyle, ...updates.codeStyle }
  }
  if (updates.overrides !== undefined) {
    merged.overrides = { ...profile.overrides, ...updates.overrides }
  }
  if (updates.persistentNotes !== undefined) {
    merged.persistentNotes = [...updates.persistentNotes]
  }

  return merged
}

/**
 * Update run stats after a completed run. Computes running averages
 * without storing the full history.
 *
 * Uses incremental running average: newAvg = oldAvg + (value - oldAvg) / newCount
 * Returns a new profile — does not mutate the input.
 */
export function recordRunStats(
  profile: UserProfile,
  run: {
    iterations: number
    tokens: number
    durationMs: number
    taskClass: string
    evalScore?: number
  },
): UserProfile {
  const prev = profile.runStats
  const newCount = prev.totalRuns + 1

  // Incremental running averages
  const averageIterations = prev.averageIterations + (run.iterations - prev.averageIterations) / newCount
  const averageTokens = prev.averageTokens + (run.tokens - prev.averageTokens) / newCount
  const averageDurationMs = prev.averageDurationMs + (run.durationMs - prev.averageDurationMs) / newCount

  // Task class distribution
  const taskClassDistribution = { ...prev.taskClassDistribution }
  taskClassDistribution[run.taskClass] = (taskClassDistribution[run.taskClass] ?? 0) + 1

  // Eval score — only update if this run has a score
  let averageEvalScore = prev.averageEvalScore
  if (run.evalScore !== undefined) {
    if (averageEvalScore === null) {
      // First scored run
      averageEvalScore = run.evalScore
    } else {
      // Count the number of scored runs from distribution + count
      // We need a separate count for scored runs. Since we only have
      // averageEvalScore and totalRuns, we track scored runs as
      // successfulRuns (a run with an eval score counts as successful).
      const prevScoredRuns = prev.successfulRuns
      const newScoredCount = prevScoredRuns + 1
      averageEvalScore = averageEvalScore + (run.evalScore - averageEvalScore) / newScoredCount
    }
  }

  // A run with an eval score counts toward successfulRuns
  const successfulRuns = run.evalScore !== undefined
    ? prev.successfulRuns + 1
    : prev.successfulRuns

  return {
    ...profile,
    updatedAt: Date.now(),
    runStats: {
      totalRuns: newCount,
      successfulRuns,
      averageIterations,
      averageTokens,
      averageDurationMs,
      taskClassDistribution,
      averageEvalScore,
    },
  }
}
