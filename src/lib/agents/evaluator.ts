/**
 * D-028 — Evaluator agent. Read-only by design — its tool surface
 * deliberately excludes write/edit/create/delete. Grades a sprint
 * against the plan's acceptance criteria and returns a verdict.
 *
 * Authority: Anthropic harness design article. Generator + Evaluator
 * separation defeats the "self-praise" failure mode of single-agent
 * loops. Tier-gated to Pro/Team in agent-loop.ts (cost protection).
 */

import Anthropic from "@anthropic-ai/sdk"

import { EVALUATOR_SYSTEM_PROMPT } from "./evaluator-prompt"

export type Verdict = "PASS" | "RETURN-FOR-FIX" | "FAIL"

export interface EvalScores {
  functionality: number
  codeQuality: number
  design: number
  buildHealth: number
}

export interface EvalReport {
  verdict: Verdict
  scores: EvalScores
  rationale: Record<keyof EvalScores, string>
  issues: string[]
  summary: string
}

export interface EvaluatorConfig {
  apiKey: string
  model?: string
}

export interface EvaluatorInput {
  /** Sprint number being graded. */
  sprint: number
  /** Plan markdown (for acceptance-criteria context). */
  planMarkdown: string
  /** Convex projectId for the read-only tool surface. */
  projectId: string
  /**
   * D-031 — pre-computed mechanical lint findings. eval/run Inngest fn
   * loads project files + runs `runLints(...)` before calling the
   * Evaluator. Findings are folded into the rubric and the issues[] in
   * the EvalReport.
   */
  lintFindings?: Array<{
    path: string
    lintId: string
    severity: "error" | "warning"
    message: string
    remediation: string
  }>
}

const DEFAULT_MODEL = "claude-sonnet-4-5"
const MAX_OUTPUT_TOKENS = 4_000
const TIMEOUT_MS = 10 * 60_000

/**
 * For Phase 3 v1 we run the Evaluator without tool calling — it grades
 * by reading the plan + a Convex-side digest of the project state. When
 * Phase 4 (browser tools) lands, the Evaluator gains the read-only tool
 * surface and can drive the actual app.
 *
 * Even in v1, this is meaningfully better than self-eval: the Evaluator
 * is a separate Anthropic call with no awareness of how the Generator
 * built things.
 */
export class Evaluator {
  private readonly client: Anthropic
  private readonly model: string

  constructor(cfg: EvaluatorConfig) {
    this.client = new Anthropic({ apiKey: cfg.apiKey })
    this.model = cfg.model ?? DEFAULT_MODEL
  }

  async evaluate(input: EvaluatorInput): Promise<EvalReport> {
    // D-031 — fold mechanical lint findings into the prompt so the
    // Evaluator weights them in `codeQuality` + lists actionable
    // remediation in `issues[]`.
    const lintBlock =
      input.lintFindings && input.lintFindings.length > 0
        ? `\n\n--- MECHANICAL LINT FINDINGS ---\n` +
          input.lintFindings
            .map(
              (l) =>
                `[${l.severity.toUpperCase()}] ${l.path} (${l.lintId})\n  ${l.message}\n  remediation: ${l.remediation}`,
            )
            .join("\n\n") +
          `\n--- END LINT FINDINGS ---\n` +
          `These are mechanical findings from the project's invariants. Each is\n` +
          `actionable. Include them verbatim in your \`issues[]\` if they affect\n` +
          `this sprint's features. Reduce \`codeQuality\` accordingly.`
        : ""

    const userContent =
      `Sprint to grade: ${input.sprint}\n\n` +
      `--- PLAN ---\n${input.planMarkdown}\n--- END PLAN ---` +
      lintBlock +
      `\n\nGrade the sprint above. Return ONLY the JSON object as documented.`

    const response = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: [
          {
            type: "text",
            text: EVALUATOR_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userContent }],
      },
      { timeout: TIMEOUT_MS },
    )

    const textBlock = response.content.find((b) => b.type === "text")
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Evaluator: model returned no text content")
    }

    // Strip optional fences if the model wrapped the JSON.
    const raw = textBlock.text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim()

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      throw new Error(
        `Evaluator: model returned non-JSON content. Raw: ${raw.slice(0, 200)}`,
      )
    }

    if (!isEvalReport(parsed)) {
      throw new Error("Evaluator: parsed JSON does not match EvalReport shape")
    }
    return parsed
  }
}

function isEvalReport(x: unknown): x is EvalReport {
  if (!x || typeof x !== "object") return false
  const o = x as Record<string, unknown>
  if (
    o.verdict !== "PASS" &&
    o.verdict !== "RETURN-FOR-FIX" &&
    o.verdict !== "FAIL"
  )
    return false
  if (!o.scores || typeof o.scores !== "object") return false
  const s = o.scores as Record<string, unknown>
  for (const k of ["functionality", "codeQuality", "design", "buildHealth"]) {
    if (typeof s[k] !== "number") return false
  }
  if (!Array.isArray(o.issues)) return false
  if (typeof o.summary !== "string") return false
  return true
}
