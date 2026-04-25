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

  /** Persist a tool call (so the UI can render the tool card). */
  appendToolCall(messageId: string, toolCall: ToolCall): Promise<void>

  /** Persist a tool result. */
  appendToolResult(messageId: string, toolCallId: string, result: ToolOutput): Promise<void>

  /** Record token usage (drives billing quota — sub-plan 08). */
  recordUsage(userId: string, inputTokens: number, outputTokens: number): Promise<void>

  /** Save a checkpoint snapshot. Called after each iteration. */
  saveCheckpoint(checkpoint: AgentCheckpoint): Promise<void>

  /** Load the most recent checkpoint for resuming after an Inngest retry. */
  loadCheckpoint(messageId: string): Promise<AgentCheckpoint | null>

  /** Final status update for the message. */
  markDone(messageId: string, payload: AgentDonePayload): Promise<void>

  /** Returns true if a cancellation has been signalled for this message. */
  isCancelled(messageId: string): Promise<boolean>
}
