/**
 * prompt-enrichment — pure types and helpers for the intent-alignment
 * loop that runs BEFORE the first `plan/run` event is fired.
 *
 * The loop scores the user's raw prompt for completeness across several
 * dimensions, generates targeted clarifying questions for the lowest-
 * scoring gaps, collects answers, and compiles an enriched task brief
 * that replaces the raw prompt when the planner is invoked.
 *
 * Zero external dependencies — safe to import in tests, edge functions,
 * Inngest workers, and UI components.
 */

// ── Thresholds & limits ────────────────────────────────────────────────────

/** Score at-or-above which we proceed to planning without more questions. */
export const PROCEED_THRESHOLD = 0.82

/** Never ask more than this many rounds of questions. */
export const MAX_ROUNDS = 3

/** Max questions generated per round. */
export const QUESTIONS_PER_ROUND = 3

// ── Types ──────────────────────────────────────────────────────────────────

/** A single dimension the LLM scores to assess prompt completeness. */
export type EnrichmentDimension = {
  id: string
  label: string
  /** 0–1; values < 0.6 are considered "gaps" that warrant a question. */
  score: number
  /** Human-readable gap description when score < 0.6. Null otherwise. */
  gap: string | null
}

/** One clarifying question generated for a gap dimension. */
export type EnrichmentQuestion = {
  id: string
  text: string
  type: "radio" | "multiselect" | "freetext"
  /** Required for radio / multiselect; absent for freetext. */
  options?: string[]
  /** Which gap this question addresses. Optional for forward-compat. */
  dimensionId?: string
}

/** A user's answer to a single question. */
export type EnrichmentAnswer = {
  questionId: string
  /** For radio: one option string. For multiselect: comma-joined. For freetext: raw text. */
  answer: string
}

/** One complete Q&A round in the enrichment session. */
export type EnrichmentRound = {
  questions: EnrichmentQuestion[]
  /** Undefined while waiting for the user to answer. */
  answers?: EnrichmentAnswer[]
  /** Score recalculated after incorporating these answers (set by the scorer). */
  scoreAfter?: number
}

/** State-machine status of an enrichment session. */
export type EnrichmentStatus = "scoring" | "collecting" | "ready" | "skipped"

/** Full session shape (mirrors the Convex `prompt_enrichment_sessions` document). */
export type EnrichmentSession = {
  _id?: string
  conversationId: string
  projectId: string
  userId: string
  rawPrompt: string
  rounds: EnrichmentRound[]
  currentScore: number
  status: EnrichmentStatus
  /** Set when status transitions to "ready" or "skipped". */
  enrichedPrompt?: string
  createdAt: number
  updatedAt: number
}

// ── Dimension catalogue ─────────────────────────────────────────────────────

export const DIMENSION_IDS = [
  "goal_clarity",
  "visual_style",
  "audience",
  "auth_model",
  "data_model",
  "integrations",
  "scope_boundaries",
  "tech_preferences",
] as const

export type DimensionId = (typeof DIMENSION_IDS)[number]

export const DIMENSION_LABELS: Record<DimensionId, string> = {
  goal_clarity: "Goal clarity",
  visual_style: "Visual style",
  audience: "Target audience",
  auth_model: "Auth & accounts",
  data_model: "Data model",
  integrations: "Integrations",
  scope_boundaries: "Scope boundaries",
  tech_preferences: "Tech preferences",
}

// ── Decision helpers ───────────────────────────────────────────────────────

/**
 * Should we proceed to planning? True when the score has reached the
 * threshold OR when max rounds have been exhausted.
 */
export function shouldProceed(score: number, roundIndex: number): boolean {
  return score >= PROCEED_THRESHOLD || roundIndex >= MAX_ROUNDS
}

// ── Prompt compiler ────────────────────────────────────────────────────────

/**
 * Compile a task brief from the raw prompt and all answered rounds.
 * The output is used as the `userPrompt` argument to `plan/run`.
 * Falls back to the raw prompt if no answers have been collected.
 */
