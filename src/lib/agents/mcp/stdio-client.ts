/**
 * StdioMCPClient — D-056 / Phase 2.1 (production stdio transport).
 *
 * Wraps `@modelcontextprotocol/sdk` Client + StdioClientTransport with the
 * Polaris-side `MCPClient` interface so MCPRegistry can route tool calls
 * to subprocess-backed MCP servers identically to the in-memory client.
 *
 * Lifecycle:
 *   - construct → not yet connected (lazy)
 *   - first listTools() / callTool() triggers connect()
 *   - close() tears down the subprocess + transport
 *
 * Lazy connection matters because agent-loop instantiates clients
 * up-front for every configured server; if a server is broken we'd
 * rather discover it on first use than block the whole run.
 */

import type { ToolDefinition, ToolJsonSchema } from "@/lib/tools/definitions"
import type { ToolOutput } from "@/lib/tools/types"
import type { MCPClient, MCPServerConfig } from "./types"
import { DEFAULT_MCP_TIMEOUT_MS } from "./types"

/**
 * Minimal shapes from the MCP SDK we depend on. Re-declared locally so
 * the module's public TypeScript surface doesn't leak SDK types — and
 * so the SDK can be lazy-loaded (it's only needed when this client is
 * actually instantiated, not for the in-memory test client).
 */
interface MCPTool {
  name: string
  description?: string
  inputSchema?: {
    type?: "object"
    properties?: Record<string, unknown>
    required?: string[]
  }
}

interface MCPListToolsResult {
  tools: MCPTool[]
  nextCursor?: string
}

interface MCPContentBlock {
  type: string
  text?: string
  data?: string
  mimeType?: string
  uri?: string
  name?: string
}

interface MCPCallToolResult {
  content?: MCPContentBlock[]
  isError?: boolean
  structuredContent?: Record<string, unknown>
  /** Backwards-compat shape returned by some servers. */
  toolResult?: unknown
}

interface MCPClientLike {
  connect(transport: unknown): Promise<void>
  listTools(): Promise<MCPListToolsResult>
  callTool(params: {
    name: string
    arguments?: Record<string, unknown>
  }): Promise<MCPCallToolResult>
  close(): Promise<void>
}

interface StdioTransportLike {
  // No public methods we use — we just hand the instance to client.connect()
}

/**
 * Factory function for the SDK pieces we need. Defaults to dynamic
 * imports of the real SDK; tests inject deterministic stubs.
 */
export interface StdioMCPClientDeps {
  createClient?: (info: { name: string; version: string }) => MCPClientLike
  createStdioTransport?: (params: {
    command: string
    args?: string[]
    env?: Record<string, string>
    stderr?: "inherit" | "ignore" | "pipe"
  }) => StdioTransportLike
}

/**
 * Default deps that lazy-import the real SDK. Module-level so we only
 * pay the import cost when an instance is actually used (not at module
 * load).
 */
async function defaultDeps(): Promise<Required<StdioMCPClientDeps>> {
  // The SDK ships ESM only. Dynamic import keeps it tree-shakeable and
  // means the test fixtures don't need to mock the SDK transitively.
  const [clientMod, stdioMod] = await Promise.all([
    import("@modelcontextprotocol/sdk/client/index.js"),
    import("@modelcontextprotocol/sdk/client/stdio.js"),
  ])
  const ClientCtor = (clientMod as { Client: new (...args: unknown[]) => MCPClientLike }).Client
  const StdioCtor = (stdioMod as {
    StdioClientTransport: new (...args: unknown[]) => StdioTransportLike
  }).StdioClientTransport
  return {
    createClient: (info) =>
      new ClientCtor(info, { capabilities: {} }) as MCPClientLike,
    createStdioTransport: (params) =>
      new StdioCtor({
        command: params.command,
        args: params.args ?? [],
        env: params.env,
        stderr: params.stderr ?? "inherit",
      }) as StdioTransportLike,
  }
}

export class StdioMCPClient implements MCPClient {
  readonly serverName: string
  private readonly config: MCPServerConfig
  private readonly customDeps?: StdioMCPClientDeps
  private client: MCPClientLike | null = null
  private connectPromise: Promise<void> | null = null
  private closed = false

  constructor(config: MCPServerConfig, deps?: StdioMCPClientDeps) {
    if (config.transport.type !== "stdio") {
      throw new Error(
        `StdioMCPClient only supports transport.type="stdio", got "${config.transport.type}"`,
      )
    }
    this.serverName = config.name
    this.config = config
    this.customDeps = deps
  }

  async listTools(): Promise<ToolDefinition[]> {
    const client = await this.ensureConnected()
    const result = await this.withTimeout(
      client.listTools(),
      this.config.timeoutMs ?? DEFAULT_MCP_TIMEOUT_MS,
      "listTools",
    )
    const allTools = result.tools.map(translateTool)
    if (this.config.toolAllowlist && this.config.toolAllowlist.length > 0) {
      const allow = new Set(this.config.toolAllowlist)
      return allTools.filter((t) => allow.has(t.name))
    }
    return allTools
  }

