/**
 * In-memory AgentSink for unit tests.
 * Captures every side effect so tests can assert on emission order/content.
 */

import type {
  AgentCheckpoint,
  AgentDonePayload,
  AgentSink,
  ConversationMessage,
} from "./sink"
import type { ToolCall } from "./types"
import type { ToolOutput } from "@/lib/tools/types"

interface AppendedToolResult {
  messageId: string
  toolCallId: string
  result: ToolOutput
}

export class InMemoryAgentSink implements AgentSink {
  initialMessages: ConversationMessage[] = []
  textDeltas: Array<{ messageId: string; delta: string }> = []
  toolCalls: Array<{ messageId: string; toolCall: ToolCall }> = []
  toolResults: AppendedToolResult[] = []
  usage: Array<{ userId: string; inputTokens: number; outputTokens: number }> = []
  checkpoints: AgentCheckpoint[] = []
  done?: { messageId: string; payload: AgentDonePayload }
  cancelledMessageIds = new Set<string>()
  /** Pre-seeded checkpoint for resume tests. */
  preloadedCheckpoint: AgentCheckpoint | null = null

  // ── Phase 1/2/3 signal capture ─────────────────────────────────────────────
  streamAlerts: Array<{
    messageId: string
    alert: {
      type: string
      message: string
      charOffset: number
      timestamp: number
    }
  }> = []
  qualityScores: Array<{
    messageId: string
    score: {
      contractType: string
      passed: boolean
      score: number
      issues: string[]
    }
  }> = []
  healingIterations: Array<{
    messageId: string
    iteration: {
      attempt: number
      maxAttempts: number
      previousScore?: number
    }
  }> = []
  hitlPendingRecords: Array<{
    messageId: string
    hitlCheckpointId: string
  }> = []

  async loadInitialMessages(_conversationId: string): Promise<ConversationMessage[]> {
    return [...this.initialMessages]
  }

  async appendText(messageId: string, delta: string): Promise<void> {
    this.textDeltas.push({ messageId, delta })
  }

  async appendToolCall(messageId: string, toolCall: ToolCall): Promise<void> {
    this.toolCalls.push({ messageId, toolCall })
  }

  async appendToolResult(
    messageId: string,
    toolCallId: string,
    result: ToolOutput,
  ): Promise<void> {
    this.toolResults.push({ messageId, toolCallId, result })
  }

  async recordUsage(userId: string, inputTokens: number, outputTokens: number): Promise<void> {
    this.usage.push({ userId, inputTokens, outputTokens })
  }

  async saveCheckpoint(checkpoint: AgentCheckpoint): Promise<void> {
    this.checkpoints.push(checkpoint)
  }

  async loadCheckpoint(_messageId: string): Promise<AgentCheckpoint | null> {
    return this.preloadedCheckpoint
  }

  async markDone(messageId: string, payload: AgentDonePayload): Promise<void> {
    this.done = { messageId, payload }
  }

  async isCancelled(messageId: string): Promise<boolean> {
    return this.cancelledMessageIds.has(messageId)
  }

  async appendStreamAlert(
    messageId: string,
    alert: {
      type: string
      message: string
      charOffset: number
      timestamp: number
    },
  ): Promise<void> {
    this.streamAlerts.push({ messageId, alert })
  }

  async appendQualityScore(
    messageId: string,
    score: {
      contractType: string
      passed: boolean
      score: number
      issues: string[]
    },
  ): Promise<void> {
    this.qualityScores.push({ messageId, score })
  }

  async appendHealingIteration(
    messageId: string,
    iteration: {
      attempt: number
      maxAttempts: number
      previousScore?: number
    },
  ): Promise<void> {
    this.healingIterations.push({ messageId, iteration })
  }

  async recordHitlPending(
    messageId: string,
    hitlCheckpointId: string,
  ): Promise<void> {
    this.hitlPendingRecords.push({ messageId, hitlCheckpointId })
  }

  // ── test helpers ───────────────────────────────────────────────────────────

  cancelMessage(messageId: string): void {
    this.cancelledMessageIds.add(messageId)
  }

  totalUsageTokens(): number {
    return this.usage.reduce((acc, u) => acc + u.inputTokens + u.outputTokens, 0)
  }
}
