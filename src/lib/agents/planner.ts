/**
 * D-026 — Planner agent. Single Anthropic call, no tool use.
 *
 * Input: a 1–4 sentence user prompt (+ optional spec attachment).
 * Output: a `Plan` (parsed from the model's markdown reply).
 *
 * The planner uses prompt caching on its system prompt (D-023) since the
 * system prompt is stable. The user prompt + any spec attachment is the
 * only variable input.
 */

import Anthropic from "@anthropic-ai/sdk"

import { PLANNER_SYSTEM_PROMPT } from "./planner-system-prompt"
import { parsePlan, type Plan } from "@/lib/specs/plan-format"

export interface PlannerConfig {
  apiKey: string
  /** Override the model — pinned to a long-context, instruction-tuned default. */
  model?: string
}

export interface PlannerInput {
  /** The user's prompt from the hero textarea (1–4 sentences typically). */
  userPrompt: string
  /** Optional uploaded spec content (markdown / yaml / plain text). */
  specAttachment?: { name: string; body: string }
}

export interface PlannerOutput {
  plan: Plan
  rawMarkdown: string
  /** Token accounting for billing + cost reports. */
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
}

const DEFAULT_MODEL = "claude-sonnet-4-5"
const MAX_OUTPUT_TOKENS = 8_000
const TIMEOUT_MS = 5 * 60_000

/**
 * Build the user message content. If a spec attachment is present we
 * inline it as an XML-flavoured block so the model knows to honour it.
 */
function buildUserMessage(input: PlannerInput): string {
  const parts: string[] = []
  if (input.specAttachment) {
    parts.push(
      `<spec source="${input.specAttachment.name}">\n${input.specAttachment.body.trim()}\n</spec>`,
    )
  }
  parts.push(input.userPrompt.trim())
  return parts.join("\n\n")
}

export class Planner {
  private readonly client: Anthropic
  private readonly model: string

  constructor(config: PlannerConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey })
    this.model = config.model ?? DEFAULT_MODEL
  }

  async plan(input: PlannerInput): Promise<PlannerOutput> {
    const userContent = buildUserMessage(input)

    const response = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        // D-023 — cache the system prompt; planner runs are stable, so the
        // cache hits on every retry/regeneration.
        system: [
          {
            type: "text",
            text: PLANNER_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userContent }],
      },
      { timeout: TIMEOUT_MS },
    )

    // Extract text content (planner returns a single text block).
    const textBlock = response.content.find((b) => b.type === "text")
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Planner: model returned no text content")
    }
    const rawMarkdown = textBlock.text.trim()

    // Strip optional ```markdown fences if the model wrapped the plan.
    const stripped = rawMarkdown
      .replace(/^```(?:markdown|md)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim()

    const plan = parsePlan(stripped)
    if (plan.sprints.length === 0) {
      throw new Error(
        "Planner: parsed plan has no sprints — model output failed to match the canonical format",
      )
    }

    const usage = response.usage
    return {
      plan,
      rawMarkdown: stripped,
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      cacheCreationInputTokens:
        (usage as { cache_creation_input_tokens?: number })
          .cache_creation_input_tokens ?? 0,
      cacheReadInputTokens:
        (usage as { cache_read_input_tokens?: number })
          .cache_read_input_tokens ?? 0,
    }
  }
}
