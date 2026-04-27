/**
 * Local replacements for the type-only imports we previously took from
 * the Vercel AI SDK (`"ai"`, `@ai-sdk/*`). Authority: D-007 — Polaris
 * uses the raw `@anthropic-ai/sdk` directly; the Vercel AI SDK is a
 * full dependency we have no runtime use for.
 *
 * These types intentionally mirror the SDK v6 shapes so the existing
 * `src/components/ai-elements/*` components compile against them
 * without behavior change. NOTE: these components are scaffolded UI
 * primitives — Polaris's actual conversation rendering is in
 * `src/features/conversations/components/`. We keep these scaffolds
 * for future use but they're not on the active runtime path today.
 */

export type UIMessageRole =
  | "system"
  | "user"
  | "assistant"
  | "data"
  | "tool";

export interface UIMessage {
  id: string;
  role: UIMessageRole;
  content: string;
  parts?: Array<UIMessagePart>;
}

export type UIMessagePart =
  | { type: "text"; text: string }
  | FileUIPart
  | ToolUIPart;

export interface FileUIPart {
  type: "file";
  /** Base64 (or data: URL when prefixed). */
  data?: string;
  /** Direct URL form (blob: / data: / https:). */
  url?: string;
  mimeType?: string;
  /** v6 alias for mimeType. */
  mediaType?: string;
  /** Filename for display. */
  name?: string;
  /** Filename for backwards-compat with v6 shape. */
  filename?: string;
}

/**
 * Discriminated union covering the v6 tool lifecycle states.
 * `state` evolves: input-streaming → input-available → output-available
 * (or output-error / output-denied), with optional approval pause.
 */
export type ToolUIPart = {
  type: `tool-${string}`;
  toolCallId: string;
  toolName?: string;
  state:
    | "input-streaming"
    | "input-available"
    | "approval-requested"
    | "approval-responded"
    | "output-available"
    | "output-error"
    | "output-denied";
  /** Tool input being streamed in or finalized. */
  input?: unknown;
  /** Tool output (when state is output-available). */
  output?: unknown;
  /** Error string when state is output-error. */
  errorText?: string;
  /** Legacy convenience aliases — some helpers reference these. */
  args?: unknown;
  result?: unknown;
};

export type ChatStatus = "submitted" | "streaming" | "ready" | "error";

export interface LanguageModelUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  /** Some providers report cached-input tokens. */
  cachedPromptTokens?: number;
  cachedInputTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  /** Anthropic / OpenAI o1-style reasoning token accounting. */
  reasoningTokens?: number;
}

/**
 * Mirrors `Experimental_GeneratedImage` from `ai`. Polaris's image
 * pipeline produces the same shape (base64 + mime type) so no
 * runtime behaviour changes.
 */
export interface Experimental_GeneratedImage {
  base64: string;
  mimeType: string;
  /** v6 alias for mimeType. */
  mediaType?: string;
  /** Some providers return a direct URL instead of base64. */
  url?: string;
  /** v6 binary form. */
  uint8Array?: Uint8Array;
}
