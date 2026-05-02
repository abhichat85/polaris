/**
 * MCPRegistry — D-056 / Phase 2.1.
 *
 * Aggregates one or more MCPClients. The agent harness calls:
 *
 *   const reg = new MCPRegistry([client1, client2])
 *   const tools = await reg.allTools()           // merge all servers
 *   const result = await reg.dispatch(toolCall)  // route by prefix
 *
 * Tool names are namespaced by server (`mcp__<server>__<tool>`) so two
 * servers can both expose `search` without collision.
 */

import type { ToolDefinition } from "@/lib/tools/definitions"
import type { ToolOutput } from "@/lib/tools/types"
import type { ToolCall } from "../types"
import {
  isMCPName,
  makeMCPName,
  parseMCPName,
  type MCPClient,
} from "./types"

export class MCPRegistry {
  private readonly clientByServer: Map<string, MCPClient>
  private cachedTools: ToolDefinition[] | null = null

  constructor(clients: readonly MCPClient[]) {
    this.clientByServer = new Map(clients.map((c) => [c.serverName, c]))
  }

  hasClients(): boolean {
    return this.clientByServer.size > 0
  }

  /** Fetch + namespace tool defs from every client. Cached after first call. */
  async allTools(): Promise<ToolDefinition[]> {
    if (this.cachedTools) return this.cachedTools
    const merged: ToolDefinition[] = []
    for (const [server, client] of this.clientByServer) {
      const tools = await safeListTools(server, client)
      for (const tool of tools) {
        merged.push({
          ...tool,
          name: makeMCPName(server, tool.name),
        })
      }
    }
    this.cachedTools = merged
    return merged
  }

  /** Returns true iff this tool name is routed by the registry. */
  ownsToolCall(toolCall: ToolCall): boolean {
    if (!isMCPName(toolCall.name)) return false
    const parsed = parseMCPName(toolCall.name)
    return !!parsed && this.clientByServer.has(parsed.server)
  }

  /** Route a tool call to the right client. */
  async dispatch(toolCall: ToolCall): Promise<ToolOutput> {
    const parsed = parseMCPName(toolCall.name)
    if (!parsed) {
      return {
        ok: false,
        error: `Not an MCP tool: ${toolCall.name}`,
        errorCode: "INTERNAL_ERROR",
      }
    }
    const client = this.clientByServer.get(parsed.server)
    if (!client) {
      return {
        ok: false,
        error: `Unknown MCP server: ${parsed.server}`,
        errorCode: "INTERNAL_ERROR",
      }
    }
    try {
      return await client.callTool(parsed.tool, toolCall.input)
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        errorCode: "NETWORK_ERROR",
      }
    }
  }

  /** Tear down all clients. Idempotent. */
  async close(): Promise<void> {
    const closes: Promise<void>[] = []
    for (const client of this.clientByServer.values()) {
      closes.push(safeClose(client))
    }
    await Promise.all(closes)
    this.clientByServer.clear()
    this.cachedTools = null
  }
}

async function safeListTools(
  server: string,
  client: MCPClient,
): Promise<ToolDefinition[]> {
  try {
    return await client.listTools()
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[MCPRegistry] listTools failed for ${server}:`, err)
    return []
  }
}

async function safeClose(client: MCPClient): Promise<void> {
  try {
    await client.close()
  } catch {
    /* swallow */
  }
}
