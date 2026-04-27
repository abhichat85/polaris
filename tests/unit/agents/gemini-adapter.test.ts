/**
 * GeminiAdapter — real implementation tests.
 */

import { describe, it, expect, vi } from "vitest"
import { GeminiAdapter } from "@/lib/agents/gemini-adapter"
import type { AgentStep, ToolDefinition } from "@/lib/agents/types"

const collect = async <T>(gen: AsyncGenerator<T>): Promise<T[]> => {
  const out: T[] = []
  for await (const v of gen) out.push(v)
  return out
}

function sseStream(events: unknown[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const ev of events) {
        const data = typeof ev === "string" ? ev : JSON.stringify(ev)
        controller.enqueue(enc.encode(`data: ${data}\n\n`))
      }
      controller.close()
    },
  })
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

describe("GeminiAdapter — wire format", () => {
  it("posts to :streamGenerateContent with systemInstruction + functionDeclarations", async () => {
    const fakeFetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(sseStream([]), { status: 200 }),
    )
    const adapter = new GeminiAdapter({
      apiKey: "g-key",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    })
    await collect<AgentStep>(
      adapter.runWithTools(
        [{ role: "user", content: "hi" }],
        tools,
        { systemPrompt: "Be helpful.", maxTokens: 50, timeoutMs: 1000 },
      ),
    )
    expect(fakeFetch).toHaveBeenCalledTimes(1)
    const [url, init] = fakeFetch.mock.calls[0]
    expect(String(url)).toContain(":streamGenerateContent")
    expect(String(url)).toContain("alt=sse")
    expect(String(url)).toContain("key=g-key")
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.systemInstruction.parts[0].text).toBe("Be helpful.")
    expect(body.tools[0].functionDeclarations[0].name).toBe("read_file")
    expect(body.contents[0]).toEqual({
      role: "user",
      parts: [{ text: "hi" }],
    })
  })

  it("translates assistant tool_use → model functionCall part", async () => {
    const fakeFetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(sseStream([]), { status: 200 }),
    )
    const adapter = new GeminiAdapter({
      apiKey: "k",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    })
    await collect<AgentStep>(
      adapter.runWithTools(
        [
          { role: "user", content: "go" },
          {
            role: "assistant",
            content: [
              { type: "text", text: "ok" },
              {
                type: "tool_use",
                id: "tu_1",
                name: "read_file",
                input: { path: "x" },
              },
            ],
          },
          {
            role: "tool",
            content: [
              {
                type: "tool_result",
                toolUseId: "tu_1",
                content: "file body",
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
    const modelTurn = body.contents.find(
      (c: { role: string }) => c.role === "model",
    )
    expect(modelTurn.parts).toEqual([
      { text: "ok" },
      { functionCall: { name: "read_file", args: { path: "x" } } },
    ])
    const toolTurn = body.contents[body.contents.length - 1]
    expect(toolTurn.role).toBe("user")
    expect(toolTurn.parts[0].functionResponse.response).toEqual({
      content: "file body",
    })
  })
})

describe("GeminiAdapter — streaming", () => {
  it("emits text_delta for text parts and tool_call for functionCall parts", async () => {
    const fakeFetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          sseStream([
            {
              candidates: [
                {
                  content: { parts: [{ text: "Hello " }] },
                },
              ],
            },
            {
              candidates: [
                {
                  content: { parts: [{ text: "world" }] },
                },
              ],
            },
            {
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        functionCall: {
                          name: "read_file",
                          args: { path: "x.ts" },
                        },
                      },
                    ],
                  },
                  finishReason: "STOP",
                },
              ],
              usageMetadata: {
                promptTokenCount: 33,
                candidatesTokenCount: 12,
              },
            },
          ]),
          { status: 200 },
        ),
    )
    const adapter = new GeminiAdapter({
      apiKey: "k",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    })
    const steps = await collect<AgentStep>(
      adapter.runWithTools(
        [{ role: "user", content: "hi" }],
        tools,
        { systemPrompt: "", maxTokens: 100, timeoutMs: 1000 },
      ),
    )

    const text = steps
      .filter((s): s is Extract<AgentStep, { type: "text_delta" }> =>
        s.type === "text_delta",
      )
      .map((s) => s.delta)
      .join("")
    expect(text).toBe("Hello world")

    const tc = steps.find(
      (s): s is Extract<AgentStep, { type: "tool_call" }> =>
        s.type === "tool_call",
    )
    expect(tc?.toolCall.name).toBe("read_file")
    expect(tc?.toolCall.input).toEqual({ path: "x.ts" })
    expect(tc?.toolCall.id).toMatch(/^gemini_read_file_/)

    const usage = steps.find((s) => s.type === "usage")
    expect(usage).toEqual({
      type: "usage",
      inputTokens: 33,
      outputTokens: 12,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    })

    expect(steps[steps.length - 1]).toEqual({
      type: "done",
      stopReason: "end_turn",
    })
  })

  it("maps finishReason MAX_TOKENS → max_tokens", async () => {
    const fakeFetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          sseStream([
            {
              candidates: [
                {
                  content: { parts: [{ text: "x" }] },
                  finishReason: "MAX_TOKENS",
                },
              ],
            },
          ]),
          { status: 200 },
        ),
    )
    const adapter = new GeminiAdapter({
      apiKey: "k",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    })
    const steps = await collect<AgentStep>(
      adapter.runWithTools(
        [{ role: "user", content: "x" }],
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
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response("permission denied", { status: 403 }),
    )
    const adapter = new GeminiAdapter({
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
      expect(done.error).toMatch(/403/)
    }
  })

  it("D-032 — runWithContext routes ctx.systemPrompt + ctx.tools", async () => {
    const fakeFetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(sseStream([]), { status: 200 }),
    )
    const adapter = new GeminiAdapter({
      apiKey: "k",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    })
    await collect<AgentStep>(
      adapter.runWithContext(
        {
          systemPrompt: "Ctx.",
          tools,
          messages: [{ role: "user", content: "hi" }],
        },
        { maxTokens: 50, timeoutMs: 1000 },
      ),
    )
    const body = JSON.parse(
      (fakeFetch.mock.calls[0][1] as RequestInit).body as string,
    )
    expect(body.systemInstruction.parts[0].text).toBe("Ctx.")
    expect(body.tools[0].functionDeclarations[0].name).toBe("read_file")
  })

  it("name is 'gemini'", () => {
    expect(new GeminiAdapter({ apiKey: "k" }).name).toBe("gemini")
  })
})
