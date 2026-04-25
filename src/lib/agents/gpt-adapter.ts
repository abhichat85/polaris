/**
 * GPTAdapter — v1 stub. Authority: CONSTITUTION §5.2, ROADMAP O-001.
 *
 * The class exists so the abstraction layer is real (no implicit Claude-only
 * coupling in the loop). v1.1 will fill it in. Calling runWithTools throws
 * loudly so we never accidentally ship a half-working OpenAI path.
 */

import type {
  AgentStep,
  Message,
  ModelAdapter,
  RunOptions,
  ToolDefinition,
} from "./types"

export interface GPTAdapterConfig {
  apiKey: string
  model?: string
}

export class GPTAdapter implements ModelAdapter {
  readonly name = "gpt"

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_config: GPTAdapterConfig) {
    // Intentionally empty in v1.
  }

  async *runWithTools(
    _messages: Message[],
    _tools: ToolDefinition[],
    _opts: RunOptions,
  ): AsyncGenerator<AgentStep, void, void> {
    throw new Error(
      "GPTAdapter not implemented in v1. See CONSTITUTION §5.2 and ROADMAP O-001.",
    )
    // Unreachable — present so TypeScript treats this as a generator.
    yield { type: "done", stopReason: "error" } as AgentStep
  }
}
