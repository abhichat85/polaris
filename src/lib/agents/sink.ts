/**
 * AgentSink — abstraction for the side effects an agent run produces.
 * Authority: CONSTITUTION §3.2 (Day-1 abstractions), §10 (Convex source of truth).
 *
 * The AgentRunner does not import `convex/browser` or `api.messages.*` directly;
 * it calls AgentSink methods. This keeps the runner unit-testable with an
 * InMemoryAgentSink and lets the Convex schema evolve under the runner's feet.
 *
 * Concrete implementations:
 *   - InMemoryAgentSink → tests
 *   - ConvexAgentSink   → production (wraps the appropriate Convex mutations)
 */

import type { Message, ToolCall } from "./types"
import type { ToolOutput } from "@/lib/tools/types"

export interface ConversationMessage {
  role: "user" | "assistant"
  content: string
}

export interface AgentCheckpoint {
  messageId: string
  projectId: string
  messages: Message[]
  iterationCount: number
  totalInputTokens: number
  totalOutputTokens: number
  lastToolCallName?: string
  savedAt: number
}

export type AgentDoneStatus = "completed" | "error" | "cancelled"

export interface AgentDonePayload {
  status: AgentDoneStatus
  errorMessage?: string
  inputTokens: number
  outputTokens: number
}

export interface AgentSink {
  /** Initial conversation messages to seed the loop. */
  loadInitialMessages(conversationId: string): Promise<ConversationMessage[]>

  /** Append a streaming text delta to the assistant message. */
  appendText(messageId: string, delta: string): Promise<void>

  /**
   * D-024 — append a streaming extended-thinking fragment. Optional —
   * sinks that don't care about thinking can no-op (default impl in
   * InMemoryAgentSink does so).
   */
  appendThinking?(messageId: string, delta: string): Promise<void>

  /** Persist a tool call (so the UI can render the tool card). */
  appendToolCall(messageId: string, toolCall: ToolCall): Promise<void>

  /** Persist a tool result. */
  appendToolResult(messageId: string, toolCallId: string, result: ToolOutput): Promise<void>

  /**
   * Record token usage (drives billing quota — sub-plan 08).
   *
   * D-023 — `cacheCreationInputTokens` and `cacheReadInputTokens` are
   * Anthropic prompt-cache breakdowns. Both are optional for back-compat
   * with adapters that don't yet emit them.
   */
  recordUsage(
    userId: string,
    inputTokens: number,
    outputTokens: number,
    cacheCreationInputTokens?: number,
    cacheReadInputTokens?: number,
  ): Promise<void>

  /** Save a checkpoint snapshot. Called after each iteration. */
  saveCheckpoint(checkpoint: AgentCheckpoint): Promise<void>

  /** Load the most recent checkpoint for resuming after an Inngest retry. */
  loadCheckpoint(messageId: string): Promise<AgentCheckpoint | null>

  /** Final status update for the message. */
  markDone(messageId: string, payload: AgentDonePayload): Promise<void>

  /** Returns true if a cancellation has been signalled for this message. */
  isCancelled(messageId: string): Promise<boolean>

  /**
   * D-033 — steering hook (pi-mono port). Returns the next un-consumed
   * steering message for this run, marking it consumed atomically. The
   * AgentRunner injects the text as a user message between iterations.
   * Optional — sinks that don't care return undefined / no-op.
   */
  pullPendingSteer?(messageId: string): Promise<string | null>

  /**
   * Phase 2 — record a StreamMonitor alert for this message. The runner
   * forwards each newly-fired alert exactly once (deduped by `alert.type`).
   * Optional: sinks that don't care can leave it undefined (the runner
   * feature-detects).
   */
  appendStreamAlert?(
    messageId: string,
    alert: {
      type: string
      message: string
      charOffset: number
      timestamp: number
    },
  ): Promise<void>

  /**
   * Phase 1 — record a contract-evaluation quality score against the
   * current run. Fired from agent-loop after the evaluator runs (NOT from
   * the runner). Optional — sinks that don't care can leave undefined.
   */
  appendQualityScore?(
    messageId: string,
    score: {
      contractType: string
      passed: boolean
      score: number
      issues: string[]
    },
  ): Promise<void>

  /**
   * Phase 1 — record a healing-loop iteration. Fired from agent-loop when
   * the healing loop spins up another attempt. Optional.
   */
  appendHealingIteration?(
    messageId: string,
    iteration: {
      attempt: number
      maxAttempts: number
      previousScore?: number
    },
  ): Promise<void>

  /** Phase 3 — link a pending HITL checkpoint to this message. Optional. */
  recordHitlPending?(messageId: string, hitlCheckpointId: string): Promise<void>
}
