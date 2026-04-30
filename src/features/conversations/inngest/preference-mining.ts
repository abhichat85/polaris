/**
 * Phase 5 — Nightly preference-mining job.
 *
 * Two Inngest functions:
 *   1. `preferenceMiningScheduler` — cron-triggered (03:00 UTC daily).
 *      Looks up users with agent activity in the last 7 days via
 *      `harness_telemetry.getActiveUsersSinceInternal` and fans out a
 *      `preference/mine-user` event per user.
 *   2. `preferenceMineUser` — per-user worker. Loads the profile,
 *      recent telemetry, and recent feedback; runs the Calibrator;
 *      mines additional satisfaction signals from feedback; upserts
 *      learned preferences.
 *
 * Design notes:
 *   - All upserts are wrapped in `step.run` so Inngest can retry/dedupe
 *     each side-effect independently.
 *   - The scheduler is best-effort per user — one user's failure to
 *     enqueue must not break the entire fan-out.
 *   - Pure helpers (`computeSatisfactionVerdict`, `extractComplaintKeywords`)
 *     are exported for unit testing without standing up Inngest.
 *   - Preference key naming convention: dot-separated namespaces
 *     (`calibrator.<param>`, `feedback.<signal>`).
 */

import { ConvexHttpClient } from "convex/browser"
import { NonRetriableError } from "inngest"

import { inngest } from "@/inngest/client"
import { calibrate } from "@/lib/agent-kit/core/calibrator"

import { api } from "../../../../convex/_generated/api"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000
const ACTIVE_WINDOW_DAYS = 7
const FEEDBACK_WINDOW_DAYS = 30
const TELEMETRY_LIMIT = 100

const SATISFACTION_HIGH_RATE = 0.7
const SATISFACTION_LOW_RATE = 0.5
const SATISFACTION_MIN_FEEDBACK = 10

const SATISFACTION_HIGH_CONFIDENCE = 0.8
const SATISFACTION_LOW_CONFIDENCE = 0.7
const KEYWORD_CONFIDENCE = 0.6

const DEFAULT_TOP_KEYWORDS = 3

/**
 * English stop-word list used by the keyword extractor. Kept inline (and
 * intentionally short) — we only need to filter the most common filler.
 */
const STOP_WORDS = new Set<string>([
  "the", "a", "an", "and", "or", "but", "if", "then", "else", "for", "to",
  "of", "in", "on", "at", "by", "with", "from", "as", "is", "are", "was",
  "were", "be", "been", "being", "do", "does", "did", "have", "has", "had",
  "this", "that", "these", "those", "it", "its", "i", "you", "we", "they",
  "he", "she", "them", "us", "my", "your", "our", "their", "his", "her",
  "not", "no", "so", "too", "very", "can", "could", "should", "would",
  "will", "just", "than", "there", "here", "what", "when", "where", "why",
  "how", "which", "who", "whom", "all", "any", "some", "more", "most",
  "much", "many", "other", "such", "only", "own", "same", "out", "up",
  "down", "off", "over", "under", "again", "into", "about", "after",
  "before", "because", "while", "also", "doesn", "don", "didn", "isn",
  "wasn", "aren", "weren", "won", "shouldn", "wouldn", "couldn", "got",
])

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Outcome of evaluating a user's thumbs distribution. */
export interface SatisfactionVerdict {
  verdict: "high" | "low" | "mixed" | "unknown"
  confidence: number
}

