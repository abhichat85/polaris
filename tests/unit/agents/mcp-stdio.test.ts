/**
 * Tests for StdioMCPClient — D-056 / Phase 2.1.
 *
 * We don't spawn a real subprocess in unit tests. Instead, we inject
 * stub `createClient` + `createStdioTransport` factories so the
 * lifecycle (connect / listTools / callTool / close) and translation
 * logic can be exercised deterministically.
 */
import { describe, expect, it, vi } from "vitest"
import { StdioMCPClient } from "@/lib/agents/mcp/stdio-client"
import type { MCPServerConfig } from "@/lib/agents/mcp/types"

interface StubClient {
  connect: ReturnType<typeof vi.fn>
  listTools: ReturnType<typeof vi.fn>
  callTool: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

function stubClient(overrides: Partial<StubClient> = {}): StubClient {
  return {
    connect: vi.fn(async () => {}),
    listTools: vi.fn(async () => ({ tools: [] })),
    callTool: vi.fn(async () => ({ content: [] })),
    close: vi.fn(async () => {}),
    ...overrides,
  }
}

function makeClient(
  cfg: Partial<MCPServerConfig> & { name: string },
  client: StubClient,
): StdioMCPClient {
  const config: MCPServerConfig = {
    name: cfg.name,
    transport: cfg.transport ?? {
      type: "stdio",
      command: "node",
      args: ["server.js"],
    },
    timeoutMs: cfg.timeoutMs,
    toolAllowlist: cfg.toolAllowlist,
    enabled: cfg.enabled,
  }
  return new StdioMCPClient(config, {
    createClient: () => client,
    createStdioTransport: () => ({}),
  })
}

describe("StdioMCPClient", () => {
  it("rejects non-stdio transport at construction", () => {
    expect(
      () =>
        new StdioMCPClient({
          name: "x",
          transport: { type: "http", url: "http://x" },
        }),
    ).toThrow(/stdio/)
  })

  it("connects lazily on first listTools call", async () => {
    const c = stubClient()
    const client = makeClient({ name: "lazy" }, c)
    expect(c.connect).not.toHaveBeenCalled()
    await client.listTools()
    expect(c.connect).toHaveBeenCalledOnce()
  })

  it("only connects once across multiple calls", async () => {
    const c = stubClient()
    const client = makeClient({ name: "x" }, c)
    await client.listTools()
    await client.listTools()
    await client.callTool("foo", {})
    expect(c.connect).toHaveBeenCalledOnce()
  })

  it("translates MCP tools to Polaris ToolDefinition shape", async () => {
    const c = stubClient({
      listTools: vi.fn(async () => ({
        tools: [
          {
            name: "search",
            description: "Search the index",
            inputSchema: {
              type: "object",
              properties: { q: { type: "string" } },
              required: ["q"],
            },
          },
        ],
      })),
    })
    const client = makeClient({ name: "x" }, c)
    const tools = await client.listTools()
    expect(tools).toHaveLength(1)
    expect(tools[0]).toEqual({
      name: "search",
      description: "Search the index",
      inputSchema: {
        type: "object",
        properties: { q: { type: "string" } },
        required: ["q"],
      },
    })
  })

  it("provides default description when MCP server omits it", async () => {
    const c = stubClient({
      listTools: vi.fn(async () => ({
        tools: [{ name: "ping" }],
      })),
    })
    const client = makeClient({ name: "x" }, c)
    const tools = await client.listTools()
    expect(tools[0].description).toContain("ping")
  })

  it("defaults required to [] when MCP server omits it", async () => {
    const c = stubClient({
      listTools: vi.fn(async () => ({
        tools: [
          {
            name: "x",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      })),
    })
    const client = makeClient({ name: "x" }, c)
    const tools = await client.listTools()
    expect(tools[0].inputSchema.required).toEqual([])
  })

  it("respects toolAllowlist on listTools()", async () => {
    const c = stubClient({
      listTools: vi.fn(async () => ({
        tools: [
          { name: "search", inputSchema: { type: "object" } },
          { name: "delete_all", inputSchema: { type: "object" } },
        ],
      })),
    })
    const client = makeClient(
      { name: "x", toolAllowlist: ["search"] },
      c,
    )
    const tools = await client.listTools()
    expect(tools).toHaveLength(1)
    expect(tools[0].name).toBe("search")
  })

  it("blocks callTool for non-allowlisted tools", async () => {
    const c = stubClient()
    const client = makeClient(
      { name: "x", toolAllowlist: ["search"] },
      c,
    )
    const r = await client.callTool("delete_all", {})
    expect(r.ok).toBe(false)
    expect(c.callTool).not.toHaveBeenCalled()
  })

  it("translates text content blocks into formatted output", async () => {
    const c = stubClient({
      callTool: vi.fn(async () => ({
        content: [
          { type: "text", text: "first paragraph" },
          { type: "text", text: "second paragraph" },
        ],
      })),
    })
    const client = makeClient({ name: "x" }, c)
    const r = await client.callTool("foo", { a: 1 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect((r.data as { formatted: string }).formatted).toContain("first paragraph")
      expect((r.data as { formatted: string }).formatted).toContain("second paragraph")
    }
  })

  it("returns ok:false when MCP server marks isError=true", async () => {
    const c = stubClient({
      callTool: vi.fn(async () => ({
        content: [{ type: "text", text: "rate limited" }],
        isError: true,
      })),
    })
    const client = makeClient({ name: "x" }, c)
    const r = await client.callTool("foo", {})
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toContain("rate limited")
      expect(r.errorCode).toBe("INTERNAL_ERROR")
    }
  })

  it("includes structuredContent when present", async () => {
    const c = stubClient({
      callTool: vi.fn(async () => ({
        content: [{ type: "text", text: "ok" }],
        structuredContent: { count: 42 },
      })),
    })
    const client = makeClient({ name: "x" }, c)
    const r = await client.callTool("count", {})
    if (r.ok) {
      expect((r.data as { structured: { count: number } }).structured.count).toBe(42)
    }
  })

  it("supports legacy { toolResult } shape", async () => {
    const c = stubClient({
      callTool: vi.fn(async () => ({ toolResult: { value: 7 } })),
    })
    const client = makeClient({ name: "x" }, c)
    const r = await client.callTool("legacy", {})
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect((r.data as { result: { value: number } }).result.value).toBe(7)
    }
  })

  it("wraps callTool exceptions as NETWORK_ERROR", async () => {
    const c = stubClient({
      callTool: vi.fn(async () => {
        throw new Error("server died")
      }),
    })
    const client = makeClient({ name: "x" }, c)
    const r = await client.callTool("foo", {})
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errorCode).toBe("NETWORK_ERROR")
      expect(r.error).toContain("server died")
    }
  })

  it("times out hung calls", async () => {
    const c = stubClient({
      callTool: vi.fn(
        () => new Promise(() => {}), // never resolves
      ),
    })
    const client = makeClient({ name: "x", timeoutMs: 20 }, c)
    const r = await client.callTool("hang", {})
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toMatch(/timed out/i)
    }
  })

  it("close() is idempotent", async () => {
    const c = stubClient()
    const client = makeClient({ name: "x" }, c)
    await client.listTools() // forces connect
    await client.close()
    await client.close()
    expect(c.close).toHaveBeenCalledTimes(1)
  })

  it("rejects calls after close", async () => {
    const c = stubClient()
    const client = makeClient({ name: "x" }, c)
    await client.listTools()
    await client.close()
    await expect(client.listTools()).rejects.toThrow(/closed/)
  })

  it("handles image content blocks gracefully", async () => {
    const c = stubClient({
      callTool: vi.fn(async () => ({
        content: [
          { type: "image", data: "AAAA", mimeType: "image/png" },
        ],
      })),
    })
    const client = makeClient({ name: "x" }, c)
    const r = await client.callTool("snap", {})
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect((r.data as { formatted: string }).formatted).toContain("image")
    }
  })
})
