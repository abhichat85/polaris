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
import type { FileService } from "@/lib/files/types"
import type { SandboxProvider } from "@/lib/sandbox/types"
import type { ToolErrorCode, ToolExecutionContext, ToolOutput } from "./types"

export interface ToolExecutorDeps {
  files: FileService
  sandbox: SandboxProvider
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
  constructor(private readonly deps: ToolExecutorDeps) {}

  async execute(toolCall: ToolCall, ctx: ToolExecutionContext): Promise<ToolOutput> {
    try {
      // Layer 0: permission gate for mutating ops.
      if (MUTATING_TOOLS.has(toolCall.name)) {
        const path = (toolCall.input as { path?: unknown }).path
        if (typeof path !== "string" || !FilePermissionPolicy.canWrite(path)) {
          return locked(typeof path === "string" ? path : "<missing>")
        }
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
        case "search_code":
          return await this.searchCode(toolCall.input as SearchCodeArgs, ctx)
        default:
          return {
            ok: false,
            error: `Unknown tool: ${toolCall.name}`,
            errorCode: "INTERNAL_ERROR",
          }
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        errorCode: classifyError(err),
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
