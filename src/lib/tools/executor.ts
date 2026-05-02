/**
 * ToolExecutor — runs a single agent tool call.
 * Authority: CONSTITUTION §8.3 (execution flow), §10 (Convex first, then sandbox),
 * Plan 01 Task 13.
 *
 * Order of operations:
 *   1. Permission check (writes/edits/creates/deletes only — reads can see all)
 *   2. Convex (FileService) write succeeds first — fails loud if it errors
 *   3. Sandbox write second — failures returned as SANDBOX_DEAD; FileService
 *      already updated, so the sandbox can resync from it on next restart
 *   4. Tool result is returned (never thrown) — the agent loop feeds these back
 *      to the model as Layer 2 of error recovery
 */

import { applyEdit } from "./edit-file"
import { applyMultiEdit, type MultiEditEdit } from "./multi-edit"
import type { ToolCall } from "@/lib/agents/types"
import { FORBIDDEN_COMMAND_PATTERNS } from "./definitions"
import { FilePermissionPolicy } from "./file-permission-policy"
import { searchCode, type SearchCodeArgs, type SearchCodeResult } from "./search-code"
import {
  readRuntimeErrors,
  type ReadRuntimeErrorsArgs,
  type ReadRuntimeErrorsDeps,
} from "./read-runtime-errors"
import {
  executeWebFetch,
  WebFetchError,
  type WebFetchArgs,
  type WebFetchDeps,
} from "./web-fetch"
import { ShellSessionRegistry } from "@/lib/agents/shell-session"
import {
  findDefinition,
  findReferences,
  formatCodeNavMatches,
  type FindDefinitionArgs,
  type FindReferencesArgs,
} from "./code-nav"
import type { HookRunner } from "@/lib/agents/hooks/hook-runner"
import type { HookContext } from "@/lib/agents/hooks/types"
import type { MCPRegistry } from "@/lib/agents/mcp/registry"
import { isMCPName } from "@/lib/agents/mcp/types"
import type { FileService } from "@/lib/files/types"
import type { SandboxProvider } from "@/lib/sandbox/types"
import type { ToolErrorCode, ToolExecutionContext, ToolOutput } from "./types"

export interface ToolExecutorDeps {
  files: FileService
  sandbox: SandboxProvider
  /**
   * D-045 — Optional runtime-errors deps. When provided, the
   * `read_runtime_errors` tool returns real Convex data; when absent,
   * the tool returns a friendly "not configured" message so older
   * call sites + tests don't need to change.
   */
  runtimeErrors?: ReadRuntimeErrorsDeps
  /**
   * D-044 — Optional recent-edit recorder. When provided, the executor
   * fires it after every successful mutating tool call so the runner's
   * live-context block (D-047) can show the most-recently-edited
   * paths. Best-effort: any failure is swallowed (missing live context
   * must never fail an agent run).
   */
  recordEdit?: (path: string) => Promise<void>
  /**
   * D-050 — Optional web_fetch deps. When provided, the `web_fetch` tool
   * uses them (notably: a Haiku-backed summarizer). When absent, the
   * tool still works but `prompt`-driven summarization falls back to
   * returning the raw fetched content.
   */
  webFetch?: WebFetchDeps
  /**
   * D-055 — Optional hook runner for pre/post tool-call interception.
   * When provided, every tool call is wrapped with pre + post hook
   * invocations. Hooks can deny, modify input, or transform output.
   * When absent, no hooks fire (zero-config baseline).
   */
  hooks?: HookRunner
  /**
   * D-055 — Optional supplier of HookContext for the active run.
   * Required if `hooks` is provided. Returns the context bundle every
   * hook invocation receives.
   */
  hookContext?: () => HookContext
  /**
   * D-056 — Optional MCP registry. When provided and a tool name has
   * the `mcp__<server>__<tool>` prefix, the call is routed to the
   * matching MCP client instead of the local dispatch table.
   */
  mcp?: MCPRegistry
}

const COMMAND_TIMEOUT_MS = 60_000
const OUTPUT_MAX_CHARS = 4000

const MUTATING_TOOLS = new Set([
  "write_file",
  "edit_file",
  "multi_edit",
  "create_file",
  "delete_file",
])

