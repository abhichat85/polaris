/**
 * Haiku-powered summarizer — used by web_fetch and any other tool that
 * wants to compress a large blob of text against a question.
 *
 * Cheap call, prompt-cached system message. Returns plain text (the
 * caller is responsible for trimming). Falls back to the original
 * content on any error so callers don't have to handle SDK failures.
 */

import Anthropic from "@anthropic-ai/sdk"
import { CLAUDE_HAIKU_4_5 } from "./task-models"

const SUMMARIZER_SYSTEM_PROMPT = `You are a focused content summarizer for an AI coding agent.

Given a question and a chunk of fetched web content, return only the
information that is directly useful to answer the question. Do NOT
include filler ("Here is the summary…"), site navigation, or footer
boilerplate. Preserve code samples verbatim. Output is plain Markdown,
ready to be appended to the agent's working notes.`

const MAX_INPUT_CHARS = 60_000 // ~15K tokens — comfortably under Haiku's window
const MAX_OUTPUT_TOKENS = 1_500

export interface HaikuSummarizerOptions {
  /** Override Anthropic API key. Defaults to process.env.ANTHROPIC_API_KEY. */
  apiKey?: string
  /** Override model id. */
  model?: string
}

export class HaikuSummarizer {
  private readonly client: Anthropic
  private readonly model: string

  constructor(opts: HaikuSummarizerOptions = {}) {
    this.client = new Anthropic({ apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY })
    this.model = opts.model ?? CLAUDE_HAIKU_4_5
  }

  async summarize(content: string, question: string, source?: string): Promise<string> {
    // Truncate aggressively — we'd rather lose tail content than fail.
    const trimmed =
      content.length > MAX_INPUT_CHARS
        ? content.slice(0, MAX_INPUT_CHARS) + "\n\n[…content truncated for summarization…]"
        : content

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: [
          {
            type: "text",
            text: SUMMARIZER_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: [
              source ? `Source: ${source}\n\n` : "",
              `Question: ${question}\n\n`,
              `Content:\n${trimmed}`,
            ].join(""),
          },
        ],
      })
      const block = response.content.find((b) => b.type === "text")
      if (block && block.type === "text") {
        return block.text.trim()
      }
      return content // fall back to raw
    } catch (err) {
      // Never fail the caller because summarization broke; return raw.
      // Log to stderr for ops visibility.
      // eslint-disable-next-line no-console
      console.warn("[HaikuSummarizer] summarize failed; returning raw:", err)
      return content
    }
  }
}

/** Convenience binder for callers that want a plain function reference. */
export function makeSummarizer(
  opts: HaikuSummarizerOptions = {},
): (content: string, question: string, source: string) => Promise<string> {
  const inst = new HaikuSummarizer(opts)
  return (c, q, s) => inst.summarize(c, q, s)
}
