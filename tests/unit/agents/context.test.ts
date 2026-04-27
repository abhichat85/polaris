/**
 * D-032 — Context round-trip tests.
 */

import { describe, it, expect } from "vitest"
import {
  serializeContext,
  parseContext,
  makeAssistantMessage,
  type Context,
} from "@/lib/agents/context"

const ctx: Context = {
  systemPrompt: "You are Polaris.",
  messages: [
    { role: "user", content: "Hi." },
    {
      role: "assistant",
      content: [
        { type: "text", text: "Hi back." },
        { type: "tool_use", id: "tu_1", name: "read_file", input: { path: "x" } },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool_result",
          toolUseId: "tu_1",
          content: "(ok)",
          isError: false,
        },
      ],
    },
  ],
  tools: [
    {
      name: "read_file",
      description: "read",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
  ],
}

describe("Context serialize → parse round-trip", () => {
  it("preserves systemPrompt + messages + tools", () => {
    const round = parseContext(serializeContext(ctx))
    expect(round.systemPrompt).toBe(ctx.systemPrompt)
    expect(round.messages).toHaveLength(ctx.messages.length)
    expect(round.tools).toHaveLength(ctx.tools.length)
  })

  it("rejects malformed JSON", () => {
    expect(() => parseContext("not json")).toThrow()
    expect(() => parseContext('{"systemPrompt":42}')).toThrow()
  })
})

describe("makeAssistantMessage", () => {
  it("collapses to plain string when no tool calls", () => {
    const m = makeAssistantMessage("Hello.", [])
    expect(m.content).toBe("Hello.")
  })

  it("returns blocks when tool calls present", () => {
    const m = makeAssistantMessage("Reasoning…", [
      { id: "tu_a", name: "read_file", input: { path: "a" } },
    ])
    expect(Array.isArray(m.content)).toBe(true)
  })

  it("returns empty content when no text + no tools", () => {
    const m = makeAssistantMessage("", [])
    expect(m.content).toEqual([])
  })
})
