/**
 * GPTAdapter — real implementation tests.
 * Exercises the full SSE happy-path, tool-call accumulation across
 * deltas, error mapping, and Context entry-point delegation.
 */

import { describe, it, expect, vi } from "vitest"
import { GPTAdapter } from "@/lib/agents/gpt-adapter"
import type { AgentStep, ToolDefinition } from "@/lib/agents/types"

const collect = async <T>(gen: AsyncGenerator<T>): Promise<T[]> => {
  const out: T[] = []
  for await (const v of gen) out.push(v)
  return out
}

function sseStream(events: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const ev of events) {
        controller.enqueue(enc.encode(`data: ${ev}\n\n`))
      }
      controller.close()
    },
  })
}

function jsonChunk(obj: unknown): string {
  return JSON.stringify(obj)
}

const tools: ToolDefinition[] = [
  {
    name: "read_file",
    description: "Read a file.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
]

describe("GPTAdapter — wire format", () => {
  it("posts to /chat/completions with mapped tools + system prompt", async () => {
    const fakeFetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(sseStream(["[DONE]"]), {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
    )
    const adapter = new GPTAdapter({
      apiKey: "sk-test",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    })
    await collect<AgentStep>(
      adapter.runWithTools(
        [{ role: "user", content: "hi" }],
        tools,
        { systemPrompt: "Sys.", maxTokens: 100, timeoutMs: 1000 },
      ),
    )
    expect(fakeFetch).toHaveBeenCalledTimes(1)
    const [url, init] = fakeFetch.mock.calls[0]
    expect(url).toMatch(/\/chat\/completions$/)
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.stream).toBe(true)
    expect(body.messages[0]).toEqual({ role: "system", content: "Sys." })
    expect(body.messages[1]).toEqual({ role: "user", content: "hi" })
    expect(body.tools[0].type).toBe("function")
    expect(body.tools[0].function.name).toBe("read_file")
    expect((init as RequestInit).headers).toMatchObject({
      authorization: "Bearer sk-test",
    })
  })

  it("expands assistant tool_use blocks into ChatML tool_calls + tool messages", async () => {
    const fakeFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(sseStream(["[DONE]"]), { status: 200 }),
    )
    const adapter = new GPTAdapter({
      apiKey: "k",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    })
    await collect<AgentStep>(
      adapter.runWithTools(
        [
          { role: "user", content: "do it" },
          {
            role: "assistant",
            content: [
              { type: "text", text: "ok" },
              {
                type: "tool_use",
                id: "tu_1",
                name: "read_file",
                input: { path: "p" },
              },
            ],
          },
          {
            role: "tool",
            content: [
              {
                type: "tool_result",
                toolUseId: "tu_1",
                content: "(file contents)",
              },
            ],
          },
        ],
        tools,
        { systemPrompt: "", maxTokens: 100, timeoutMs: 1000 },
      ),
    )
    const body = JSON.parse(
      (fakeFetch.mock.calls[0][1] as RequestInit).body as string,
    )
    const assistant = body.messages.find(
      (m: { role: string }) => m.role === "assistant",
    )
    expect(assistant.tool_calls[0]).toEqual({
      id: "tu_1",
      type: "function",
      function: { name: "read_file", arguments: '{"path":"p"}' },
    })
    const toolMsg = body.messages.find(
      (m: { role: string }) => m.role === "tool",
    )
    expect(toolMsg.tool_call_id).toBe("tu_1")
    expect(toolMsg.content).toBe("(file contents)")
  })
})

