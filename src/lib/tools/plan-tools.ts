/**
 * Plan tools — Phase 3.3.
 *
 * Three tools that let the executor agent interact with the structured
 * plan stored in Convex (the `agent_plans` table):
 *
 *   - read_plan:                fetch the plan's feature list + statuses
 *   - update_feature_status:    mark a feature as in_progress / done /
 *                                blocked, with optional blocker note
 *   - request_planner_input:    pause and ask the planner subagent a
 *                                question; blocks on a Convex
 *                                subscription until answered or timed out
 *
 * The plan-storage / clarification round-trip lives in Convex
 * (api.agent_plans.*); this module is the harness-side adapter that
 * the executor calls.
 */

import type { ToolOutput } from "./types"

export interface PlanFeature {
  id: string
  title: string
  description: string
  acceptanceCriteria: string[]
  dependencies: string[]
  status: "pending" | "in_progress" | "done" | "blocked"
  blockers?: string[]
  updatedAt?: number
}

export interface PlanRecord {
  _id: string
  projectId: string
  title: string
  features: PlanFeature[]
  createdAt: number
  updatedAt: number
}

/* ─────────────────────────────────────────────────────────────────────────
 * Deps surface — agent-loop wires these to Convex/api.agent_plans.*
 * ───────────────────────────────────────────────────────────────────── */

export interface PlanToolsDeps {
  /** Fetch the project's plan, or null if no planner subagent has run yet. */
  getPlan: () => Promise<PlanRecord | null>
  /** Update the status of one feature in the plan. */
  updateFeatureStatus: (args: {
    featureId: string
    status: PlanFeature["status"]
    blocker?: string
  }) => Promise<void>
  /** Submit a question to the planner subagent; resolve with the answer. */
  requestPlannerInput?: (args: {
    question: string
    timeoutMs: number
  }) => Promise<{ answer: string } | { timedOut: true }>
  /** Bound on clarifications per agent run (default 3). */
  maxClarificationsPerRun?: number
}

/* ─────────────────────────────────────────────────────────────────────────
 * Tool input/output shapes
 * ───────────────────────────────────────────────────────────────────── */

export interface ReadPlanArgs {
  /** When true, omit completed features from the result. Default false. */
  pendingOnly?: boolean
}

export interface UpdateFeatureStatusArgs {
  featureId: string
  status: PlanFeature["status"]
  /** Required when status === "blocked". */
  blocker?: string
}

export interface RequestPlannerInputArgs {
  question: string
  /** Optional override; default 60s. Hard max 5min. */
  timeoutMs?: number
}

const DEFAULT_CLARIFICATION_TIMEOUT_MS = 60_000
const MAX_CLARIFICATION_TIMEOUT_MS = 5 * 60_000
const DEFAULT_MAX_CLARIFICATIONS = 3

/* ─────────────────────────────────────────────────────────────────────────
 * Tool runners
 * ───────────────────────────────────────────────────────────────────── */

export async function executeReadPlan(
  args: ReadPlanArgs,
  deps: PlanToolsDeps,
): Promise<ToolOutput> {
  const plan = await deps.getPlan()
  if (!plan) {
    return {
      ok: true,
      data: {
        formatted:
          "No plan exists for this project yet. The planner subagent hasn't run.",
        plan: null,
      },
    }
  }
  const features = args.pendingOnly
    ? plan.features.filter((f) => f.status !== "done")
    : plan.features
  return {
    ok: true,
    data: {
      formatted: formatPlan(plan, features),
      title: plan.title,
      featureCount: features.length,
      features,
    },
  }
}