  async callTool(
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<ToolOutput> {
    if (
      this.config.toolAllowlist &&
      this.config.toolAllowlist.length > 0 &&
      !this.config.toolAllowlist.includes(toolName)
    ) {
      return {
        ok: false,
        error: `Tool not in allowlist: ${toolName}`,
        errorCode: "INTERNAL_ERROR",
      }
    }
    const client = await this.ensureConnected()
    try {
      const result = await this.withTimeout(
        client.callTool({ name: toolName, arguments: input }),
        this.config.timeoutMs ?? DEFAULT_MCP_TIMEOUT_MS,
        `callTool(${toolName})`,
      )
      return translateCallResult(result)
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        errorCode: "NETWORK_ERROR",
      }
    }
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    if (this.client) {
      try {
        await this.client.close()
      } catch {
        /* swallow — best-effort teardown */
      }
      this.client = null
    }
  }

  /** Connect on first use; subsequent calls share the same connection. */
  private async ensureConnected(): Promise<MCPClientLike> {
    if (this.closed) throw new Error(`MCP client ${this.serverName} is closed`)
    if (this.client) return this.client
    if (!this.connectPromise) {
      this.connectPromise = this.doConnect()
    }
    await this.connectPromise
    if (!this.client) throw new Error("MCP client failed to initialize")
    return this.client
  }

  private async doConnect(): Promise<void> {
    const deps = this.customDeps
      ? await this.resolveDeps(this.customDeps)
      : await defaultDeps()
    if (this.config.transport.type !== "stdio") {
      throw new Error("StdioMCPClient: non-stdio transport reached connect()")
    }
    const transport = deps.createStdioTransport({
      command: this.config.transport.command,
      args: this.config.transport.args,
      env: this.config.transport.env,
    })
    const client = deps.createClient({
      name: `polaris-mcp-${this.serverName}`,
      version: "1.0.0",
    })
    await client.connect(transport)
    this.client = client
  }

  private async resolveDeps(custom: StdioMCPClientDeps): Promise<Required<StdioMCPClientDeps>> {
    const fallback = await defaultDeps()
    return {
      createClient: custom.createClient ?? fallback.createClient,
      createStdioTransport: custom.createStdioTransport ?? fallback.createStdioTransport,
    }
  }

  private async withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) =>
        setTimeout(
          () =>
            reject(new Error(`MCP ${this.serverName}.${label} timed out after ${ms}ms`)),
          ms,
        ),
      ),
    ])
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * Translation: MCP SDK shapes → Polaris ToolDefinition / ToolOutput
 * ───────────────────────────────────────────────────────────────────── */

function translateTool(tool: MCPTool): ToolDefinition {
  // Polaris's ToolJsonSchema requires `required: string[]`. Many MCP
  // servers omit it — default to empty.
  const inputSchema: ToolJsonSchema = {
    type: "object",
    properties:
      (tool.inputSchema?.properties as ToolJsonSchema["properties"]) ?? {},
    required: tool.inputSchema?.required ?? [],
  }
  return {
    name: tool.name,
    description: tool.description ?? `MCP tool: ${tool.name}`,
    inputSchema,
  }
}

function translateCallResult(result: MCPCallToolResult): ToolOutput {
  // New-style result: { content: [...], isError?: bool, structuredContent? }
  if (Array.isArray(result.content)) {
    const formatted = result.content
      .map((b) => formatBlock(b))
      .filter((s) => s.length > 0)
      .join("\n")
    if (result.isError) {
      return {
        ok: false,
        error: formatted || "MCP tool reported an error",
        errorCode: "INTERNAL_ERROR",
      }
    }
    return {
      ok: true,
      data: result.structuredContent
        ? { formatted, structured: result.structuredContent }
        : { formatted },
    }
  }
  // Legacy result: { toolResult }
  if (result.toolResult !== undefined) {
    return { ok: true, data: { result: result.toolResult } }
  }
  return { ok: true, data: { formatted: "" } }
}

function formatBlock(block: MCPContentBlock): string {
  switch (block.type) {
    case "text":
      return block.text ?? ""
    case "image":
      return `[image: ${block.mimeType ?? "?"}, ${block.data?.length ?? 0} bytes base64]`
    case "audio":
      return `[audio: ${block.mimeType ?? "?"}, ${block.data?.length ?? 0} bytes base64]`
    case "resource":
      return `[resource: ${JSON.stringify(block).slice(0, 200)}]`
    case "resource_link":
      return `[resource_link: ${block.name ?? ""} ${block.uri ?? ""}]`
    default:
      return `[unknown block type: ${block.type}]`
  }
}
