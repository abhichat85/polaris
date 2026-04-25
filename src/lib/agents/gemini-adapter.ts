/**
 * GeminiAdapter — v1 stub. Authority: CONSTITUTION §5.2, ROADMAP O-001.
 *
 * See GPTAdapter for the rationale: wired so the abstraction is real, throws
 * at runtime so we never silently ship a half-working Gemini path.
 */

import type {
  AgentStep,
  Message,
  ModelAdapter,
  RunOptions,
  ToolDefinition,
} from "./types"

export interface GeminiAdapterConfig {
  apiKey: string
  model?: string
}

export class GeminiAdapter implements ModelAdapter {
  readonly name = "gemini"

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_config: GeminiAdapterConfig) {
    // Intentionally empty in v1.
  }

  async *runWithTools(
    _messages: Message[],
    _tools: ToolDefinition[],
    _opts: RunOptions,
  ): AsyncGenerator<AgentStep, void, void> {
    throw new Error(
      "GeminiAdapter not implemented in v1. See CONSTITUTION §5.2 and ROADMAP O-001.",
    )
    yield { type: "done", stopReason: "error" } as AgentStep
  }
}