export function compileEnrichedPrompt(
  rawPrompt: string,
  rounds: EnrichmentRound[],
): string {
  const answeredRounds = rounds.filter(
    (r) => r.answers && r.answers.length > 0,
  )

  if (answeredRounds.length === 0) {
    return rawPrompt
  }

  const lines: string[] = [
    rawPrompt,
    "",
    "## Clarifications provided by the user:",
    "",
  ]

  for (const round of answeredRounds) {
    for (const answer of round.answers ?? []) {
      const question = round.questions.find((q) => q.id === answer.questionId)
      if (!question) continue
      const answerText = answer.answer.trim()
      if (!answerText) continue
      lines.push(`- **${question.text}**`)
      lines.push(`  ${answerText}`)
    }
  }

  return lines.join("\n")
}

// ── UI helpers ─────────────────────────────────────────────────────────────

/**
 * Map a completeness score to a colour token for the score ring.
 * Red < 55 %, amber < threshold, green ≥ threshold.
 */
export function scoreToColor(score: number): "red" | "amber" | "green" {
  if (score < 0.55) return "red"
  if (score < PROCEED_THRESHOLD) return "amber"
  return "green"
}

/**
 * Format a 0–1 score as a percentage string ("62%").
 */
export function scoreToPercent(score: number): string {
  return `${Math.round(score * 100)}%`
}

// ── LLM prompt builders ────────────────────────────────────────────────────

/**
 * System prompt fragment sent to the scoring LLM.
 * Exported so it can be unit-tested independently.
 */
export function buildScoringSystemPrompt(): string {
  return `You are a prompt completeness analyst for a software-development AI.
Your job is to evaluate how complete and actionable a project description is, then generate targeted clarifying questions for the weakest areas.

Score each dimension from 0.00 to 1.00:
- goal_clarity: Is the core product or feature clearly defined?
- visual_style: Is the visual design aesthetic specified (dark/light, minimal/rich, etc.)?
- audience: Is the target user or customer defined?
- auth_model: Are user accounts and authentication needs clear?
- data_model: Are key data entities and their relationships defined?
- integrations: Are third-party services, APIs, or external tools mentioned?
- scope_boundaries: Is it clear what is in and out of scope?
- tech_preferences: Are technology stack preferences mentioned?

Overall score = average of all dimension scores.

Rules for question generation:
1. Only generate questions for dimensions scoring below 0.65.
2. Generate at most ${QUESTIONS_PER_ROUND} questions per call.
3. Prefer "radio" or "multiselect" questions with 3–5 concrete options over freetext.
4. Make options specific to the user's domain (not generic placeholders).
5. Sort questions by information gain — highest gap dimension first.
6. If overall score is already ≥ ${PROCEED_THRESHOLD}, return an empty questions array.

Respond with ONLY valid JSON in this exact shape (no markdown, no explanation):
{
  "overallScore": number,
  "dimensions": [
    { "id": string, "label": string, "score": number, "gap": string | null }
  ],
  "questions": [
    {
      "id": string,
      "text": string,
      "type": "radio" | "multiselect" | "freetext",
      "options": string[] | null,
      "dimensionId": string
    }
  ]
}`
}

/**
 * Build the user-turn message for the scoring LLM call.
 * Incorporates previous rounds' Q&A so the LLM can account for
 * already-provided context when rescoring.
 */
export function buildScoringUserPrompt(
  rawPrompt: string,
  rounds: EnrichmentRound[],
): string {
  const parts: string[] = [`Project prompt:\n${rawPrompt}`]

  const prevAnswered = rounds.filter((r) => r.answers?.length)
  if (prevAnswered.length > 0) {
    parts.push("\nClarifications already provided by the user:")
    for (const r of prevAnswered) {
      for (const ans of r.answers ?? []) {
        const q = r.questions.find((q) => q.id === ans.questionId)
        if (q) parts.push(`  Q: ${q.text}\n  A: ${ans.answer}`)
      }
    }
  }

  parts.push(
    "\nScore completeness and generate clarifying questions for the lowest-scoring dimensions.",
  )

  return parts.join("\n")
}
