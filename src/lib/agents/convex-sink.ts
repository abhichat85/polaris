/**
 * Production AgentSink backed by Convex.
 * Authority: CONSTITUTION §3.1, sub-plan 01 §11 + §17 + §19.
 *
 * Translates the in-memory Polaris Message[] checkpoint format to and from the
 * Convex schema (which uses contentText / blocks discriminator per §11.2 D-016).
 */

import { api } from "@/../convex/_generated/api"
import type { Id } from "@/../convex/_generated/dataModel"
import type { ConvexHttpClient } from "convex/browser"
import type {
  AgentCheckpoint,
  AgentDonePayload,
  AgentSink,
  ConversationMessage,
} from "./sink"
import type { ToolCall } from "./types"
import type { ToolOutput } from "@/lib/tools/types"
import {
  fromCheckpointMessage,
  toCheckpointMessage,
  type CheckpointMessage,
} from "./checkpoint-codec"

export interface ConvexAgentSinkDeps {
  convex: ConvexHttpClient
  internalKey: string
}

export class ConvexAgentSink implements AgentSink {
  constructor(private readonly deps: ConvexAgentSinkDeps) {}

  async loadInitialMessages(conversationId: string): Promise<ConversationMessage[]> {
    // Use the internal-key variant — this runs inside Inngest (no Clerk token).
    // api.conversations.getMessages requires verifyAuth() → Unauthorized.
    const messages = await this.deps.convex.query(
      api.system.getConversationMessages,
      {
        internalKey: this.deps.internalKey,
        conversationId: conversationId as Id<"conversations">,
      },
    )
    return messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }))
  }

  async appendText(messageId: string, delta: string): Promise<void> {
    await this.deps.convex.mutation(api.agent_messages.appendText, {
      internalKey: this.deps.internalKey,
      messageId: messageId as Id<"messages">,
      delta,
    })
  }

  // D-024 — extended-thinking fragments persisted via system.appendThinking.
  // Capped at 32 KB per message inside the mutation.
  async appendThinking(messageId: string, delta: string): Promise<void> {
    await this.deps.convex.mutation(api.system.appendThinking, {
      internalKey: this.deps.internalKey,
      messageId: messageId as Id<"messages">,
      delta,
    })
  }

  // D-033 — steering: pull next pending + mark consumed in one trip.
  async pullPendingSteer(messageId: string): Promise<string | null> {
    const next = await this.deps.convex.query(api.steering.nextPending, {
      internalKey: this.deps.internalKey,
      messageId: messageId as Id<"messages">,
    })
    if (!next) return null
    await this.deps.convex.mutation(api.steering.markConsumed, {
      internalKey: this.deps.internalKey,
      id: next._id,
    })
    return next.text
  }

  async appendToolCall(messageId: string, toolCall: ToolCall): Promise<void> {
    await this.deps.convex.mutation(api.agent_messages.appendToolCall, {
      internalKey: this.deps.internalKey,
      messageId: messageId as Id<"messages">,
      toolCall: { id: toolCall.id, name: toolCall.name, input: toolCall.input },
    })
  }

  async appendToolResult(
    messageId: string,
    toolCallId: string,
    result: ToolOutput,
  ): Promise<void> {
    await this.deps.convex.mutation(api.agent_messages.appendToolResult, {
      internalKey: this.deps.internalKey,
      messageId: messageId as Id<"messages">,
      toolCallId,
      ok: result.ok,
      data: result.ok ? result.data : undefined,
      error: result.ok ? undefined : result.error,
      errorCode: result.ok ? undefined : result.errorCode,
    })
  }

  async recordUsage(
    userId: string,
    inputTokens: number,
    outputTokens: number,
    cacheCreationInputTokens?: number,
    cacheReadInputTokens?: number,
  ): Promise<void> {
    await this.deps.convex.mutation(api.usage.increment, {
      ownerId: userId,
      anthropicTokens: inputTokens + outputTokens,
      ...(cacheCreationInputTokens !== undefined && {
        cacheCreationTokens: cacheCreationInputTokens,
      }),
      ...(cacheReadInputTokens !== undefined && {
        cacheReadTokens: cacheReadInputTokens,
      }),
    })
  }

  async saveCheckpoint(checkpoint: AgentCheckpoint): Promise<void> {
    await this.deps.convex.mutation(api.agent_checkpoints.save, {
      messageId: checkpoint.messageId as Id<"messages">,
      projectId: checkpoint.projectId as Id<"projects">,
      messages: checkpoint.messages.map(toCheckpointMessage),
      iterationCount: checkpoint.iterationCount,
      totalInputTokens: checkpoint.totalInputTokens,
      totalOutputTokens: checkpoint.totalOutputTokens,
      lastToolCallName: checkpoint.lastToolCallName,
    })
  }

  async loadCheckpoint(messageId: string): Promise<AgentCheckpoint | null> {
    const cp = await this.deps.convex.query(api.agent_checkpoints.get, {
      messageId: messageId as Id<"messages">,
    })
    if (!cp) return null
    return {
      messageId: cp.messageId,
      projectId: cp.projectId,
      messages: (cp.messages as CheckpointMessage[]).map(fromCheckpointMessage),
      iterationCount: cp.iterationCount,
      totalInputTokens: cp.totalInputTokens,
      totalOutputTokens: cp.totalOutputTokens,
      lastToolCallName: cp.lastToolCallName,
      savedAt: cp.savedAt,
    }
  }

  async markDone(messageId: string, payload: AgentDonePayload): Promise<void> {
    await this.deps.convex.mutation(api.agent_messages.markDone, {
      internalKey: this.deps.internalKey,
      messageId: messageId as Id<"messages">,
      status: payload.status,
      errorMessage: payload.errorMessage,
      inputTokens: payload.inputTokens,
      outputTokens: payload.outputTokens,
    })
  }

  async isCancelled(messageId: string): Promise<boolean> {
    return await this.deps.convex.query(api.agent_messages.isCancelled, {
      internalKey: this.deps.internalKey,
      messageId: messageId as Id<"messages">,
    })
  }
}

// (Translation helpers extracted to checkpoint-codec.ts so they're unit-testable
// without dragging in convex/browser.)
