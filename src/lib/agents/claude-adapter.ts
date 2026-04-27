/**
 * ClaudeAdapter — concrete ModelAdapter for Anthropic Claude.
 * Authority: CONSTITUTION.md Article V §5.2, Article VI §6.1, plan 01 Task 5.
 *
 * Translation responsibilities:
 *   - Polaris Message[] → Anthropic message_param[] (tool role → user, blocks → wire format)
 *   - Polaris ToolDefinition[] → Anthropic tools[] (camelCase → snake_case wire field)
 *   - Anthropic stream events → AgentStep yields (text_delta, tool_call, usage, done)
 *
 * Streaming notes:
 *   - Tool input arrives as multiple `input_json_delta` events with partial_json
 *     fragments — we accumulate per content_block index, then JSON.parse on stop.
 *   - Multiple content blocks can interleave (e.g. text then tool_use). The block
 *     `index` field disambiguates which block a delta belongs to.
 */

import Anthropic from "@anthropic-ai/sdk"
import type {
  AgentStep,
  ContentBlock,
  Message,
  ModelAdapter,
  RunOptions,
  StopReason,
  ToolDefinition,
} from "./types"
import { STOP_REASONS } from "./types"
import { contextToMessages, type Context } from "./context"

export interface ClaudeAdapterConfig {
  apiKey: string
  model?: string
  /** Test seam — replace the SDK client. Production code never sets this. */
  clientFactory?: (apiKey: string) => MinimalAnthropicClient
}

/** Minimum surface ClaudeAdapter needs. Lets tests inject a fake without mocking the whole SDK. */
export interface MinimalAnthropicClient {
  messages: {
    stream: (params: {
      model: string
      max_tokens: number
      temperature?: number
      // D-023 — system can be a plain string OR an array of content blocks
      // (the latter shape supports `cache_control: { type: "ephemeral" }`).
      system?: string | Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }>
      messages: Array<{ role: "user" | "assistant"; content: unknown }>
      tools?: Array<{
        name: string
        description: string
        input_schema: unknown
        cache_control?: { type: "ephemeral" }
      }>
      // D-024 — extended thinking budget, off by default.
      thinking?: { type: "enabled"; budget_tokens: number }
    }) => AsyncIterable<unknown>
  }
}

const DEFAULT_MODEL = "claude-sonnet-4-6-20251015"

export class ClaudeAdapter implements ModelAdapter {
  readonly name = "claude"
  private readonly client: MinimalAnthropicClient
  private readonly model: string

  constructor(config: ClaudeAdapterConfig) {
    const factory =
      config.clientFactory ??
      ((apiKey: string) => new Anthropic({ apiKey }) as unknown as MinimalAnthropicClient)
    this.client = factory(config.apiKey)
    this.model = config.model ?? DEFAULT_MODEL
  }

