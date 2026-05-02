/**
 * Tests for MCP client + registry — D-056 / Phase 2.1.
 */
import { describe, expect, it, vi } from "vitest"
import {
  isMCPName,
  makeMCPName,
  parseMCPName,
} from "@/lib/agents/mcp/types"
import { MCPRegistry } from "@/lib/agents/mcp/registry"
import { InMemoryMCPClient } from "@/lib/agents/mcp/in-memory-client"

describe("MCP wire-format helpers", () => {
  it("makeMCPName joins server + tool with prefix", () => {
    expect(makeMCPName("github", "search_repos")).toBe("mcp__github__search_repos")
  })

  it("parseMCPName splits a valid name", () => {
    expect(parseMCPName("mcp__github__search_repos")).toEqual({
      server: "github",
      tool: "search_repos",
    })
  })

  it("parseMCPName handles tools with underscores", () => {
    expect(parseMCPName("mcp__db__query_with_args")).toEqual({
      server: "db",
      tool: "query_with_args",
    })
  })

  it("parseMCPName returns null for non-MCP names", () => {
    expect(parseMCPName("read_file")).toBeNull()
    expect(parseMCPName("mcpfoo")).toBeNull()
    expect(parseMCPName("mcp__")).toBeNull()
    expect(parseMCPName("mcp__server__")).toBeNull()
  })

  it("isMCPName matches parseMCPName's truthiness", () => {
    expect(isMCPName("mcp__a__b")).toBe(true)
    expect(isMCPName("read_file")).toBe(false)
    expect(isMCPName("mcp__only_server")).toBe(false)
  })
})

describe("MCPRegistry", () => {
  it("hasClients reflects construction", () => {
    expect(new MCPRegistry([]).hasClients()).toBe(false)
    expect(
      new MCPRegistry([new InMemoryMCPClient({ serverName: "x" })]).hasClients(),
    ).toBe(true)
  })

  it("allTools merges and namespaces tools from every client", async () => {
    const a = new InMemoryMCPClient({
      serverName: "github",
      tools: [
        {
          name: "search",
          description: "Search GH",
          inputSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
        },
      ],
    })
    const b = new InMemoryMCPClient({
      serverName: "slack",
      tools: [
        {
          name: "search",
          description: "Search Slack",
          inputSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
        },
      ],
    })
    const reg = new MCPRegistry([a, b])
    const tools = await reg.allTools()
    expect(tools).toHaveLength(2)
    const names = tools.map((t) => t.name).sort()
    expect(names).toEqual(["mcp__github__search", "mcp__slack__search"])
  })

  it("allTools cache returns the same array on repeat calls", async () => {
    const c = new InMemoryMCPClient({
      serverName: "x",
      tools: [
        {
          name: "ping",
          description: "ping",
          inputSchema: { type: "object", properties: {}, required: [] },
        },
      ],
    })
    const listSpy = vi.spyOn(c, "listTools")
    const reg = new MCPRegistry([c])
    await reg.allTools()
    await reg.allTools()
    expect(listSpy).toHaveBeenCalledTimes(1)
  })

  it("ownsToolCall returns true only for known prefix+server", () => {
    const reg = new MCPRegistry([
      new InMemoryMCPClient({ serverName: "github" }),
    ])
    expect(reg.ownsToolCall({ id: "1", name: "mcp__github__x", input: {} })).toBe(
      true,
    )
    expect(reg.ownsToolCall({ id: "2", name: "mcp__slack__x", input: {} })).toBe(
      false,
    )
    expect(reg.ownsToolCall({ id: "3", name: "read_file", input: {} })).toBe(
      false,
    )
  })

  it("dispatch routes to the matching client and returns its output", async () => {
    const handler = vi.fn(async () => ({
      ok: true as const,
      data: { result: 42 },
    }))
    const client = new InMemoryMCPClient({
      serverName: "math",
      tools: [
        {
          name: "answer",
          description: "answer",
          inputSchema: { type: "object", properties: {}, required: [] },
        },
      ],
      handlers: { answer: handler },
    })
    const reg = new MCPRegistry([client])
    const result = await reg.dispatch({
      id: "tu1",
      name: "mcp__math__answer",
      input: { q: "x" },
    })
    expect(result).toMatchObject({ ok: true, data: { result: 42 } })
    expect(handler).toHaveBeenCalledWith({ q: "x" })
  })

  it("dispatch returns INTERNAL_ERROR for unknown server", async () => {
    const reg = new MCPRegistry([])
    const result = await reg.dispatch({
      id: "tu1",
      name: "mcp__missing__tool",
      input: {},
    })
    expect(result).toMatchObject({ ok: false, errorCode: "INTERNAL_ERROR" })
  })

  it("dispatch returns INTERNAL_ERROR for non-MCP name", async () => {
    const reg = new MCPRegistry([])
    const result = await reg.dispatch({
      id: "tu1",
      name: "read_file",
      input: {},
    })
    expect(result).toMatchObject({ ok: false, errorCode: "INTERNAL_ERROR" })
  })

  it("dispatch wraps client errors as NETWORK_ERROR", async () => {
    const client = new InMemoryMCPClient({
      serverName: "broken",
      tools: [
        {
          name: "x",
          description: "",
          inputSchema: { type: "object", properties: {}, required: [] },
        },
      ],
      handlers: {
        x: () => {
          throw new Error("server crashed")
        },
      },
    })
    const reg = new MCPRegistry([client])
    const result = await reg.dispatch({ id: "1", name: "mcp__broken__x", input: {} })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errorCode).toBe("NETWORK_ERROR")
      expect(result.error).toContain("server crashed")
    }
  })

  it("listTools failure on one server doesn't poison the registry", async () => {
    const broken = new InMemoryMCPClient({ serverName: "broken" })
    vi.spyOn(broken, "listTools").mockRejectedValue(new Error("dead"))
    const ok = new InMemoryMCPClient({
      serverName: "ok",
      tools: [
        {
          name: "ping",
          description: "",
          inputSchema: { type: "object", properties: {}, required: [] },
        },
      ],
    })
    const reg = new MCPRegistry([broken, ok])
    const tools = await reg.allTools()
    // Only the working server contributed tools.
    expect(tools).toHaveLength(1)
    expect(tools[0].name).toBe("mcp__ok__ping")
  })

  it("close() tears down every client", async () => {
    const a = new InMemoryMCPClient({ serverName: "a" })
    const b = new InMemoryMCPClient({ serverName: "b" })
    const reg = new MCPRegistry([a, b])
    await reg.close()
    expect(a.isClosed()).toBe(true)
    expect(b.isClosed()).toBe(true)
    expect(reg.hasClients()).toBe(false)
  })

  it("close() swallows individual client errors", async () => {
    const broken = new InMemoryMCPClient({ serverName: "broken" })
    vi.spyOn(broken, "close").mockRejectedValue(new Error("won't close"))
    const ok = new InMemoryMCPClient({ serverName: "ok" })
    const reg = new MCPRegistry([broken, ok])
    await expect(reg.close()).resolves.toBeUndefined()
    expect(ok.isClosed()).toBe(true)
  })
})