interface FeedbackRow {
  rating: "up" | "down"
  comment?: string
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Compute a satisfaction verdict from raw thumbs counts.
 *
 * Rules:
 *   - Below `SATISFACTION_MIN_FEEDBACK` total rows → "unknown".
 *   - thumbs-up rate > 70% → "high" (confidence 0.8).
 *   - thumbs-down rate > 50% → "low" (confidence 0.7).
 *   - Otherwise → "mixed" (confidence 0.5).
 *
 * @param thumbsUp Count of thumbs-up rows for the window.
 * @param thumbsDown Count of thumbs-down rows for the window.
 * @param total Total feedback rows considered (must be >= thumbsUp + thumbsDown).
 */
export function computeSatisfactionVerdict(
  thumbsUp: number,
  thumbsDown: number,
  total: number,
): SatisfactionVerdict {
  if (total < SATISFACTION_MIN_FEEDBACK) {
    return { verdict: "unknown", confidence: 0 }
  }
  const upRate = thumbsUp / total
  const downRate = thumbsDown / total
  if (upRate > SATISFACTION_HIGH_RATE) {
    return { verdict: "high", confidence: SATISFACTION_HIGH_CONFIDENCE }
  }
  if (downRate > SATISFACTION_LOW_RATE) {
    return { verdict: "low", confidence: SATISFACTION_LOW_CONFIDENCE }
  }
  return { verdict: "mixed", confidence: 0.5 }
}

/**
 * Extract the top-N most common keywords from a list of free-form
 * comments. Tokenises on non-word characters, lowercases, drops tokens
 * shorter than 4 chars, and filters out an English stop-word list.
 *
 * Pure + deterministic — given the same input, returns the same output.
 *
 * @param comments Array of comment strings (typically thumbs-down comments).
 * @param topN How many keywords to return (default 3).
 */
export function extractComplaintKeywords(
  comments: string[],
  topN: number = DEFAULT_TOP_KEYWORDS,
): string[] {
  const counts = new Map<string, number>()
  for (const raw of comments) {
    if (!raw) continue
    const tokens = raw
      .toLowerCase()
      .split(/[^a-z0-9'-]+/)
      .filter((t) => t.length >= 4 && !STOP_WORDS.has(t))
    for (const t of tokens) {
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]
      return a[0].localeCompare(b[0])
    })
    .slice(0, topN)
    .map(([word]) => word)
}

/**
 * Tally a feedback row list into thumbs-up / thumbs-down counts and
 * collect thumbs-down comments. Pure helper — exported for testability.
 */
export function tallyFeedback(rows: FeedbackRow[]): {
  thumbsUp: number
  thumbsDown: number
  total: number
  downComments: string[]
} {
  let thumbsUp = 0
  let thumbsDown = 0
  const downComments: string[] = []
  for (const row of rows) {
    if (row.rating === "up") thumbsUp += 1
    else if (row.rating === "down") {
      thumbsDown += 1
      if (row.comment && row.comment.trim().length > 0) {
        downComments.push(row.comment)
      }
    }
  }
  return { thumbsUp, thumbsDown, total: thumbsUp + thumbsDown, downComments }
}

// ---------------------------------------------------------------------------
// Inngest function A — scheduler
// ---------------------------------------------------------------------------

/**
 * Daily scheduler. At 03:00 UTC every day, looks up users with agent
 * activity in the last 7 days and fans out a per-user mining event.
 *
 * Best-effort: a single `inngest.send` failure is logged but does not
 * abort the rest of the fan-out. The scheduler itself has retries:0 so
 * a transient Convex failure during candidate lookup just waits for
 * tomorrow's tick rather than re-running mid-day.
 */
export const preferenceMiningScheduler = inngest.createFunction(
  {
    id: "preference-mining-scheduler",
    name: "Preference Mining Scheduler",
    retries: 0,
  },
  { cron: "TZ=UTC 0 3 * * *" },
  async ({ step }) => {
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY
    if (!convexUrl || !internalKey) {
      throw new NonRetriableError(
        "NEXT_PUBLIC_CONVEX_URL + POLARIS_CONVEX_INTERNAL_KEY required.",
      )
    }
    const convex = new ConvexHttpClient(convexUrl)

    // Step 1 — find recently-active users.
    const userIds = await step.run("list-active-users", async () => {
      const sinceMs = Date.now() - ACTIVE_WINDOW_DAYS * DAY_MS
      const ids = await convex.query(
        api.harness_telemetry.getActiveUsersSinceInternal,
        { internalKey, sinceMs },
      )
      return ids ?? []
    })

    if (userIds.length === 0) {
      return { dispatched: 0, totalCandidates: 0 }
    }

    // Step 2 — fan out one mining event per user. Each send is wrapped
    // in its own try/catch so a single bad userId doesn't poison the
    // whole tick.
    const dispatched = await step.run("fan-out", async () => {
      let ok = 0
      for (const userId of userIds) {
        try {
          await inngest.send({
            name: "preference/mine-user",
            data: { userId },
          })
          ok += 1
        } catch (err) {
          // Best-effort — log and keep going.
          console.error(
            "[preference-mining-scheduler] failed to enqueue mine-user",
            { userId, err: err instanceof Error ? err.message : String(err) },
          )
        }
      }
      return ok
    })

    return { dispatched, totalCandidates: userIds.length }
  },
)

// ---------------------------------------------------------------------------
// Inngest function B — per-user mining worker
// ---------------------------------------------------------------------------

/**
 * Per-user preference mining. Triggered by `preference/mine-user`.
 *
 * Pipeline:
 *   1. Load profile (defaults if missing).
 *   2. Load recent telemetry (limit 100) and recent feedback (last 30d).
 *   3. Run the Calibrator → upsert each suggestion under
 *      "calibrator.<param>".
 *   4. Tally thumbs ratings → upsert "feedback.satisfaction" when the
 *      verdict is "high" or "low".
 *   5. Extract top-3 keywords from thumbs-down comments → upsert
 *      "feedback.complaint-keywords" when there's at least one comment.
 *
 * Each external call is a `step.run` so retries are idempotent at the
 * step boundary.
 */
export const preferenceMineUser = inngest.createFunction(
  {
    id: "preference-mine-user",
    name: "Preference Mining (per user)",
    retries: 1,
  },
  { event: "preference/mine-user" },
  async ({ event, step }) => {
    const userId = (event.data as { userId?: string })?.userId
    if (!userId) {
      throw new NonRetriableError("preference/mine-user: missing userId")
    }

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY
    if (!convexUrl || !internalKey) {
      throw new NonRetriableError(
        "NEXT_PUBLIC_CONVEX_URL + POLARIS_CONVEX_INTERNAL_KEY required.",
      )
    }
    const convex = new ConvexHttpClient(convexUrl)

    // Step 1 — profile.
    const profile = await step.run("load-profile", async () => {
      return await convex.query(
        api.agent_user_profiles.getOrDefaultInternal,
        { internalKey, userId },
      )
    })
    if (!profile) {
      // getOrDefaultInternal always returns at least the defaults; this
      // branch defends against an unexpected null and short-circuits.
      return { skipped: "no-profile" }
    }

    // Step 2a — telemetry. Loaded but not currently used by the
    // calibration math (calibrator works off the profile's runStats);
    // kept here so future signals can mine raw rows without a schema
    // change.
    await step.run("load-telemetry", async () => {
      return await convex.query(
        api.harness_telemetry.getRecentForUserInternal,
        { internalKey, userId, limit: TELEMETRY_LIMIT },
      )
    })

    // Step 2b — feedback (last 30 days).
    const feedbackRows = await step.run("load-feedback", async () => {
      const since = Date.now() - FEEDBACK_WINDOW_DAYS * DAY_MS
      return await convex.query(
        api.response_feedback.getRecentForUserInternal,
        { internalKey, userId, sinceMs: since },
      )
    })

    // Step 3 — calibrator.
    const calibration = calibrate(
      profile.runStats,
      profile.overrides as Record<string, number | boolean>,
      { minRuns: 5 },
    )

    let calibratorWrites = 0
    for (const suggestion of calibration.suggestions) {
      await step.run(`upsert-calibrator-${suggestion.parameter}`, async () => {
        await convex.mutation(api.learned_preferences.upsertInternal, {
          internalKey,
          userId,
          key: `calibrator.${suggestion.parameter}`,
          value: suggestion.suggestedValue,
          confidence: suggestion.confidence,
          sampleSize: profile.runStats.totalRuns,
        })
      })
      calibratorWrites += 1
    }

    // Step 4 — satisfaction verdict.
    const tally = tallyFeedback(feedbackRows ?? [])
    const verdict = computeSatisfactionVerdict(
      tally.thumbsUp,
      tally.thumbsDown,
      tally.total,
    )

    let satisfactionWrites = 0
    if (verdict.verdict === "high" || verdict.verdict === "low") {
      await step.run("upsert-satisfaction", async () => {
        await convex.mutation(api.learned_preferences.upsertInternal, {
          internalKey,
          userId,
          key: "feedback.satisfaction",
          value: verdict.verdict,
          confidence: verdict.confidence,
          sampleSize: tally.total,
        })
      })
      satisfactionWrites = 1
    }

    // Step 5 — complaint keywords.
    let keywordWrites = 0
    if (tally.downComments.length > 0) {
      const keywords = extractComplaintKeywords(tally.downComments)
      if (keywords.length > 0) {
        await step.run("upsert-complaint-keywords", async () => {
          await convex.mutation(api.learned_preferences.upsertInternal, {
            internalKey,
            userId,
            key: "feedback.complaint-keywords",
            value: keywords,
            confidence: KEYWORD_CONFIDENCE,
            sampleSize: tally.downComments.length,
          })
        })
        keywordWrites = 1
      }
    }

    return {
      userId,
      basedOnRuns: calibration.basedOnRuns,
      calibratorWrites,
      satisfactionWrites,
      keywordWrites,
      satisfactionVerdict: verdict.verdict,
    }
  },
)
