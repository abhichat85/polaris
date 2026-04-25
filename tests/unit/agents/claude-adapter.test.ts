import { describe, it, expect, vi, beforeEach } from "vitest"
import { ClaudeAdapter } from "@/lib/agents/claude-adapter"
import type { AgentStep } from "@/lib/agents/types"
import {
  textStream,
  toolUseStream,
  errorStream,
  multiBlockStream,
} from "../../fixtures/anthropic-stream"

const collect = async <T>(gen: AsyncGenerator<T>): Promise<T[]> => {
  const out: T[] = []
  for await (const v of gen) out.push(v)
  return out
}

describe("ClaudeAdapter", () => {
  let mockMessages: { stream: ReturnType<typeof vi.fn> }
  let adapter: ClaudeAdapter

  beforeEach(() => {
    mockMessages = { stream: vi.fn() }
    adapter = new ClaudeAdapter({
      apiKey: "test-key",
      // Inject a fake client so we never touch the network.
      clientFactory: () => ({ messages: mockMessages }) as never,
    })
  })

  it("name is 'claude'", () => {
    expect(adapter.name).toBe("claude")
  })

  it("emits text_delta events as they arrive", async () => {
    mockMessages.stream.mockReturnValue(textStream(["Hello", " ", "world"]))

    const steps = await collect<AgentStep>(
      adapter.runWithTools(
        [{ role: "user", content: "Say hi" }],
        [],
        { systemPrompt: "You are helpful.", maxTokens: 100, timeoutMs: 10_000 },
      ),
    )

    const deltas = steps.filter((s) => s.type === "text_delta").map((s: any) => s.delta)
    expect(deltas).toEqual(["Hello", " ", "world"])
  })

  it("ends with a done step with stopReason=end_turn", async () => {
    mockMessages.stream.mockReturnValue(textStream(["hi"]))

    const steps = await collect<AgentStep>(
      adapter.runWithTools(
        [{ role: "user", content: "hi" }],
        [],
        { systemPrompt: "ok", maxTokens: 10, timeoutMs: 10_000 },
      ),
    )

    const last = steps.at(-1)
    expect(last).toMatchObject({ type: "done", stopReason: "end_turn" })
  })

  it("emits exactly one usage step before done", async () => {
    mockMessages.stream.mockReturnValue(textStream(["hi"], { inputTokens: 5, outputTokens: 1 }))

    const steps = await collect<AgentStep>(
      adapter.runWithTools(
        [{ role: "user", content: "hi" }],
        [],
        { systemPrompt: "ok", maxTokens: 10, timeoutMs: 10_000 },
      ),
    )

    const usageSteps = steps.filter((s) => s.type === "usage")
    expect(usageSteps).toHaveLength(1)
    expect(usageSteps[0]).toEqual({ type: "usage", inputTokens: 5, outputTokens: 1 })
    // usage always immediately precedes done
    const usageIdx = steps.findIndex((s) => s.type === "usage")
    expect(steps[usageIdx + 1]?.type).toBe("done")
  })

  it("emits a tool_call when Claude requests a tool", async () => {
    mockMessages.stream.mockReturnValue(
      toolUseStream({
        toolUseId: "toolu_abc",
        name: "read_file",
        input: { path: "src/app/page.tsx" },
      }),
    )

    const steps = await collect<AgentStep>(
      adapter.runWithTools(
        [{ role: "user", content: "Read the page" }],
        [
          {
            name: "read_file",
            description: "Reads",
            inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
          },
        ],
        { systemPrompt: "Help.", maxTokens: 100, timeoutMs: 10_000 },
      ),
    )

    const toolCallStep: any = steps.find((s) => s.type === "tool_call")
    expect(toolCallStep).toBeDefined()
    expect(toolCallStep.toolCall).toEqual({
      id: "toolu_abc",
      name: "read_file",
      input: { path: "src/app/page.tsx" },
    })
    expect(steps.at(-1)).toMatchObject({ type: "done", stopReason: "tool_use" })
  })

  it("accumulates tool input across multiple input_json_delta events", async () => {
    // Anthropic streams the tool input JSON as multiple partial chunks.
    mockMessages.stream.mockReturnValue(
      multiBlockStream([
        {
          kind: "tool_use",
          id: "toolu_xyz",
          name: "edit_file",
          partials: ['{"path":"src/x.ts","sea', 'rch":"foo","replace":"bar"}'],
        },
      ]),
    )

    const steps = await collect<AgentStep>(
      adapter.runWithTools(
        [{ role: "user", content: "edit it" }],
        [
          {
            name: "edit_file",
            description: "Edit",
            inputSchema: {
              type: "object",
              properties: { path: { type: "string" }, search: { type: "string" }, replace: { type: "string" } },
              required: ["path", "search", "replace"],
            },
          },
        ],
        { systemPrompt: "Help.", maxTokens: 100, timeoutMs: 10_000 },
      ),
    )

    const toolCallStep: any = steps.find((s) => s.type === "tool_call")
    expect(toolCallStep.toolCall.input).toEqual({
      path: "src/x.ts",
      search: "foo",
      replace: "bar",
    })
  })

  it("interleaves text and tool_call when both appear", async () => {
    mockMessages.stream.mockReturnValue(
      multiBlockStream([
        { kind: "text", deltas: ["I'll read the file."] },
        { kind: "tool_use", id: "toolu_q", name: "read_file", partials: ['{"path":"a.ts"}'] },
      ]),
    )

    const steps = await collect<AgentStep>(
      adapter.runWithTools(
        [{ role: "user", content: "read" }],
        [
          {
            name: "read_file",
            description: "Reads",
            inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
          },
        ],
        { systemPrompt: "Help.", maxTokens: 100, timeoutMs: 10_000 },
      ),
    )

    const types = steps.map((s) => s.type)
    expect(types.indexOf("text_delta")).toBeLessThan(types.indexOf("tool_call"))
  })

  it("yields a done step with stopReason=error and the error message when stream throws", async () => {
    mockMessages.stream.mockReturnValue(errorStream("rate limited"))

    const steps = await collect<AgentStep>(
      adapter.runWithTools(
        [{ role: "user", content: "hi" }],
        [],
        { systemPrompt: "ok", maxTokens: 10, timeoutMs: 10_000 },
      ),
    )

    const last: any = steps.at(-1)
    expect(last).toMatchObject({ type: "done", stopReason: "error" })
    expect(last.error).toContain("rate limited")
  })

  it("translates ContentBlock[] messages including tool_result blocks", async () => {
    mockMessages.stream.mockReturnValue(textStream(["ok"]))

    await collect<AgentStep>(
      adapter.runWithTools(
        [
          { role: "user", content: "do thing" },
          {
            role: "assistant",
            content: [
              { type: "text", text: "I'll read it." },
              { type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "a.ts" } },
            ],
          },
          {
            role: "tool",
            content: [
              { type: "tool_result", toolUseId: "toolu_1", content: "file contents", isError: false },
            ],
          },
        ],
        [
          {
            name: "read_file",
            description: "r",
            inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
          },
        ],
        { systemPrompt: "ok", maxTokens: 10, timeoutMs: 10_000 },
      ),
    )

    const callArgs = mockMessages.stream.mock.calls[0][0]
    expect(callArgs.messages).toHaveLength(3)
    // Tool role gets translated to user role per Anthropic API convention
    expect(callArgs.messages[2].role).toBe("user")
    expect(callArgs.messages[2].content[0]).toMatchObject({
      type: "tool_result",
      tool_use_id: "toolu_1",
    })
  })

  it("passes tools through with input_schema field name (Anthropic naming)", async () => {
    mockMessages.stream.mockReturnValue(textStream(["x"]))

    await collect<AgentStep>(
      adapter.runWithTools(
        [{ role: "user", content: "x" }],
        [
          {
            name: "edit_file",
            description: "edit",
            inputSchema: {
              type: "object",
              properties: { path: { type: "string" } },
              required: ["path"],
            },
          },
        ],
        { systemPrompt: "ok", maxTokens: 10, timeoutMs: 10_000 },
      ),
    )

    const callArgs = mockMessages.stream.mock.calls[0][0]
    expect(callArgs.tools[0]).toMatchObject({
      name: "edit_file",
      description: "edit",
      input_schema: { type: "object" },
    })
    // Snake-cased on the wire — make sure the camelCase didn't leak
    expect(callArgs.tools[0]).not.toHaveProperty("inputSchema")
  })

  it("omits tools array when no tools are passed", async () => {
    mockMessages.stream.mockReturnValue(textStream(["x"]))

    await collect<AgentStep>(
      adapter.runWithTools(
        [{ role: "user", content: "x" }],
        [],
        { systemPrompt: "ok", maxTokens: 10, timeoutMs: 10_000 },
      ),
    )

    const callArgs = mockMessages.stream.mock.calls[0][0]
    expect(callArgs.tools).toBeUndefined()
  })
})
