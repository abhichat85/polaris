/**
 * GPTAdapter — real implementation against the OpenAI Chat Completions
 * streaming API. Authority: CONSTITUTION §5.2 (model abstraction),
 * D-032 (provider-agnostic Context).
 *
 * Why REST not the `openai` SDK: pi-mono's lesson — abstractions stay
 * honest when they don't import vendor SDKs. We talk REST through
 * fetch + the small `iterateSse` helper, which keeps the bundle small
 * and the adapter layer truly swappable.
 *
 * Translation responsibilities:
 *   - Polaris Message[] → ChatML messages[]
 *     - role: "tool" → role: "tool" with tool_call_id (one per tool_result block)
 *     - assistant content with tool_use blocks → assistant message with tool_calls[]
 *   - Polaris ToolDefinition[] → OpenAI tools[] with {type:"function", function:{...}}
 *   - SSE stream events → AgentStep yields
 *     - delta.content → text_delta
 *     - delta.tool_calls[i].function.{name,arguments} → accumulate, emit tool_call on finish
 *     - finish_reason → done.stopReason
 *     - usage chunk (only when stream_options.include_usage = true) → usage
 */

import type {
  AgentStep,
  ContentBlock,
  Message,
  ModelAdapter,
  RunOptions,
  StopReason,
  ToolDefinition,
} from "./types"
import { contextToMessages, type Context } from "./context"
import { iterateSse } from "./sse"

const DEFAULT_MODEL = "gpt-4o"
const DEFAULT_BASE = "https://api.openai.com/v1"

export interface GPTAdapterConfig {
  apiKey: string
  model?: string
  /** Override the API base URL — for self-hosted/Azure-style routing. */
  baseUrl?: string
  /**
   * Test seam — replace the network transport. Production passes through
   * to global fetch. Tests inject a fake that returns a Response whose
   * body is an SSE stream of pre-canned events.
   */
  fetchImpl?: typeof fetch
}

export class GPTAdapter implements ModelAdapter {
  readonly name = "gpt"
  private readonly apiKey: string
  private readonly model: string
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(config: GPTAdapterConfig) {
    this.apiKey = config.apiKey
    this.model = config.model ?? DEFAULT_MODEL
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE
    this.fetchImpl = config.fetchImpl ?? fetch.bind(globalThis)
  }

  /** D-032 Context entry-point. */
  runWithContext(
    ctx: Context,
    opts: Omit<RunOptions, "systemPrompt"> & { systemPrompt?: string },
  ): AsyncGenerator<AgentStep, void, void> {
    return this.runWithTools(contextToMessages(ctx), ctx.tools, {
      ...opts,
      systemPrompt: ctx.systemPrompt ?? opts.systemPrompt ?? "",
    })
  }

  async *runWithTools(
    messages: Message[],
    tools: ToolDefinition[],
    opts: RunOptions,
  ): AsyncGenerator<AgentStep, void, void> {
    const wireMessages = translateMessages(messages, opts.systemPrompt)
    const wireTools = tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }))

    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: wireMessages,
          tools: wireTools.length > 0 ? wireTools : undefined,
          temperature: opts.temperature ?? 0.2,
          max_tokens: opts.maxTokens,
          stream: true,
          stream_options: { include_usage: true },
        }),
        signal: opts.signal,
      })
    } catch (err) {
      yield this.errorDone(err)
      return
    }

    if (!response.ok) {
      const errText = await safeReadText(response)
      yield {
        type: "usage",
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      }
      yield {
        type: "done",
        stopReason: "error",
        error: `OpenAI ${response.status}: ${errText.slice(0, 300)}`,
      }
      return
    }

    let inputTokens = 0
    let outputTokens = 0
    let stopReason: StopReason = "end_turn"
    /**
     * OpenAI streams tool calls as deltas keyed by `index` (the position
     * in the assistant message's tool_calls array). Each delta may
     * carry `id`, `function.name`, and chunks of `function.arguments`
     * which together form the JSON input.
     */
    const toolAcc = new Map<
      number,
      { id: string; name: string; jsonAcc: string }
    >()

    try {
      for await (const ev of iterateSse(response.body)) {
        if (ev.data === "[DONE]") break

        let chunk: OpenAiStreamChunk
        try {
          chunk = JSON.parse(ev.data) as OpenAiStreamChunk
        } catch {
          continue
        }

        // Final chunk (with stream_options.include_usage) carries usage
        // and an empty choices array.
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens ?? inputTokens
          outputTokens = chunk.usage.completion_tokens ?? outputTokens
        }

        const choice = chunk.choices?.[0]
        if (!choice) continue

        if (choice.delta?.content) {
          yield { type: "text_delta", delta: choice.delta.content }
        }

        if (choice.delta?.tool_calls) {
          for (const tcDelta of choice.delta.tool_calls) {
            const idx = tcDelta.index ?? 0
            let block = toolAcc.get(idx)
            if (!block) {
              block = { id: "", name: "", jsonAcc: "" }
              toolAcc.set(idx, block)
            }
            if (tcDelta.id) block.id = tcDelta.id
            if (tcDelta.function?.name) block.name = tcDelta.function.name
            if (tcDelta.function?.arguments) {
              block.jsonAcc += tcDelta.function.arguments
            }
          }
        }

        if (choice.finish_reason) {
          stopReason = mapFinishReason(choice.finish_reason)
        }
      }
    } catch (err) {
      yield {
        type: "usage",
        inputTokens,
        outputTokens,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      }
      yield this.errorDone(err)
      return
    }

    // Flush any completed tool_call accumulators in index order.
    const sortedIndexes = [...toolAcc.keys()].sort((a, b) => a - b)
    for (const idx of sortedIndexes) {
      const block = toolAcc.get(idx)!
      if (!block.id || !block.name) continue
      yield {
        type: "tool_call",
        toolCall: {
          id: block.id,
          name: block.name,
          input: parseToolInput(block.jsonAcc),
        },
      }
    }

    yield {
      type: "usage",
      inputTokens,
      outputTokens,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    }
    yield { type: "done", stopReason }
  }

  private errorDone(err: unknown): AgentStep {
    const message = err instanceof Error ? err.message : String(err)
    return { type: "done", stopReason: "error", error: message }
  }
}

