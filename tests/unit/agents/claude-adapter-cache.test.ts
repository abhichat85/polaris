/**
 * D-023 — prompt-cache assertions.
 * - system prompt sent as a content block array with cache_control: ephemeral
 * - last tool definition carries cache_control: ephemeral
 * - cache_creation_input_tokens + cache_read_input_tokens flow through usage event
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { ClaudeAdapter } from "@/lib/agents/claude-adapter"
import type { AgentStep, ToolDefinition } from "@/lib/agents/types"

const collect = async <T>(gen: AsyncGenerator<T>): Promise<T[]> => {
  const out: T[] = []
  for await (const v of gen) out.push(v)
  return out
}

const tools: ToolDefinition[] = [
  {
    name: "read_file",
    description: "read",
    inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
  {
    name: "write_file",
    description: "write",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "edit_file",
    description: "edit",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
]

async function* fakeStream(events: unknown[]): AsyncIterable<unknown> {
  for (const e of events) yield e
}

describe("ClaudeAdapter — D-023 prompt caching", () => {
  let mockMessages: { stream: ReturnType<typeof vi.fn> }
  let adapter: ClaudeAdapter

  beforeEach(() => {
    mockMessages = { stream: vi.fn() }
    adapter = new ClaudeAdapter({
      apiKey: "test",
      clientFactory: () => ({ messages: mockMessages }) as never,
    })
  })

  it("sends system prompt as a cached content block", async () => {
    mockMessages.stream.mockReturnValue(
      fakeStream([
        { type: "message_start", message: { usage: { input_tokens: 10 } } },
        { type: "message_delta", usage: { output_tokens: 1 } },
      ]),
    )

    await collect<AgentStep>(
      adapter.runWithTools(
        [{ role: "user", content: "hi" }],
        [],
        { systemPrompt: "I am the system prompt.", maxTokens: 100, timeoutMs: 1000 },
      ),
    )

    expect(mockMessages.stream).toHaveBeenCalledTimes(1)
    const args = mockMessages.stream.mock.calls[0][0]
    expect(Array.isArray(args.system)).toBe(true)
    expect(args.system[0]).toEqual({
      type: "text",
      text: "I am the system prompt.",
      cache_control: { type: "ephemeral" },
    })
  })

  it("tags only the LAST tool with cache_control", async () => {
    mockMessages.stream.mockReturnValue(
      fakeStream([
        { type: "message_start", message: { usage: { input_tokens: 10 } } },
        { type: "message_delta", usage: { output_tokens: 1 } },
      ]),
    )

    await collect<AgentStep>(
      adapter.runWithTools(
        [{ role: "user", content: "hi" }],
        tools,
        { systemPrompt: "x", maxTokens: 100, timeoutMs: 1000 },
      ),
    )

    const args = mockMessages.stream.mock.calls[0][0]
    expect(args.tools).toHaveLength(3)
    expect(args.tools[0].cache_control).toBeUndefined()
    expect(args.tools[1].cache_control).toBeUndefined()
    expect(args.tools[2].cache_control).toEqual({ type: "ephemeral" })
  })

  it("propagates cache_creation + cache_read tokens through usage event", async () => {
    mockMessages.stream.mockReturnValue(
      fakeStream([
        {
          type: "message_start",
          message: {
            usage: {
              input_tokens: 100,
              cache_creation_input_tokens: 200,
              cache_read_input_tokens: 800,
            },
          },
        },
        { type: "message_delta", usage: { output_tokens: 50 } },
      ]),
    )

    const steps = await collect<AgentStep>(
      adapter.runWithTools(
        [{ role: "user", content: "hi" }],
        [],
        { systemPrompt: "x", maxTokens: 100, timeoutMs: 1000 },
      ),
    )

    const usage = steps.find((s) => s.type === "usage")
    expect(usage).toEqual({
      type: "usage",
      inputTokens: 100,
      outputTokens: 50,
      cacheCreationInputTokens: 200,
      cacheReadInputTokens: 800,
    })
  })

  it("D-032 — runWithContext delegates with ctx.systemPrompt + ctx.tools", async () => {
    mockMessages.stream.mockReturnValue(
      fakeStream([
        { type: "message_start", message: { usage: { input_tokens: 10 } } },
        { type: "message_delta", usage: { output_tokens: 1 } },
      ]),
    )

    const collected = await collect<AgentStep>(
      adapter.runWithContext(
        {
          systemPrompt: "Ctx system.",
          tools,
          messages: [{ role: "user", content: "hi from ctx" }],
        },
        { maxTokens: 100, timeoutMs: 1000 },
      ),
    )

    expect(collected.find((s) => s.type === "done")).toBeDefined()
    const args = mockMessages.stream.mock.calls[0][0]
    expect(args.system[0].text).toBe("Ctx system.")
    // last tool gets the cache_control tag, exactly like runWithTools.
    expect(args.tools[args.tools.length - 1].cache_control).toEqual({
      type: "ephemeral",
    })
    expect(args.messages).toEqual([{ role: "user", content: "hi from ctx" }])
  })

  it("emits zeros when provider doesn't return cache fields", async () => {
    mockMessages.stream.mockReturnValue(
      fakeStream([
        { type: "message_start", message: { usage: { input_tokens: 5 } } },
        { type: "message_delta", usage: { output_tokens: 1 } },
      ]),
    )
    const steps = await collect<AgentStep>(
      adapter.runWithTools(
        [{ role: "user", content: "hi" }],
        [],
        { systemPrompt: "x", maxTokens: 100, timeoutMs: 1000 },
      ),
    )
    const usage = steps.find((s) => s.type === "usage")
    expect(usage).toMatchObject({
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    })
  })
})
