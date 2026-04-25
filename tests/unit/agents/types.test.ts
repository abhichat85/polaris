import { describe, it, expect } from "vitest"
import {
  AGENT_STEP_TYPES,
  STOP_REASONS,
  type AgentStep,
  type ContentBlock,
  type Message,
  type ModelAdapter,
  type ToolCall,
  type ToolDefinition,
  type RunOptions,
} from "@/lib/agents/types"

describe("agent types", () => {
  it("AGENT_STEP_TYPES includes the four discriminator values", () => {
    expect(AGENT_STEP_TYPES).toEqual(["text_delta", "tool_call", "usage", "done"])
  })

  it("STOP_REASONS includes the five Anthropic-compatible values", () => {
    expect(STOP_REASONS).toEqual([
      "end_turn",
      "max_tokens",
      "tool_use",
      "stop_sequence",
      "error",
    ])
  })

  it("AgentStep is a discriminated union", () => {
    const text: AgentStep = { type: "text_delta", delta: "hi" }
    const tool: AgentStep = {
      type: "tool_call",
      toolCall: { id: "t1", name: "read_file", input: { path: "src/x.ts" } },
    }
    const usage: AgentStep = { type: "usage", inputTokens: 10, outputTokens: 5 }
    const done: AgentStep = { type: "done", stopReason: "end_turn" }
    const errorDone: AgentStep = { type: "done", stopReason: "error", error: "boom" }

    for (const step of [text, tool, usage, done, errorDone]) {
      expect(AGENT_STEP_TYPES).toContain(step.type)
    }
  })

  it("Message.content can be string or ContentBlock[]", () => {
    const simple: Message = { role: "user", content: "Hello" }
    expect(typeof simple.content).toBe("string")

    const blocks: ContentBlock[] = [
      { type: "text", text: "I'll help" },
      { type: "tool_use", id: "t1", name: "read_file", input: { path: "x" } },
    ]
    const structured: Message = { role: "assistant", content: blocks }
    expect(Array.isArray(structured.content)).toBe(true)
  })

  it("ToolDefinition matches the AGENT_TOOLS shape", () => {
    const td: ToolDefinition = {
      name: "read_file",
      description: "Read a file",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    }
    expect(td.inputSchema.type).toBe("object")
  })

  it("ModelAdapter contract: name + runWithTools async generator", () => {
    class Stub implements ModelAdapter {
      readonly name = "stub"
      async *runWithTools(
        _messages: Message[],
        _tools: ToolDefinition[],
        _opts: RunOptions,
      ): AsyncGenerator<AgentStep, void, void> {
        yield { type: "text_delta", delta: "ok" }
        yield { type: "done", stopReason: "end_turn" }
      }
    }
    const a = new Stub()
    expect(a.name).toBe("stub")
    expect(typeof a.runWithTools).toBe("function")
  })

  it("ToolCall shape matches Anthropic tool_use convention", () => {
    const call: ToolCall = { id: "toolu_abc", name: "read_file", input: { path: "src/x.ts" } }
    expect(call.id).toMatch(/^toolu_/)
  })
})