/**
 * Polaris Message[] → OpenAI ChatML messages[].
 * Each Polaris assistant message with tool_use blocks expands into ONE
 * ChatML assistant message with `tool_calls`. Each Polaris tool message
 * with N tool_result blocks expands into N ChatML "tool" messages.
 */
function translateMessages(
  messages: Message[],
  systemPrompt: string,
): WireChatMessage[] {
  const out: WireChatMessage[] = []
  if (systemPrompt) {
    out.push({ role: "system", content: systemPrompt })
  }
  for (const m of messages) {
    if (m.role === "system") {
      // Polaris convention: system prompt always flows via RunOptions.
      // Tolerate stray system messages by appending as additional system.
      const text = typeof m.content === "string" ? m.content : ""
      if (text) out.push({ role: "system", content: text })
      continue
    }
    if (typeof m.content === "string") {
      if (m.role === "tool") {
        // No tool_call_id — best-effort fallback, rarely used.
        out.push({
          role: "tool",
          content: m.content,
          tool_call_id: "unknown",
        })
      } else {
        out.push({ role: m.role, content: m.content })
      }
      continue
    }
    if (m.role === "tool") {
      for (const block of m.content) {
        if (block.type === "tool_result") {
          out.push({
            role: "tool",
            tool_call_id: block.toolUseId,
            content: block.content,
          })
        }
      }
      continue
    }
    if (m.role === "assistant") {
      const text = textOf(m.content)
      const toolCalls = m.content
        .filter((b): b is Extract<ContentBlock, { type: "tool_use" }> =>
          b.type === "tool_use",
        )
        .map((b) => ({
          id: b.id,
          type: "function" as const,
          function: {
            name: b.name,
            arguments: JSON.stringify(b.input),
          },
        }))
      const msg: WireChatMessage = {
        role: "assistant",
        content: text || null,
      }
      if (toolCalls.length > 0) msg.tool_calls = toolCalls
      out.push(msg)
      continue
    }
    // user
    out.push({ role: "user", content: textOf(m.content) })
  }
  return out
}

function textOf(blocks: ContentBlock[]): string {
  return blocks
    .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("")
}

function parseToolInput(jsonAcc: string): Record<string, unknown> {
  if (!jsonAcc) return {}
  try {
    const parsed = JSON.parse(jsonAcc)
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return { __unparsed_tool_input: jsonAcc }
  }
}

function mapFinishReason(raw: string): StopReason {
  switch (raw) {
    case "stop":
      return "end_turn"
    case "length":
      return "max_tokens"
    case "tool_calls":
    case "function_call":
      return "tool_use"
    case "content_filter":
      return "stop_sequence"
    default:
      return "end_turn"
  }
}

async function safeReadText(r: Response): Promise<string> {
  try {
    return await r.text()
  } catch {
    return "(no body)"
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Wire-format types — minimal subset of OpenAI Chat Completions schemas.
// ────────────────────────────────────────────────────────────────────────────

type WireChatMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant"
      content: string | null
      tool_calls?: Array<{
        id: string
        type: "function"
        function: { name: string; arguments: string }
      }>
    }
  | { role: "tool"; tool_call_id: string; content: string }

interface OpenAiStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string
      tool_calls?: Array<{
        index?: number
        id?: string
        function?: { name?: string; arguments?: string }
      }>
    }
    finish_reason?: string | null
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}
