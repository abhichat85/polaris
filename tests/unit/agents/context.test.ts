/**
 * D-032 — Context round-trip tests.
 */

import { describe, it, expect } from "vitest"
import {
  serializeContext,
  parseContext,
  makeAssistantMessage,
  contextToMessages,
  messagesToContext,
  type Context,
} from "@/lib/agents/context"
import type { Message, ToolDefinition } from "@/lib/agents/types"

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

describe("contextToMessages — D-032 back-compat bridge", () => {
  it("preserves text + tool_use + tool_result blocks", () => {
    const msgs = contextToMessages(ctx)
    expect(msgs).toHaveLength(3)
    expect(msgs[0]).toEqual({ role: "user", content: "Hi." })
    const assistant = msgs[1]
    expect(assistant.role).toBe("assistant")
    expect(Array.isArray(assistant.content)).toBe(true)
    const blocks = assistant.content as Array<{ type: string }>
    expect(blocks.find((b) => b.type === "tool_use")).toBeDefined()
    const toolMsg = msgs[2]
    expect(toolMsg.role).toBe("tool")
    const tBlocks = toolMsg.content as Array<{ type: string; toolUseId?: string }>
    expect(tBlocks[0]).toMatchObject({ type: "tool_result", toolUseId: "tu_1" })
  })

  it("drops thinking blocks at the boundary (only Claude round-trips them)", () => {
    const withThinking: Context = {
      systemPrompt: "x",
      tools: [],
      messages: [
        {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "secret reasoning" },
            { type: "text", text: "out loud" },
          ],
        },
      ],
    }
    const msgs = contextToMessages(withThinking)
    const blocks = msgs[0].content as Array<{ type: string }>
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe("text")
  })

  it("coerces non-object tool_use input to {}", () => {
    const c: Context = {
      systemPrompt: "",
      tools: [],
      messages: [
        {
          role: "assistant",
          content: [
            { type: "tool_use", id: "x", name: "y", input: "garbage" },
          ],
        },
      ],
    }
    const blocks = contextToMessages(c)[0].content as Array<{
      type: string
      input?: Record<string, unknown>
    }>
    expect(blocks[0].input).toEqual({})
  })
})

describe("messagesToContext — inverse direction", () => {
  it("round-trips through contextToMessages → messagesToContext", () => {
    const tools: ToolDefinition[] = [
      {
        name: "read_file",
        description: "read",
        inputSchema: { type: "object", properties: {}, required: [] },
      },
    ]
    const sys = "Sys."
    const msgs: Message[] = [
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "ok" },
          { type: "tool_use", id: "tu", name: "read_file", input: { path: "p" } },
        ],
      },
    ]
    const ctx2 = messagesToContext(msgs, sys, tools)
    expect(ctx2.systemPrompt).toBe(sys)
    expect(ctx2.tools).toEqual(tools)
    const back = contextToMessages(ctx2)
    expect(back).toEqual(msgs)
  })
})