export class ToolExecutor {
  /** D-051 — One ShellSession per sandbox; lazy-initialized by `shell` tool. */
  private readonly shellRegistry: ShellSessionRegistry

  constructor(private readonly deps: ToolExecutorDeps) {
    this.shellRegistry = new ShellSessionRegistry(deps.sandbox)
  }

  /**
   * Dispose any persistent sandbox-scoped state (shell sessions, MCP
   * clients). Call this from the agent-loop's `finally` block when a
   * run ends so a future run on the same process gets a fresh state.
   */
  async dispose(): Promise<void> {
    this.shellRegistry.disposeAll()
    if (this.deps.mcp) {
      await this.deps.mcp.close()
    }
  }

  async execute(toolCall: ToolCall, ctx: ToolExecutionContext): Promise<ToolOutput> {
    try {
      // D-055 — pre_tool_call hooks. Hooks can deny the call or modify
      // input. Runs BEFORE the permission gate so deny reasons can
      // include policy text the gate doesn't know about.
      let effectiveToolCall = toolCall
      if (this.deps.hooks && this.deps.hookContext) {
        const hookCtx = this.deps.hookContext()
        const pre = await this.deps.hooks.runEvent("pre_tool_call", {
          event: "pre_tool_call",
          ctx: hookCtx,
          toolCall,
        })
        if (pre.decision.decision === "deny") {
          return {
            ok: false,
            error: `Denied by hook: ${pre.decision.reason}`,
            errorCode: "PATH_LOCKED",
          }
        }
        if (pre.decision.decision === "modify") {
          effectiveToolCall = {
            ...toolCall,
            input: { ...toolCall.input, ...pre.decision.inputPatch },
          }
        }
      }

      // Layer 0: permission gate for mutating ops.
      if (MUTATING_TOOLS.has(effectiveToolCall.name)) {
        const path = (effectiveToolCall.input as { path?: unknown }).path
        if (typeof path !== "string" || !FilePermissionPolicy.canWrite(path)) {
          return locked(typeof path === "string" ? path : "<missing>")
        }
      }

      let result = await this.dispatch(effectiveToolCall, ctx)

      // D-055 — post_tool_call hooks. Hooks can transform the output.
      if (this.deps.hooks && this.deps.hookContext) {
        const hookCtx = this.deps.hookContext()
        const post = await this.deps.hooks.runEvent("post_tool_call", {
          event: "post_tool_call",
          ctx: hookCtx,
          toolCall: effectiveToolCall,
          output: result,
        })
        if (post.decision.decision === "transform_output") {
          result = post.decision.outputPatch
        }
        // deny + modify decisions are no-ops on post-events.
      }

      // D-044 — record successful mutating edits for live context. Best-effort
      // (any failure is swallowed; missing live context must not fail the run).
      if (
        result.ok &&
        MUTATING_TOOLS.has(effectiveToolCall.name) &&
        this.deps.recordEdit
      ) {
        const path = (effectiveToolCall.input as { path?: unknown }).path
        if (typeof path === "string" && path.length > 0) {
          this.deps.recordEdit(path).catch(() => {
            /* swallow */
          })
        }
      }

      return result
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        errorCode: classifyError(err),
      }
    }
  }

  private async dispatch(
    toolCall: ToolCall,
    ctx: ToolExecutionContext,
  ): Promise<ToolOutput> {
    // D-056 — MCP routing. Tools prefixed `mcp__<server>__<tool>` are
    // dispatched to the registered MCP client; everything else falls
    // through to the native switch below.
    if (this.deps.mcp && isMCPName(toolCall.name) && this.deps.mcp.ownsToolCall(toolCall)) {
      return await this.deps.mcp.dispatch(toolCall)
    }
    switch (toolCall.name) {
      case "read_file":
        return await this.readFile(toolCall.input as ReadInput, ctx)
      case "write_file":
        return await this.writeFile(toolCall.input as WriteInput, ctx)
      case "edit_file":
        return await this.editFile(toolCall.input as EditInput, ctx)
      case "multi_edit":
        return await this.multiEdit(toolCall.input as MultiEditInput, ctx)
      case "create_file":
        return await this.createFile(toolCall.input as WriteInput, ctx)
      case "delete_file":
        return await this.deleteFile(toolCall.input as { path: string }, ctx)
      case "list_files":
        return await this.listFiles(toolCall.input as { directory: string }, ctx)
      case "run_command":
        return await this.runCommand(toolCall.input as RunInput, ctx)
      case "shell":
        return await this.shell(
          toolCall.input as { command: string; timeoutMs?: number },
          ctx,
        )
      case "search_code":
        return await this.searchCode(toolCall.input as unknown as SearchCodeArgs, ctx)
      case "read_runtime_errors":
        return await this.readRuntimeErrors(
          toolCall.input as unknown as ReadRuntimeErrorsArgs,
        )
      case "web_fetch":
        return await this.webFetch(toolCall.input as unknown as WebFetchArgs)
      case "find_definition":
        return await this.findDefinitionTool(
          toolCall.input as unknown as FindDefinitionArgs,
          ctx,
        )
      case "find_references":
        return await this.findReferencesTool(
          toolCall.input as unknown as FindReferencesArgs,
          ctx,
        )
      default:
        return {
          ok: false,
          error: `Unknown tool: ${toolCall.name}`,
          errorCode: "INTERNAL_ERROR",
        }
    }
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  private async readFile(input: ReadInput, ctx: ToolExecutionContext): Promise<ToolOutput> {
    if (!FilePermissionPolicy.canRead(input.path)) {
      return {
        ok: false,
        error: `Cannot read locked path: ${input.path}`,
        errorCode: "PATH_LOCKED",
      }
    }
    const file = await this.deps.files.readPath(ctx.projectId, input.path)
    if (!file) {
      return {
        ok: false,
        error: `File not found: ${input.path}`,
        errorCode: "PATH_NOT_FOUND",
      }
    }
    return { ok: true, data: { content: file.content } }
  }

  private async writeFile(input: WriteInput, ctx: ToolExecutionContext): Promise<ToolOutput> {
    const existing = await this.deps.files.readPath(ctx.projectId, input.path)
    if (!existing) {
      return {
        ok: false,
        error: `File not found (use create_file for new files): ${input.path}`,
        errorCode: "PATH_NOT_FOUND",
      }
    }
    await this.deps.files.writePath(ctx.projectId, input.path, input.content, "agent")
    const sandboxFail = await this.syncToSandbox(ctx, input.path, input.content)
    if (sandboxFail) return sandboxFail
    return { ok: true, data: { written: input.path } }
  }

  private async editFile(input: EditInput, ctx: ToolExecutionContext): Promise<ToolOutput> {
    const existing = await this.deps.files.readPath(ctx.projectId, input.path)
    if (!existing) {
      return {
        ok: false,
        error: `File not found: ${input.path}`,
        errorCode: "PATH_NOT_FOUND",
      }
    }

    const outcome = applyEdit(existing.content, input.search, input.replace)
    if (outcome.kind === "not_found") {
      return {
        ok: false,
        error: `Search string not found in ${input.path}. Re-read the file and refine your search string.`,
        errorCode: "EDIT_NOT_FOUND",
      }
    }
    if (outcome.kind === "not_unique") {
      return {
        ok: false,
        error: `Search string is ambiguous in ${input.path}: it matches ${outcome.occurrences} times. Add surrounding context to make the search unique.`,
        errorCode: "EDIT_NOT_UNIQUE",
      }
    }

    await this.deps.files.writePath(ctx.projectId, input.path, outcome.content, "agent")
    const sandboxFail = await this.syncToSandbox(ctx, input.path, outcome.content)
    if (sandboxFail) return sandboxFail
    return {
      ok: true,
      data: {
        edited: input.path,
        replacedChars: input.search.length,
        addedChars: input.replace.length,
      },
    }
  }

  private async multiEdit(input: MultiEditInput, ctx: ToolExecutionContext): Promise<ToolOutput> {
    if (!Array.isArray(input.edits) || input.edits.length === 0) {
      return {
        ok: false,
        error:
          "multi_edit requires a non-empty edits array. Use edit_file for single edits.",
        errorCode: "INTERNAL_ERROR",
      }
    }

    for (let i = 0; i < input.edits.length; i++) {
      const e = input.edits[i] as MultiEditEdit | undefined
      if (!e || typeof e.search !== "string" || typeof e.replace !== "string") {
        return {
          ok: false,
          error: `multi_edit edit at index ${i} must have string \`search\` and \`replace\` fields.`,
          errorCode: "INTERNAL_ERROR",
        }
      }
    }

    const existing = await this.deps.files.readPath(ctx.projectId, input.path)
    if (!existing) {
      return {
        ok: false,
        error: `File not found: ${input.path}`,
        errorCode: "PATH_NOT_FOUND",
      }
    }

    const outcome = applyMultiEdit(existing.content, input.edits)
    if (outcome.kind === "empty_search") {
      return {
        ok: false,
        error: `Edit ${outcome.index}: search string is empty. Provide a non-empty search.`,
        errorCode: "INTERNAL_ERROR",
      }
    }
    if (outcome.kind === "not_found") {
      return {
        ok: false,
        error: `Edit ${outcome.index}: search string not found in ${input.path} (after preceding edits applied). Re-read the file and refine.`,
        errorCode: "EDIT_NOT_FOUND",
      }
    }
    if (outcome.kind === "not_unique") {
      return {
        ok: false,
        error: `Edit ${outcome.index}: search string is ambiguous in ${input.path} — matches ${outcome.occurrences} times. Add surrounding context or set replaceAll=true on this edit.`,
        errorCode: "EDIT_NOT_UNIQUE",
      }
    }

    await this.deps.files.writePath(ctx.projectId, input.path, outcome.content, "agent")
    const sandboxFail = await this.syncToSandbox(ctx, input.path, outcome.content)
    if (sandboxFail) return sandboxFail
    return {
      ok: true,
      data: {
        edited: input.path,
        editsApplied: input.edits.length,
        newLength: outcome.content.length,
      },
    }
  }

  private async createFile(input: WriteInput, ctx: ToolExecutionContext): Promise<ToolOutput> {
    const existing = await this.deps.files.readPath(ctx.projectId, input.path)
    if (existing) {
      return {
        ok: false,
        error: `File already exists: ${input.path}`,
        errorCode: "PATH_ALREADY_EXISTS",
      }
    }
    await this.deps.files.createPath(ctx.projectId, input.path, input.content, "agent")
    const sandboxFail = await this.syncToSandbox(ctx, input.path, input.content)
    if (sandboxFail) return sandboxFail
    return { ok: true, data: { created: input.path } }
  }

  private async deleteFile(
    input: { path: string },
    ctx: ToolExecutionContext,
  ): Promise<ToolOutput> {
    const existing = await this.deps.files.readPath(ctx.projectId, input.path)
    if (!existing) {
      return {
        ok: false,
        error: `File not found: ${input.path}`,
        errorCode: "PATH_NOT_FOUND",
      }
    }
    await this.deps.files.deletePath(ctx.projectId, input.path)
    if (ctx.sandboxId) {
      try {
        await this.deps.sandbox.deleteFile(ctx.sandboxId, input.path)
      } catch (err) {
        return {
          ok: false,
          error: `Sandbox delete failed: ${(err as Error).message}`,
          errorCode: "SANDBOX_DEAD",
        }
      }
    }
    return { ok: true, data: { deleted: input.path } }
  }

  private async listFiles(
    input: { directory: string },
    ctx: ToolExecutionContext,
  ): Promise<ToolOutput> {
    const result = await this.deps.files.listPath(ctx.projectId, input.directory)
    return { ok: true, data: result }
  }

  private async runCommand(input: RunInput, ctx: ToolExecutionContext): Promise<ToolOutput> {
    if (FORBIDDEN_COMMAND_PATTERNS.some((p) => p.test(input.command))) {
      return {
        ok: false,
        error: `Command not allowed: ${input.command}`,
        errorCode: "COMMAND_FORBIDDEN",
      }
    }
    if (!ctx.sandboxId) {
      return {
        ok: false,
        error: "Sandbox not available — cannot run commands.",
        errorCode: "SANDBOX_DEAD",
      }
    }
    try {
      const result = await this.deps.sandbox.exec(ctx.sandboxId, input.command, {
        cwd: input.cwd,
        timeoutMs: COMMAND_TIMEOUT_MS,
      })
      return {
        ok: true,
        data: {
          stdout: truncate(result.stdout),
          stderr: truncate(result.stderr),
          exitCode: result.exitCode,
          durationMs: result.durationMs,
        },
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes("timeout")) {
        return { ok: false, error: msg, errorCode: "COMMAND_TIMEOUT" }
      }
      return { ok: false, error: msg, errorCode: "SANDBOX_DEAD" }
    }
  }

  private async shell(
    input: { command: string; timeoutMs?: number },
    ctx: ToolExecutionContext,
  ): Promise<ToolOutput> {
    if (!input || typeof input.command !== "string" || input.command.trim().length === 0) {
      return {
        ok: false,
        error: "shell requires a non-empty 'command' string",
        errorCode: "INTERNAL_ERROR",
      }
    }
    if (FORBIDDEN_COMMAND_PATTERNS.some((p) => p.test(input.command))) {
      return {
        ok: false,
        error: `Command not allowed: ${input.command}`,
        errorCode: "COMMAND_FORBIDDEN",
      }
    }
    if (!ctx.sandboxId) {
      return {
        ok: false,
        error: "Sandbox not available — cannot run commands.",
        errorCode: "SANDBOX_DEAD",
      }
    }
    try {
      const session = this.shellRegistry.forSandbox(ctx.sandboxId)
      const result = await session.exec(input.command, {
        timeoutMs: input.timeoutMs,
      })
      return {
        ok: true,
        data: {
          stdout: truncate(result.stdout),
          stderr: truncate(result.stderr),
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          cwd: session.getCwd(),
        },
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes("timeout")) {
        return { ok: false, error: msg, errorCode: "COMMAND_TIMEOUT" }
      }
      return { ok: false, error: msg, errorCode: "SANDBOX_DEAD" }
    }
  }

  private async searchCode(
    input: SearchCodeArgs,
    ctx: ToolExecutionContext,
  ): Promise<ToolOutput> {
    if (!ctx.sandboxId) {
      return {
        ok: false,
        error: "Sandbox not available — cannot run search_code.",
        errorCode: "SANDBOX_DEAD",
      }
    }
    try {
      // projectRoot omitted so the sandbox provider's default cwd applies.
      // In this codebase, project files live at the sandbox FS root: writeFile
      // uses `toPosix` to produce `/src/...`, `/app/...`, etc., and the e2b
      // provider already defaults `cwd` to "/". Letting the default flow
      // through keeps search_code aligned with the provider convention rather
      // than hard-coding a duplicate constant here.
      const result = await searchCode(input, {
        exec: (cmd, opts) => this.deps.sandbox.exec(ctx.sandboxId!, cmd, opts ?? {}),
      })
      return {
        ok: true,
        data: { formatted: formatMatches(result) },
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        errorCode: "INTERNAL_ERROR",
      }
    }
  }

  private async readRuntimeErrors(
    input: ReadRuntimeErrorsArgs,
  ): Promise<ToolOutput> {
    if (!this.deps.runtimeErrors) {
      return {
        ok: true,
        data: {
          formatted:
            "Runtime error capture is not configured for this project (Free tier). Upgrade to Pro/Team to enable preview-app error capture.",
          count: 0,
          consumed: [],
        },
      }
    }
    try {
      const result = await readRuntimeErrors(input ?? {}, this.deps.runtimeErrors)
      return {
        ok: true,
        data: {
          formatted: result.formatted,
          count: result.count,
          consumed: result.consumed,
        },
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        errorCode: "INTERNAL_ERROR",
      }
    }
  }

  private async findDefinitionTool(
    input: FindDefinitionArgs,
    ctx: ToolExecutionContext,
  ): Promise<ToolOutput> {
    if (!input || typeof input.symbol !== "string" || input.symbol.length === 0) {
      return {
        ok: false,
        error: "find_definition requires a non-empty 'symbol' string",
        errorCode: "INTERNAL_ERROR",
      }
    }
    if (!ctx.sandboxId) {
      return {
        ok: false,
        error: "Sandbox not available — cannot search code.",
        errorCode: "SANDBOX_DEAD",
      }
    }
    try {
      const result = await findDefinition(input, {
        exec: (cmd, opts) => this.deps.sandbox.exec(ctx.sandboxId!, cmd, opts ?? {}),
      })
      return {
        ok: true,
        data: {
          formatted: formatCodeNavMatches(result),
          matches: result.matches,
          truncated: result.truncated,
        },
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        errorCode: "INTERNAL_ERROR",
      }
    }
  }

  private async findReferencesTool(
    input: FindReferencesArgs,
    ctx: ToolExecutionContext,
  ): Promise<ToolOutput> {
    if (!input || typeof input.symbol !== "string" || input.symbol.length === 0) {
      return {
        ok: false,
        error: "find_references requires a non-empty 'symbol' string",
        errorCode: "INTERNAL_ERROR",
      }
    }
    if (!ctx.sandboxId) {
      return {
        ok: false,
        error: "Sandbox not available — cannot search code.",
        errorCode: "SANDBOX_DEAD",
      }
    }
    try {
      const result = await findReferences(input, {
        exec: (cmd, opts) => this.deps.sandbox.exec(ctx.sandboxId!, cmd, opts ?? {}),
      })
      return {
        ok: true,
        data: {
          formatted: formatCodeNavMatches(result),
          matches: result.matches,
          truncated: result.truncated,
        },
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        errorCode: "INTERNAL_ERROR",
      }
    }
  }

  private async webFetch(input: WebFetchArgs): Promise<ToolOutput> {
    if (!input || typeof input.url !== "string" || input.url.length === 0) {
      return {
        ok: false,
        error: "web_fetch requires a non-empty 'url' string",
        errorCode: "INTERNAL_ERROR",
      }
    }
    try {
      const result = await executeWebFetch(input, this.deps.webFetch ?? {})
      return {
        ok: true,
        data: {
          content: result.content,
          url: result.url,
          title: result.title,
          cached: result.cached,
          truncated: result.truncated,
          contentType: result.contentType,
        },
      }
    } catch (err) {
      if (err instanceof WebFetchError) {
        return {
          ok: false,
          error: `${err.code}: ${err.message}`,
          errorCode:
            err.code === "BLOCKED_HOST" || err.code === "DNS_FAILED"
              ? "NETWORK_BLOCKED"
              : err.code === "TIMEOUT"
                ? "COMMAND_TIMEOUT"
                : "NETWORK_ERROR",
        }
      }
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        errorCode: "INTERNAL_ERROR",
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Returns a SANDBOX_DEAD ToolOutput on failure, or undefined on success / no sandbox. */
  private async syncToSandbox(
    ctx: ToolExecutionContext,
    path: string,
    content: string,
  ): Promise<ToolOutput | undefined> {
    if (!ctx.sandboxId) return undefined
    try {
      await this.deps.sandbox.writeFile(ctx.sandboxId, path, content)
      return undefined
    } catch (err) {
      return {
        ok: false,
        error: `Sandbox write failed: ${(err as Error).message}`,
        errorCode: "SANDBOX_DEAD",
      }
    }
  }
}

// ── Helpers (free functions) ──────────────────────────────────────────────────

function locked(path: string): ToolOutput {
  return {
    ok: false,
    error: `Path is locked or not writable: ${path}. Writable directories: src/, app/, pages/, public/, components/, lib/, supabase/migrations/, styles/.`,
    errorCode: "PATH_LOCKED",
  }
}

function formatMatches(r: SearchCodeResult): string {
  const lines = r.matches.map((m) => `${m.path}:${m.line}: ${m.snippet}`)
  if (r.truncated) {
    lines.push(`... (truncated at ${r.matches.length})`)
  }
  return lines.join("\n")
}

function truncate(s: string): string {
  if (s.length <= OUTPUT_MAX_CHARS) return s
  return s.slice(0, OUTPUT_MAX_CHARS) + `\n[…truncated at ${OUTPUT_MAX_CHARS} chars]`
}

function classifyError(err: unknown): ToolErrorCode {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
  if (msg.includes("timeout")) return "COMMAND_TIMEOUT"
  if (msg.includes("sandbox")) return "SANDBOX_DEAD"
  if (msg.includes("not found")) return "PATH_NOT_FOUND"
  if (msg.includes("already exists")) return "PATH_ALREADY_EXISTS"
  return "INTERNAL_ERROR"
}

// ── Input shapes ──────────────────────────────────────────────────────────────

type ReadInput = { path: string }
type WriteInput = { path: string; content: string }
type EditInput = { path: string; search: string; replace: string }
type MultiEditInput = { path: string; edits: MultiEditEdit[] }
type RunInput = { command: string; cwd?: string }
