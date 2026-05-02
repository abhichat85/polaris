/**
 * MCP types — D-056 / Phase 2.1.
 *
 * Polaris-side type contracts for the Model Context Protocol integration.
 * Wraps just enough of the MCP spec to (a) connect to a server, (b)
 * fetch its tool catalog, and (c) call those tools — the three
 * primitives the agent harness needs.
 */

import type { ToolDefinition } from "@/lib/tools/definitions"
import type { ToolOutput } from "@/lib/tools/types"

/** Tool-name prefix that distinguishes MCP-sourced tools from native ones. */
export const MCP_TOOL_PREFIX = "mcp__"

export type MCPTransport =
  | { type: "stdio"; command: string; args?: string[]; env?: Record<string, string> }
  | { type: "http"; url: string; headers?: Record<string, string> }
  | { type: "sse"; url: string; headers?: Record<string, string> }

export interface MCPServerConfig {
  /** Stable name for the server (used as the prefix on tool names). */
  name: string
  transport: MCPTransport
  /** Default tool-call timeout in ms. Default 10000. */
  timeoutMs?: number
  /** Optional allowlist — when set, only these tools are exposed. */
  toolAllowlist?: string[]
  /** When false, the server is configured but not actually connected. */
  enabled?: boolean
}

/** Default per-MCP-call timeout. */
export const DEFAULT_MCP_TIMEOUT_MS = 10_000

/** Maximum MCP-tool call invocations per agent turn. */
export const PER_TURN_MCP_BUDGET = 3

/* ─────────────────────────────────────────────────────────────────────────
 * Wire format helpers
 *
 * Tool name on the wire: `mcp__<server>__<tool>`. Underscores in server
 * or tool names are preserved (the prefix is the discriminator, and
 * server names should not contain `__`).
 * ───────────────────────────────────────────────────────────────────── */

export function makeMCPName(server: string, tool: string): string {
  return `${MCP_TOOL_PREFIX}${server}__${tool}`
}

export function parseMCPName(
  name: string,
): { server: string; tool: string } | null {
  if (!name.startsWith(MCP_TOOL_PREFIX)) return null
  const rest = name.slice(MCP_TOOL_PREFIX.length)
  const splitAt = rest.indexOf("__")
  if (splitAt <= 0 || splitAt === rest.length - 2) return null
  return {
    server: rest.slice(0, splitAt),
    tool: rest.slice(splitAt + 2),
  }
}

export function isMCPName(name: string): boolean {
  return parseMCPName(name) !== null
}

/* ─────────────────────────────────────────────────────────────────────────
 * Client interface
 *
 * Polaris uses one MCPClient instance per server. Implementations:
 *   - StdioMCPClient (production via @modelcontextprotocol/sdk)
 *   - InMemoryMCPClient (tests)
 * ───────────────────────────────────────────────────────────────────── */

export interface MCPClient {
  readonly serverName: string
  /** Fetch the server's tool list, prefix-translated to native shape. */
  listTools(): Promise<ToolDefinition[]>
  /** Invoke a tool by its UN-prefixed (MCP-side) name. */
  callTool(toolName: string, input: Record<string, unknown>): Promise<ToolOutput>
  /** Tear down transport. Idempotent. */
  close(): Promise<void>
}
