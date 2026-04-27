/**
 * GeminiAdapter — real implementation against Google's `:streamGenerateContent`
 * REST API. Authority: CONSTITUTION §5.2 (model abstraction), D-032 (Context).
 *
 * Like GPTAdapter, this talks REST through fetch + SSE — no vendor SDK.
 *
 * Translation responsibilities:
 *   - Polaris Message[] → Gemini contents[] with role { user | model } and
 *     parts[]. system message → top-level systemInstruction.
 *     - tool_use block → parts[].functionCall { name, args }
 *     - tool_result block → user-role contents entry with
 *       parts[].functionResponse { name, response }
 *   - ToolDefinition[] → tools: [{ functionDeclarations: [...] }]
 *   - SSE chunks have shape:
 *       { candidates: [{ content: { parts: [{text}|{functionCall}] },
 *                        finishReason }],
 *         usageMetadata: { promptTokenCount, candidatesTokenCount } }
 *
 * Differences vs OpenAI:
 *   - Gemini streams complete functionCall objects in one shot (no JSON
 *     fragmenting). We emit tool_call as soon as we see one.
 *   - Roles map: assistant → "model", system has its own field.
 *   - Tool responses are user-role contents, not a dedicated role.
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

const DEFAULT_MODEL = "gemini-2.0-flash"
const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta"

export interface GeminiAdapterConfig {
  apiKey: string
  model?: string
  baseUrl?: string
  fetchImpl?: typeof fetch
}

export class GeminiAdapter implements ModelAdapter {
  readonly name = "gemini"
  private readonly apiKey: string
  private readonly model: string
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(config: GeminiAdapterConfig) {
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
    const contents = translateMessages(messages)
    const wireTools =
      tools.length > 0
        ? [
            {
              functionDeclarations: tools.map((t) => ({
                name: t.name,
                description: t.description,
                parameters: t.inputSchema,
              })),
            },
          ]
        : undefined

    const url =
      `${this.baseUrl}/models/${encodeURIComponent(this.model)}:streamGenerateContent` +
      `?alt=sse&key=${encodeURIComponent(this.apiKey)}`

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: opts.temperature ?? 0.2,
        maxOutputTokens: opts.maxTokens,
      },
    }
    if (opts.systemPrompt) {
      body.systemInstruction = {
        role: "system",
        parts: [{ text: opts.systemPrompt }],
      }
    }
    if (wireTools) body.tools = wireTools

    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
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
        error: `Gemini ${response.status}: ${errText.slice(0, 300)}`,
      }
      return
    }

    let inputTokens = 0
    let outputTokens = 0
    let stopReason: StopReason = "end_turn"

    try {
      for await (const ev of iterateSse(response.body)) {
        let chunk: GeminiStreamChunk
        try {
          chunk = JSON.parse(ev.data) as GeminiStreamChunk
        } catch {
          continue
        }

        if (chunk.usageMetadata) {
          inputTokens = chunk.usageMetadata.promptTokenCount ?? inputTokens
          outputTokens =
            chunk.usageMetadata.candidatesTokenCount ?? outputTokens
        }

        const candidate = chunk.candidates?.[0]
        if (!candidate) continue

        for (const part of candidate.content?.parts ?? []) {
          if (typeof part.text === "string" && part.text.length > 0) {
            yield { type: "text_delta", delta: part.text }
          }
          if (part.functionCall) {
            yield {
              type: "tool_call",
              toolCall: {
                // Gemini doesn't surface tool-call IDs; synthesize a
                // stable one from name+timestamp so downstream tool_result
                // pairing has a unique key.
                id: `gemini_${part.functionCall.name}_${Date.now().toString(36)}_${Math.random()
                  .toString(36)
                  .slice(2, 8)}`,
                name: part.functionCall.name,
                input:
                  part.functionCall.args && typeof part.functionCall.args === "object"
                    ? (part.functionCall.args as Record<string, unknown>)
                    : {},
              },
            }
          }
        }

        if (candidate.finishReason) {
          stopReason = mapFinishReason(candidate.finishReason)
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
 * Polaris Message[] → Gemini contents[].
 * Roles: user → "user", assistant → "model", tool → "user" with
 * functionResponse parts.
 */
function translateMessages(messages: Message[]): WireGeminiContent[] {
  const out: WireGeminiContent[] = []
  for (const m of messages) {
    if (m.role === "system") continue // routed via systemInstruction

    if (typeof m.content === "string") {
      out.push({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })
      continue
    }

    if (m.role === "tool") {
      const parts: WireGeminiPart[] = []
      for (const block of m.content) {
        if (block.type === "tool_result") {
          // Best-effort response shape: wrap as { content: <string> } so
          // models always see a structured response.
          parts.push({
            functionResponse: {
              // The ID-vs-name issue: Polaris carries toolUseId, but
              // Gemini's functionResponse is keyed by tool *name*.
              // Upstream callers should pair tool_use → tool_result by
              // ID and let the agent loop fill name on construction;
              // for now we encode the id and let the model reconcile.
              name: block.toolUseId,
              response: { content: block.content },
            },
          })
        }
      }
      if (parts.length > 0) out.push({ role: "user", parts })
      continue
    }

    // assistant with mixed text + tool_use blocks
    if (m.role === "assistant") {
      const parts: WireGeminiPart[] = []
      for (const block of m.content) {
        if (block.type === "text") {
          if (block.text.length > 0) parts.push({ text: block.text })
        } else if (block.type === "tool_use") {
          parts.push({
            functionCall: { name: block.name, args: block.input },
          })
        }
      }
      if (parts.length > 0) out.push({ role: "model", parts })
      continue
    }

    // user (block-shape, no tools)
    const parts: WireGeminiPart[] = m.content
      .filter(
        (b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text",
      )
      .map((b) => ({ text: b.text }))
    if (parts.length > 0) out.push({ role: "user", parts })
  }
  return out
}

function mapFinishReason(raw: string): StopReason {
  switch (raw) {
    case "STOP":
      return "end_turn"
    case "MAX_TOKENS":
      return "max_tokens"
    case "SAFETY":
    case "RECITATION":
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
// Wire-format types — minimal subset of Gemini REST schemas.
// ────────────────────────────────────────────────────────────────────────────

interface WireGeminiContent {
  role: "user" | "model"
  parts: WireGeminiPart[]
}

type WireGeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: unknown } }
  | { functionResponse: { name: string; response: unknown } }

interface GeminiStreamChunk {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
        functionCall?: { name: string; args?: unknown }
      }>
    }
    finishReason?: string
  }>
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
  }
}