describe("GPTAdapter — streaming", () => {
  it("yields text_delta + tool_call + usage + done in order", async () => {
    const events = [
      jsonChunk({ choices: [{ delta: { content: "Hello " } }] }),
      jsonChunk({ choices: [{ delta: { content: "world" } }] }),
      jsonChunk({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_1",
                  function: { name: "read_file", arguments: '{"pat' },
                },
              ],
            },
          },
        ],
      }),
      jsonChunk({
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, function: { arguments: 'h":"x.ts"}' } },
              ],
            },
          },
        ],
      }),
      jsonChunk({ choices: [{ finish_reason: "tool_calls" }] }),
      jsonChunk({
        choices: [],
        usage: { prompt_tokens: 42, completion_tokens: 17 },
      }),
      "[DONE]",
    ]
    const fakeFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(sseStream(events), { status: 200 }),
    )
    const adapter = new GPTAdapter({
      apiKey: "k",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    })
    const steps = await collect<AgentStep>(
      adapter.runWithTools(
        [{ role: "user", content: "hi" }],
        tools,
        { systemPrompt: "x", maxTokens: 100, timeoutMs: 1000 },
      ),
    )

    const texts = steps
      .filter((s): s is Extract<AgentStep, { type: "text_delta" }> =>
        s.type === "text_delta",
      )
      .map((s) => s.delta)
      .join("")
    expect(texts).toBe("Hello world")

    const toolCall = steps.find(
      (s): s is Extract<AgentStep, { type: "tool_call" }> =>
        s.type === "tool_call",
    )
    expect(toolCall?.toolCall).toEqual({
      id: "call_1",
      name: "read_file",
      input: { path: "x.ts" },
    })

    const usage = steps.find((s) => s.type === "usage")
    expect(usage).toEqual({
      type: "usage",
      inputTokens: 42,
      outputTokens: 17,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    })

    const done = steps[steps.length - 1]
    expect(done).toEqual({ type: "done", stopReason: "tool_use" })
  })

  it("maps finish_reason length → max_tokens", async () => {
    const events = [
      jsonChunk({ choices: [{ delta: { content: "x" } }] }),
      jsonChunk({ choices: [{ finish_reason: "length" }] }),
      "[DONE]",
    ]
    const fakeFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(sseStream(events), { status: 200 }),
    )
    const adapter = new GPTAdapter({
      apiKey: "k",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    })
    const steps = await collect<AgentStep>(
      adapter.runWithTools(
        [{ role: "user", content: "hi" }],
        [],
        { systemPrompt: "", maxTokens: 1, timeoutMs: 1000 },
      ),
    )
    expect(steps[steps.length - 1]).toEqual({
      type: "done",
      stopReason: "max_tokens",
    })
  })

  it("surfaces non-2xx as a done.error step", async () => {
    const fakeFetch = vi.fn(
      async () =>
        new Response("rate limited", {
          status: 429,
          statusText: "Too Many Requests",
        }),
    )
    const adapter = new GPTAdapter({
      apiKey: "k",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    })
    const steps = await collect<AgentStep>(
      adapter.runWithTools(
        [{ role: "user", content: "hi" }],
        [],
        { systemPrompt: "", maxTokens: 100, timeoutMs: 1000 },
      ),
    )
    const done = steps[steps.length - 1]
    expect(done.type).toBe("done")
    if (done.type === "done") {
      expect(done.stopReason).toBe("error")
      expect(done.error).toMatch(/429/)
    }
  })

  it("D-032 — runWithContext delegates with ctx.systemPrompt + ctx.tools", async () => {
    const fakeFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(sseStream(["[DONE]"]), { status: 200 }),
    )
    const adapter = new GPTAdapter({
      apiKey: "k",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    })
    await collect<AgentStep>(
      adapter.runWithContext(
        {
          systemPrompt: "Ctx sys.",
          tools,
          messages: [{ role: "user", content: "hi" }],
        },
        { maxTokens: 50, timeoutMs: 1000 },
      ),
    )
    const body = JSON.parse(
      (fakeFetch.mock.calls[0][1] as RequestInit).body as string,
    )
    expect(body.messages[0]).toEqual({ role: "system", content: "Ctx sys." })
    expect(body.tools[0].function.name).toBe("read_file")
  })

  it("name is 'gpt'", () => {
    expect(new GPTAdapter({ apiKey: "k" }).name).toBe("gpt")
  })
})
