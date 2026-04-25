/**
 * Pure translation between Polaris in-memory Message[] and the Convex
 * checkpoint shape (contentText | blocks discriminator per §11.2 D-016).
 *
 * Extracted from ConvexAgentSink so the codec can be unit tested without
 * any Convex dependency.
 */

import type { ContentBlock, Message, MessageRole } from "./types"

export interface CheckpointBlock {
  type: "text" | "tool_use" | "tool_result"
  text?: string
  id?: string
  name?: string
  input?: unknown
  toolUseId?: string
  content?: string
  isError?: boolean
}

export interface CheckpointMessage {
  role: MessageRole
  contentText?: string
  blocks?: CheckpointBlock[]
}

export function toCheckpointMessage(m: Message): CheckpointMessage {
  if (typeof m.content === "string") {
    return { role: m.role, contentText: m.content }
  }
  return { role: m.role, blocks: m.content.map(toCheckpointBlock) }
}

export function fromCheckpointMessage(m: CheckpointMessage): Message {
  if (m.contentText !== undefined) {
    return { role: m.role, content: m.contentText }
  }
  return {
    role: m.role,
    content: (m.blocks ?? []).map(fromCheckpointBlock),
  }
}

function toCheckpointBlock(b: ContentBlock): CheckpointBlock {
  switch (b.type) {
    case "text":
      return { type: "text", text: b.text }
    case "tool_use":
      return { type: "tool_use", id: b.id, name: b.name, input: b.input }
    case "tool_result":
      return {
        type: "tool_result",
        toolUseId: b.toolUseId,
        content: b.content,
        isError: b.isError,
      }
  }
}

function fromCheckpointBlock(b: CheckpointBlock): ContentBlock {
  switch (b.type) {
    case "text":
      return { type: "text", text: b.text ?? "" }
    case "tool_use":
      return {
        type: "tool_use",
        id: b.id ?? "",
        name: b.name ?? "",
        input: (b.input as Record<string, unknown>) ?? {},
      }
    case "tool_result": {
      const block: ContentBlock = {
        type: "tool_result",
        toolUseId: b.toolUseId ?? "",
        content: b.content ?? "",
      }
      if (b.isError !== undefined) block.isError = b.isError
      return block
    }
  }
}
