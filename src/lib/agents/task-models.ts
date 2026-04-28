/**
 * Task → Claude model mapping (D-040, plan F.2).
 *
 * The default route picks Opus for hard tasks (planner, evaluator,
 * complex multi-file edits), Sonnet for standard work, and Haiku for
 * trivial typo / single-line edits. Compactor uses Haiku because its
 * job is summarization, not generation.
 *
 * Tier gating is applied UPSTREAM by `agent-loop.ts`:
 *   - free tier → always Sonnet (no Opus, no Haiku) regardless of task
 *   - pro/team → full routing per the table below
 *
 * Per-project settings can also force a specific model
 * (`projects.modelOverride`); when set, that wins over the table.
 */

import type { TaskClass } from "./task-classifier"

/**
 * The role the model is being asked to play. `taskClass` covers main
 * agent runs; `planner`/`evaluator`/`compactor` are the supporting
 * subagents of the Polaris harness.
 */
export type AgentRole =
  | "planner"
  | "evaluator"
  | "compactor"
  | "executor" // main agent loop — paired with TaskClass

export interface ResolveModelInput {
  role: AgentRole
  /** Required when role === "executor"; ignored otherwise. */
  taskClass?: TaskClass
}

// Anthropic model ids — keep in sync with claude-adapter DEFAULT_MODEL.
export const CLAUDE_OPUS_4_7 = "claude-opus-4-7-20250514"
export const CLAUDE_SONNET_4_6 = "claude-sonnet-4-6-20251015"
export const CLAUDE_HAIKU_4_5 = "claude-haiku-4-5-20250929"

const ROLE_MODEL_TABLE: Record<AgentRole, string> = {
  planner: CLAUDE_OPUS_4_7,
  evaluator: CLAUDE_OPUS_4_7,
  compactor: CLAUDE_HAIKU_4_5,
  executor: CLAUDE_SONNET_4_6, // overridden per task class below
}

const TASK_CLASS_TABLE: Record<TaskClass, string> = {
  trivial: CLAUDE_HAIKU_4_5,
  standard: CLAUDE_SONNET_4_6,
  hard: CLAUDE_OPUS_4_7,
}

/**
 * Pick the default Claude model for a role. For the main executor loop
 * the result is further refined by the `taskClass`. Returns the
 * Anthropic model id string (e.g. "claude-sonnet-4-6-20251015").
 *
 * Callers must layer tier gating + per-project overrides on top — this
 * function is a pure mapping.
 */
export function resolveTaskModel(input: ResolveModelInput): string {
  if (input.role === "executor") {
    if (!input.taskClass) {
      // Defensive: an executor call without a class falls back to Sonnet.
      return CLAUDE_SONNET_4_6
    }
    return TASK_CLASS_TABLE[input.taskClass]
  }
  return ROLE_MODEL_TABLE[input.role]
}

/**
 * Apply free-tier gating: free tier is locked to Sonnet for the executor
 * (and also for planner/evaluator, since those subagents are gated
 * upstream anyway in the existing harness — but this pin makes it
 * explicit and uniform). Compactor stays on Haiku (it's the cheap path).
 */
export function applyTierGate(
  plan: "free" | "pro" | "team",
  resolved: string,
  role: AgentRole,
): string {
  if (plan !== "free") return resolved
  if (role === "compactor") return CLAUDE_HAIKU_4_5
  return CLAUDE_SONNET_4_6
}
