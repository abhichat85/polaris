/**
 * InMemoryMCPClient — test-only MCP client.
 *
 * Lets unit tests register a fake server with a fixed tool catalog and
 * deterministic call results without spawning a real subprocess.
 */

import type { ToolDefinition } from "@/lib/tools/definitions"
import type { ToolOutput } from "@/lib/tools/types"
import type { MCPClient } from "./types"

export interface InMemoryMCPClientOptions {
  serverName: string
  tools?: ToolDefinition[]
  /** Map of tool-name → handler. Tools without a handler return INTERNAL_ERROR. */
  handlers?: Record<string, (input: Record<string, unknown>) => Promise<ToolOutput> | ToolOutput>
}

export class InMemoryMCPClient implements MCPClient {
  readonly serverName: string
  private readonly tools: ToolDefinition[]
  private readonly handlers: Record<
    string,
    (input: Record<string, unknown>) => Promise<ToolOutput> | ToolOutput
  >
  private closed = false

  constructor(opts: InMemoryMCPClientOptions) {
    this.serverName = opts.serverName
    this.tools = opts.tools ?? []
    this.handlers = opts.handlers ?? {}
  }

  async listTools(): Promise<ToolDefinition[]> {
    if (this.closed) throw new Error("client closed")
    return [...this.tools]
  }

  async callTool(
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<ToolOutput> {
    if (this.closed) throw new Error("client closed")
    const handler = this.handlers[toolName]
    if (!handler) {
      return {
        ok: false,
        error: `Unknown MCP tool ${this.serverName}/${toolName}`,
        errorCode: "INTERNAL_ERROR",
      }
    }
    return await handler(input)
  }

  async close(): Promise<void> {
    this.closed = true
  }

  /** Inspection helper for tests. */
  isClosed(): boolean {
    return this.closed
  }
}
