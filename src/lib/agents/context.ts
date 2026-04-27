/**
 * D-032 — provider-agnostic Context shape.
 *
 * Inspiration: pi-mono's `pi-ai` Context. Goal: a single serializable
 * conversation shape that all model adapters (Claude, GPT, Gemini) can
 * accept. Today's `Message[]` is Claude-baked; this is the migration
 * target.
 *
 * Phase 7 v1: type definitions + serialization helpers. Adapters still
 * accept Message[] for back-compat. The next session ports
 * ClaudeAdapter to accept Context, then the GPT/Gemini stubs become
 * real implementations against the same shape.
 */

import type { ToolCall, ToolDefinition } from "./types"

export type ContextRole = "system" | "user" | "assistant" | "tool"

/** A single content block inside a Context message. */
export type ContextBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | {
      type: "tool_result"
      toolUseId: string
      content: string
      isError?: boolean
    }
  | {
      type: "thinking"
      thinking: string
    }

export interface ContextMessage {
  role: ContextRole
  content: string | ContextBlock[]
}

/**
 * The full conversation state needed to run a single inference call.
 * Ergonomically serializable (no functions, no dates) so it can be
 * persisted to Convex, posted across the wire, and replayed.
 */
export interface Context {
  systemPrompt: string
  messages: ContextMessage[]
  tools: ToolDefinition[]
  /** Optional per-provider session id for caching. */
  sessionId?: string
  /** Anthropic prompt-cache retention hint. */
  cacheRetention?: "default" | "long"
}

/**
 * Serialise a Context to a plain JSON-friendly object. Useful for
 * cross-provider hand-off (pi-mono pattern) and for debugging.
 */
export function serializeContext(ctx: Context): string {
  return JSON.stringify(ctx)
}

export function parseContext(s: string): Context {
  const parsed = JSON.parse(s) as Context
  if (
    !parsed ||
    typeof parsed.systemPrompt !== "string" ||
    !Array.isArray(parsed.messages) ||
    !Array.isArray(parsed.tools)
  ) {
    throw new Error("parseContext: malformed JSON")
  }
  return parsed
}

/**
 * Convenience: build an assistant message from text + tool calls.
 * Used by adapter implementations to write back into Context after
 * each turn.
 */
export function makeAssistantMessage(
  text: string,
  toolCalls: ToolCall[],
): ContextMessage {
  if (text.length === 0 && toolCalls.length === 0) {
    return { role: "assistant", content: [] }
  }
  if (toolCalls.length === 0) {
    return { role: "assistant", content: text }
  }
  return {
    role: "assistant",
    content: [
      ...(text.length > 0 ? [{ type: "text" as const, text }] : []),
      ...toolCalls.map((tc) => ({
        type: "tool_use" as const,
        id: tc.id,
        name: tc.name,
        input: tc.input,
      })),
    ],
  }
}
