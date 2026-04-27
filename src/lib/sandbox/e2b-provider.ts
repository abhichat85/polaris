/**
 * E2BSandboxProvider — concrete `SandboxProvider` against `@e2b/code-interpreter`.
 * Authority: CONSTITUTION §6.2 (interface), §6.3 (only ever instantiated by the
 * singleton in `src/lib/sandbox/index.ts`).
 *
 * Translation rules:
 *  - All paths flowing IN are normalized to leading-slash POSIX (rule 2).
 *  - `writeFile` relies on E2B implicitly creating parents (rule 3).
 *  - Sandbox-level errors (expired/not-found) become `SandboxDeadError` so the
 *    lifecycle layer can flag `sandboxNeedsResync` and reprovision.
 */

import { Sandbox } from "@e2b/code-interpreter"
import type {
  ExecOptions,
  ExecResult,
  SandboxHandle,
  SandboxOptions,
  SandboxProvider,
  SandboxTemplate,
} from "./types"
import { toPosix } from "./path-utils"

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000
const DEFAULT_EXEC_TIMEOUT_MS = 60_000

export class SandboxDeadError extends Error {
  override readonly name = "SandboxDeadError"
  constructor(message: string, readonly cause?: unknown) {
    super(message)
  }
}

export interface E2BProviderConfig {
  apiKey: string
}

interface E2BSandboxLike {
  sandboxId: string
  files: {
    write(path: string, content: string): Promise<void>
    read(path: string): Promise<string>
    list(path: string): Promise<Array<{ name: string; path: string; type: "file" | "dir" }>>
    remove(path: string): Promise<void>
  }
  commands: {
    run(
      cmd: string,
      opts?: { cwd?: string; timeoutMs?: number; background?: boolean },
    ): Promise<{ stdout?: string; stderr?: string; exitCode?: number; pid?: number }>
  }
  getHost(port: number): string
  kill(): Promise<void>
  isRunning?(): Promise<boolean>
}

function isSandboxNotFound(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /not found|expired|terminated|404/i.test(msg)
}

export class E2BSandboxProvider implements SandboxProvider {
  readonly name = "e2b"
  private readonly apiKey: string

  constructor(cfg: E2BProviderConfig) {
    if (!cfg.apiKey) throw new Error("E2BSandboxProvider requires apiKey")
    this.apiKey = cfg.apiKey
  }

  async create(template: SandboxTemplate, opts: SandboxOptions): Promise<SandboxHandle> {
    const t0 = Date.now()
    const sbx = (await Sandbox.create(template, {
      apiKey: this.apiKey,
      timeoutMs: opts.timeoutMs ?? TWENTY_FOUR_HOURS_MS,
      // RAM is template-defined in E2B; we surface it via metadata for ops
      // visibility rather than failing silently when it's set.
      metadata: { ...(opts.metadata ?? {}), ...(opts.ram ? { ram: opts.ram } : {}) },
    } as unknown as Parameters<typeof Sandbox.create>[1])) as unknown as E2BSandboxLike
    return { id: sbx.sandboxId, createdAt: t0 }
  }

  private async connect(id: string): Promise<E2BSandboxLike> {
    try {
      return (await Sandbox.connect(id, {
        apiKey: this.apiKey,
      } as unknown as Parameters<typeof Sandbox.connect>[1])) as unknown as E2BSandboxLike
    } catch (err) {
      throw new SandboxDeadError(
        `Sandbox ${id} unreachable: ${(err as Error).message}`,
        err,
      )
    }
  }

  async writeFile(id: string, path: string, content: string): Promise<void> {
    const sbx = await this.connect(id)
    try {
      await sbx.files.write(toPosix(path), content)
    } catch (err) {
      if (isSandboxNotFound(err)) {
        throw new SandboxDeadError(
          `writeFile failed: ${(err as Error).message}`,
          err,
        )
      }
      throw err
    }
  }

  async readFile(id: string, path: string): Promise<string> {
    const sbx = await this.connect(id)
    return await sbx.files.read(toPosix(path))
  }

  async listFiles(id: string, dir: string): Promise<string[]> {
    const sbx = await this.connect(id)
    const entries = await sbx.files.list(toPosix(dir))
    return entries.map((e) => e.path)
  }

  async deleteFile(id: string, path: string): Promise<void> {
    const sbx = await this.connect(id)
    try {
      await sbx.files.remove(toPosix(path))
    } catch (err) {
      if (isSandboxNotFound(err)) {
        throw new SandboxDeadError(
          `deleteFile failed: ${(err as Error).message}`,
          err,
        )
      }
      throw err
    }
  }

  async exec(id: string, cmd: string, opts: ExecOptions = {}): Promise<ExecResult> {
    const sbx = await this.connect(id)
    const t0 = Date.now()
    // D-018 — pass per-line stream handlers to the E2B SDK so the chat UI
    // can render stdout/stderr live via the toolCall.stream array.
    const r = await sbx.commands.run(cmd, {
      cwd: opts.cwd ?? "/",
      timeoutMs: opts.timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS,
      ...(opts.onStdout && { onStdout: opts.onStdout }),
      ...(opts.onStderr && { onStderr: opts.onStderr }),
    })
    return {
      stdout: r.stdout ?? "",
      stderr: r.stderr ?? "",
      exitCode: r.exitCode ?? 0,
      durationMs: Date.now() - t0,
    }
  }

  async execDetached(
    id: string,
    cmd: string,
    opts: { cwd?: string } = {},
  ): Promise<{ pid: number }> {
    const sbx = await this.connect(id)
    const r = await sbx.commands.run(cmd, {
      cwd: opts.cwd ?? "/",
      background: true,
    })
    if (typeof r.pid !== "number") {
      throw new Error("execDetached: provider did not return a pid")
    }
    return { pid: r.pid }
  }

  async getPreviewUrl(id: string, port: number): Promise<string> {
    const sbx = await this.connect(id)
    const host = sbx.getHost(port)
    return `https://${host}`
  }

  async isAlive(id: string): Promise<boolean> {
    try {
      const sbx = await this.connect(id)
      if (typeof sbx.isRunning === "function") {
        return await sbx.isRunning()
      }
      return true
    } catch {
      return false
    }
  }

  async kill(id: string): Promise<void> {
    const sbx = await this.connect(id)
    await sbx.kill()
  }
}