  /**
   * D-032 — Context-shape entry point. Lets a caller speak the
   * provider-agnostic `Context` directly without manually splitting it
   * into `messages + systemPrompt + tools`. Internally delegates to
   * `runWithTools` so the wire-format + caching behaviour is identical.
   *
   * The `Context.systemPrompt` and `Context.tools` win over anything
   * passed in `opts` — they are part of the conversation state.
   */
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
    const wireMessages = this.translateMessages(messages)
    // D-023 — Anthropic caches the entire `tools` block when the LAST tool
    // carries `cache_control: ephemeral`. Tagging just the last entry
    // keeps the cache-key stable across tool order changes upstream.
    const wireTools = tools.map((t, i) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
      ...(i === tools.length - 1 && {
        cache_control: { type: "ephemeral" as const },
      }),
    }))

    let stream: AsyncIterable<unknown>
    try {
      stream = this.client.messages.stream({
        model: this.model,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature ?? 0.2,
        // D-023 — system prompt as a cached content block. A 30–60% input-
        // token discount on conversations >2 turns is typical.
        system: opts.systemPrompt
          ? [
              {
                type: "text" as const,
                text: opts.systemPrompt,
                cache_control: { type: "ephemeral" as const },
              },
            ]
          : undefined,
        messages: wireMessages,
        tools: wireTools.length > 0 ? wireTools : undefined,
      })
    } catch (err) {
      yield this.errorDone(err)
      return
    }

    let inputTokens = 0
    let outputTokens = 0
    // D-023 — cache metrics flow through usage event; 0 when caching disabled.
    let cacheCreationInputTokens = 0
    let cacheReadInputTokens = 0
    let stopReason: StopReason = "end_turn"
    /** Per-content-block accumulators for tool_use input JSON fragments. */
    const toolBlocks = new Map<number, { id: string; name: string; jsonAcc: string }>()
    // D-024 — track which content-block indexes are extended-thinking blocks
    // so we can emit thinking_end on their content_block_stop events.
    const thinkingBlocks = new Set<number>()

    try {
      for await (const event of stream as AsyncIterable<AnthropicStreamEvent>) {
        // The Anthropic SDK's stream event types are duck-typed unions; cast
        // through `any` for ergonomic discrimination by `event.type`.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ev = event as any
        switch (ev.type) {
          case "message_start":
            inputTokens = ev.message?.usage?.input_tokens ?? 0
            cacheCreationInputTokens =
              ev.message?.usage?.cache_creation_input_tokens ?? 0
            cacheReadInputTokens =
              ev.message?.usage?.cache_read_input_tokens ?? 0
            break

          case "content_block_start":
            if (ev.content_block?.type === "tool_use") {
              toolBlocks.set(ev.index, {
                id: ev.content_block.id,
                name: ev.content_block.name,
                jsonAcc: "",
              })
            } else if (ev.content_block?.type === "thinking") {
              // D-024 — extended-thinking block opened.
              thinkingBlocks.add(ev.index)
              yield { type: "thinking_start" }
            }
            break

          case "content_block_delta":
            if (ev.delta?.type === "text_delta") {
              yield { type: "text_delta", delta: ev.delta.text }
            } else if (ev.delta?.type === "thinking_delta") {
              // D-024 — extended thinking text fragment.
              if (typeof ev.delta.thinking === "string") {
                yield { type: "thinking_delta", delta: ev.delta.thinking }
              }
            } else if (ev.delta?.type === "input_json_delta") {
              const block = toolBlocks.get(ev.index)
              if (block) block.jsonAcc += ev.delta.partial_json
            }
            break

          case "content_block_stop": {
            const block = toolBlocks.get(ev.index)
            if (block) {
              const input = parseToolInput(block.jsonAcc)
              yield {
                type: "tool_call",
                toolCall: { id: block.id, name: block.name, input },
              }
              toolBlocks.delete(ev.index)
            }
            if (thinkingBlocks.has(ev.index)) {
              thinkingBlocks.delete(ev.index)
              yield { type: "thinking_end" }
            }
            break
          }

          case "message_delta":
            if (typeof ev.usage?.output_tokens === "number") {
              outputTokens += ev.usage.output_tokens
            }
            if (ev.delta?.stop_reason) {
              stopReason = normalizeStopReason(ev.delta.stop_reason)
            }
            break

          case "message_stop":
            // Terminal marker — handled by yielding usage + done after the loop.
            break
        }
      }
    } catch (err) {
      yield {
        type: "usage",
        inputTokens,
        outputTokens,
        cacheCreationInputTokens,
        cacheReadInputTokens,
      }
      yield this.errorDone(err)
      return
    }

    yield {
      type: "usage",
      inputTokens,
      outputTokens,
      cacheCreationInputTokens,
      cacheReadInputTokens,
    }
    yield { type: "done", stopReason }
  }

  private translateMessages(
    messages: Message[],
  ): Array<{ role: "user" | "assistant"; content: unknown }> {
    return messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "tool" ? "user" : (m.role as "user" | "assistant"),
        content:
          typeof m.content === "string" ? m.content : translateBlocks(m.content),
      }))
  }

  private errorDone(err: unknown): AgentStep {
    const message = err instanceof Error ? err.message : String(err)
    return { type: "done", stopReason: "error", error: message }
  }
}

function translateBlocks(blocks: ContentBlock[]): unknown[] {
  return blocks.map((b) => {
    switch (b.type) {
      case "text":
        return { type: "text", text: b.text }
      case "tool_use":
        return { type: "tool_use", id: b.id, name: b.name, input: b.input }
      case "tool_result":
        return {
          type: "tool_result",
          tool_use_id: b.toolUseId,
          content: b.content,
          is_error: b.isError ?? false,
        }
    }
  })
}

function parseToolInput(jsonAcc: string): Record<string, unknown> {
  if (!jsonAcc) return {}
  try {
    const parsed = JSON.parse(jsonAcc)
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {}
  } catch {
    // Defensive: if Claude streamed malformed JSON, return raw under a known key
    // so the executor can surface a helpful error rather than crashing.
    return { __unparsed_tool_input: jsonAcc }
  }
}

function normalizeStopReason(raw: string): StopReason {
  return (STOP_REASONS as readonly string[]).includes(raw) ? (raw as StopReason) : "error"
}

// ────────────────────────────────────────────────────────────────────────────
// Wire-format types (subset). We intentionally do NOT import from @anthropic-ai/sdk
// here because the SDK's streaming event types are deeply nested, change between
// versions, and we only need a stable subset.
// ────────────────────────────────────────────────────────────────────────────

interface AnthropicStreamEvent {
  type:
    | "message_start"
    | "content_block_start"
    | "content_block_delta"
    | "content_block_stop"
    | "message_delta"
    | "message_stop"
  index?: number
  message?: { id?: string; usage?: { input_tokens?: number; output_tokens?: number } }
  content_block?:
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: unknown }
  delta?:
    | { type: "text_delta"; text: string }
    | { type: "input_json_delta"; partial_json: string }
    | { stop_reason?: string }
  usage?: { output_tokens?: number }
}
