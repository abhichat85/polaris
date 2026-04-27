/**
 * D-027 — Compactor agent. Called from the AgentRunner when the running
 * conversation crosses the compaction threshold. Returns a structured
 * handoff artifact (string) that becomes the seed user message for the
 * agent's next iteration after a full state reset.
 *
 * Why full reset > in-place compaction:
 * Anthropic's harness-design article reports that Claude Sonnet 4.5
 * exhibits "context anxiety" — it begins wrapping up work prematurely
 * as the context window approaches its limit. Full reset + structured
 * handoff defeats this anxiety because the new turn starts at ~0 tokens.
 */

import Anthropic from "@anthropic-ai/sdk"

import { COMPACTOR_SYSTEM_PROMPT } from "./compactor-prompt"
import type { Message } from "./types"

export interface CompactorConfig {
  apiKey: string
  model?: string
}

export interface CompactorOutput {
  artifact: string
  inputTokens: number
  outputTokens: number
}

const DEFAULT_MODEL = "claude-sonnet-4-6-20251015"
const MAX_OUTPUT_TOKENS = 4_000

/** Threshold at which the AgentRunner calls the Compactor. */
export const COMPACTION_THRESHOLD_TOKENS = 100_000

/**
 * Convert the running conversation messages into a single text payload
 * for the Compactor. We strip tool_result blocks that are large (>1KB)
 * — the Compactor doesn't need them, only the user/assistant intent.
 */
function flattenConversation(messages: Message[]): string {
  const parts: string[] = []
  for (const m of messages) {
    if (typeof m.content === "string") {
      parts.push(`${m.role.toUpperCase()}: ${m.content}`)
    } else {
      const text = m.content
        .map((b) => {
          if (b.type === "text") return b.text
          if (b.type === "tool_use") return `[tool_use: ${b.name}]`
          if (b.type === "tool_result") {
            const c = typeof b.content === "string" ? b.content : ""
            return c.length > 1024
              ? `[tool_result truncated: ${c.length}b]`
              : `[tool_result: ${c}]`
          }
          return ""
        })
        .filter(Boolean)
        .join("\n")
      parts.push(`${m.role.toUpperCase()}: ${text}`)
    }
  }
  return parts.join("\n\n")
}

export class Compactor {
  private readonly client: Anthropic
  private readonly model: string

  constructor(cfg: CompactorConfig) {
    this.client = new Anthropic({ apiKey: cfg.apiKey })
    this.model = cfg.model ?? DEFAULT_MODEL
  }

  async compact(messages: Message[]): Promise<CompactorOutput> {
    const conversation = flattenConversation(messages)
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      // D-023 — cache the system prompt; the Compactor is invoked many
      // times across long-running runs.
      system: [
        {
          type: "text",
          text: COMPACTOR_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content:
            "Conversation so far:\n\n" +
            conversation +
            "\n\nProduce the handoff artifact now.",
        },
      ],
    })

    const textBlock = response.content.find((b) => b.type === "text")
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Compactor: model returned no text content")
    }
    return {
      artifact: textBlock.text.trim(),
      inputTokens: response.usage.input_tokens ?? 0,
      outputTokens: response.usage.output_tokens ?? 0,
    }
  }
}