export async function executeUpdateFeatureStatus(
  args: UpdateFeatureStatusArgs,
  deps: PlanToolsDeps,
): Promise<ToolOutput> {
  if (typeof args.featureId !== "string" || args.featureId.length === 0) {
    return {
      ok: false,
      error: "featureId is required",
      errorCode: "INTERNAL_ERROR",
    }
  }
  if (args.status === "blocked" && (!args.blocker || args.blocker.length === 0)) {
    return {
      ok: false,
      error: "status='blocked' requires a non-empty `blocker` reason",
      errorCode: "INTERNAL_ERROR",
    }
  }
  try {
    await deps.updateFeatureStatus({
      featureId: args.featureId,
      status: args.status,
      blocker: args.blocker,
    })
    return {
      ok: true,
      data: {
        formatted: `Feature ${args.featureId} → ${args.status}${args.blocker ? ` (blocker: ${args.blocker})` : ""}`,
      },
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      errorCode: "INTERNAL_ERROR",
    }
  }
}

/**
 * Tracks per-run clarification budget so the executor can't ping-pong
 * forever. Created once per agent run by the executor.
 */
export class ClarificationBudget {
  private used = 0
  constructor(private readonly max: number = DEFAULT_MAX_CLARIFICATIONS) {}

  consume(): boolean {
    if (this.used >= this.max) return false
    this.used++
    return true
  }

  remaining(): number {
    return Math.max(0, this.max - this.used)
  }
}

export async function executeRequestPlannerInput(
  args: RequestPlannerInputArgs,
  deps: PlanToolsDeps,
  budget: ClarificationBudget,
): Promise<ToolOutput> {
  if (!deps.requestPlannerInput) {
    return {
      ok: false,
      error:
        "Planner clarification is not configured for this project (no plan exists or planner subagent unavailable).",
      errorCode: "INTERNAL_ERROR",
    }
  }
  if (typeof args.question !== "string" || args.question.length === 0) {
    return {
      ok: false,
      error: "question is required",
      errorCode: "INTERNAL_ERROR",
    }
  }
  if (!budget.consume()) {
    return {
      ok: false,
      error: `Clarification budget exhausted (max ${DEFAULT_MAX_CLARIFICATIONS} per run). Proceed with best judgment and add a feature blocker if needed.`,
      errorCode: "INTERNAL_ERROR",
    }
  }
  const timeoutMs = Math.min(
    Math.max(1_000, args.timeoutMs ?? DEFAULT_CLARIFICATION_TIMEOUT_MS),
    MAX_CLARIFICATION_TIMEOUT_MS,
  )
  try {
    const result = await deps.requestPlannerInput({
      question: args.question,
      timeoutMs,
    })
    if ("timedOut" in result) {
      return {
        ok: true,
        data: {
          formatted: `[Planner did not respond within ${timeoutMs}ms — proceed with best guess and add a feature blocker if needed.]`,
          timedOut: true,
        },
      }
    }
    return {
      ok: true,
      data: {
        formatted: `[Planner answered]\n\n${result.answer}`,
        answer: result.answer,
      },
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      errorCode: "INTERNAL_ERROR",
    }
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * Formatter
 * ───────────────────────────────────────────────────────────────────── */

function formatPlan(plan: PlanRecord, features: PlanFeature[]): string {
  const lines: string[] = [`# ${plan.title}`, ""]
  for (const f of features) {
    const statusBadge = f.status === "done" ? "✓" : f.status === "in_progress" ? "→" : f.status === "blocked" ? "✗" : "·"
    lines.push(`${statusBadge} **${f.id}** — ${f.title} [${f.status}]`)
    if (f.description) lines.push(`  ${f.description}`)
    if (f.acceptanceCriteria.length > 0) {
      lines.push(`  Acceptance:`)
      for (const ac of f.acceptanceCriteria) lines.push(`    - ${ac}`)
    }
    if (f.dependencies.length > 0) {
      lines.push(`  Depends on: ${f.dependencies.join(", ")}`)
    }
    if (f.blockers && f.blockers.length > 0) {
      lines.push(`  Blockers:`)
      for (const b of f.blockers) lines.push(`    - ${b}`)
    }
    lines.push("")
  }
  return lines.join("\n")
}
