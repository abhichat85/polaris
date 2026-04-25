import { describe, it, expect } from "vitest"
import {
  fromCheckpointMessage,
  toCheckpointMessage,
} from "@/lib/agents/checkpoint-codec"
import type { Message } from "@/lib/agents/types"

describe("checkpoint codec", () => {
  it("round-trips a string-content message", () => {
    const m: Message = { role: "user", content: "hello" }
    const stored = toCheckpointMessage(m)
    expect(stored).toEqual({ role: "user", contentText: "hello" })
    expect(fromCheckpointMessage(stored)).toEqual(m)
  })

  it("round-trips an assistant message with text block", () => {
    const m: Message = {
      role: "assistant",
      content: [{ type: "text", text: "I'll do that." }],
    }
    expect(fromCheckpointMessage(toCheckpointMessage(m))).toEqual(m)
  })

  it("round-trips a tool_use block", () => {
    const m: Message = {
      role: "assistant",
      content: [
        { type: "tool_use", id: "tu_1", name: "read_file", input: { path: "src/x.ts" } },
      ],
    }
    expect(fromCheckpointMessage(toCheckpointMessage(m))).toEqual(m)
  })

  it("round-trips a tool_result block including isError flag", () => {
    const m: Message = {
      role: "tool",
      content: [
        {
          type: "tool_result",
          toolUseId: "tu_1",
          content: '{"ok":false,"error":"boom"}',
          isError: true,
        },
      ],
    }
    expect(fromCheckpointMessage(toCheckpointMessage(m))).toEqual(m)
  })

  it("round-trips a multi-block assistant message", () => {
    const m: Message = {
      role: "assistant",
      content: [
        { type: "text", text: "Reading file." },
        { type: "tool_use", id: "tu_1", name: "read_file", input: { path: "x.ts" } },
      ],
    }
    expect(fromCheckpointMessage(toCheckpointMessage(m))).toEqual(m)
  })

  it("preserves complex tool_use input objects", () => {
    const m: Message = {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "tu_1",
          name: "edit_file",
          input: { path: "x.ts", search: "a\nb", replace: "c\nd" },
        },
      ],
    }
    expect(fromCheckpointMessage(toCheckpointMessage(m))).toEqual(m)
  })
})
