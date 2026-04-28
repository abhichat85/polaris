/**
 * Task classifier — D-039.
 *
 * Categorizes an agent run as `trivial`, `standard`, or `hard` so that
 * `agent-loop.ts` can pick the right Claude model (Haiku/Sonnet/Opus)
 * and apply the right iteration budget multiplier (G.1).
 *
 * First-cut implementation is regex/keyword based: cheap, deterministic,
 * runs in microseconds, no model call required. The classifier sees the
 * user's prompt, the size of the active plan (if any), the count of
 * recently-edited files, and whether this is the first turn of the
 * conversation. A future iteration can replace the heuristic with a tiny
 * Haiku-classified pass at turn start.
 *
 * **Trivial signals:**
 *   - Short prompt (< 80 chars) AND
 *   - Imperative verb at the start (rename, fix typo, change, update,
 *     remove, delete, add) AND
 *   - No active multi-feature plan
 *
 * **Hard signals (any one matches):**
 *   - First turn of the conversation (initial scaffold from prompt)
 *   - Active plan has > 5 features (multi-sprint build)
 *   - Prompt contains: refactor, rewrite, investigate, debug,
 *     architecture, design, migrate, redesign
 *
 * **Standard:** everything else.
 */

export type TaskClass = "trivial" | "standard" | "hard"

export interface TaskClassifierInput {
  /** The most recent user message text. */
  userPrompt: string
  /** Number of features in the active plan (0 if no plan). */
  planSize: number
  /** Number of files edited in the last few turns. Hint at scope creep. */
  recentFileCount: number
  /** True iff this is the first user message of the conversation. */
  isFirstTurn: boolean
}

const TRIVIAL_VERB_RE = /^\s*(rename|fix\s+typo|change|update|remove|delete|add)\s/i
const HARD_KEYWORD_RE = /\b(refactor|rewrite|investigate|debug|architecture|design|migrate|redesign)\b/i
const TRIVIAL_PROMPT_MAX_CHARS = 80
const HARD_PLAN_FEATURE_THRESHOLD = 5

export function classifyTask(input: TaskClassifierInput): TaskClass {
  // Hard wins first — even a short "rename" inside a 6-feature plan is
  // probably not really "trivial" because the rename touches many files.
  if (input.isFirstTurn) return "hard"
  if (input.planSize > HARD_PLAN_FEATURE_THRESHOLD) return "hard"
  if (HARD_KEYWORD_RE.test(input.userPrompt)) return "hard"
  if (input.recentFileCount > 5) return "hard"

  // Trivial requires both signals (short + imperative).
  if (
    input.userPrompt.length < TRIVIAL_PROMPT_MAX_CHARS &&
    TRIVIAL_VERB_RE.test(input.userPrompt)
  ) {
    return "trivial"
  }

  return "standard"
}
