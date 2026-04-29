/**
 * ModelAdapter abstraction — canonical location.
 *
 * This is the single source of truth for the agent-kit's core type
 * definitions.  All Polaris-side code should re-export from here.
 *
 * Authority: CONSTITUTION.md Article VI §6.1, §6.3.
 *
 * Every model (Claude, GPT, Gemini) implements `ModelAdapter`. The agent loop
 * works against this interface only — it never imports `@anthropic-ai/sdk`,
 * `openai`, or `@google/generative-ai` directly. This keeps the loop testable
 * with a stub adapter and makes future model swaps cheap.
 */

export type MessageRole = "system" | "user" | "assistant" | "tool"

export interface TextBlock {
  type: "text"
  text: string
}

export interface ToolUseBlock {
  type: "tool_use"
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolResultBlock {
  type: "tool_result"
  toolUseId: string
  content: string
  isError?: boolean
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock

export interface Message {
  role: MessageRole
  content: string | ContentBlock[]
}

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: {
    type: "object"
    properties: Record<string, unknown>
    required?: string[]
  }
}

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
}

export interface RunOptions {
  systemPrompt: string
  maxTokens: number
  timeoutMs: number
  temperature?: number
  /** Optional AbortSignal for cancellation. */
  signal?: AbortSignal
}

export const AGENT_STEP_TYPES = ["text_delta", "tool_call", "usage", "done"] as const
export type AgentStepType = (typeof AGENT_STEP_TYPES)[number]

export const STOP_REASONS = [
  "end_turn",
  "max_tokens",
  "tool_use",
  "stop_sequence",
  "error",
] as const
export type StopReason = (typeof STOP_REASONS)[number]

export type AgentStep =
  | { type: "text_delta"; delta: string }
  | { type: "tool_call"; toolCall: ToolCall }
  | {
      type: "usage"
      inputTokens: number
      outputTokens: number
      // D-023 — Anthropic prompt caching reports cache reads/creates as
      // separate token counts; we stream both so the billing layer can
      // compute the discounted cost (cache reads are ~10× cheaper).
      cacheCreationInputTokens?: number
      cacheReadInputTokens?: number
    }
  // D-024 — extended thinking blocks streamed as their own events.
  | { type: "thinking_start" }
  | { type: "thinking_delta"; delta: string }
  | { type: "thinking_end" }
  | { type: "done"; stopReason: StopReason; error?: string }

export interface ModelAdapter {
  readonly name: string
  runWithTools(
    messages: Message[],
    tools: ToolDefinition[],
    opts: RunOptions,
  ): AsyncGenerator<AgentStep, void, void>
}
