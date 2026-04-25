/**
 * In-memory MockSandboxProvider. Authority: CONSTITUTION §16.5.
 *
 * Used for:
 *   - Unit-testing higher layers (ToolExecutor, AgentRunner) without E2B
 *   - Local development when no E2B API key is available
 *   - Smoke-testing the SandboxProvider contract itself
 *
 * Behavior intentionally mirrors the real provider (POSIX paths, exec returns
 * stdout/stderr/exitCode, isAlive is fast). Differences from a real sandbox:
 *   - No actual process execution: `exec` returns the result of `execHandler`
 *     (or zero exit/empty output by default)
 *   - No real network: `getPreviewUrl` returns a fake mock domain
 *   - Files live in a Map<path, content>
 */

import type {
  ExecOptions,
  ExecResult,
  SandboxHandle,
  SandboxOptions,
  SandboxProvider,
  SandboxTemplate,
} from "./types"

interface MockSandboxState {
  id: string
  createdAt: number
  template: SandboxTemplate
  files: Map<string, string>
  alive: boolean
  detached: Array<{ pid: number; cmd: string }>
  lastPid: number
}

export type MockExecHandler = (
  cmd: string,
  opts?: ExecOptions,
) => ExecResult | Promise<ExecResult>

export class MockSandboxProvider implements SandboxProvider {
  readonly name = "mock"
  readonly sandboxes = new Map<string, MockSandboxState>()
  private idCounter = 0

  /** Set this to override default `exec` behavior in tests. */
  execHandler: MockExecHandler | null = null

  async create(template: SandboxTemplate, _opts: SandboxOptions): Promise<SandboxHandle> {
    this.idCounter += 1
    const id = `mock-sbx-${this.idCounter}`
    const createdAt = Date.now()
    this.sandboxes.set(id, {
      id,
      createdAt,
      template,
      files: new Map(),
      alive: true,
      detached: [],
      lastPid: 0,
    })
    return { id, createdAt }
  }

  async writeFile(id: string, path: string, content: string): Promise<void> {
    const sbx = this.must(id)
    sbx.files.set(this.normalize(path), content)
  }

  async readFile(id: string, path: string): Promise<string> {
    const sbx = this.must(id)
    const v = sbx.files.get(this.normalize(path))
    if (v === undefined) throw new Error(`ENOENT: ${path}`)
    return v
  }

  async listFiles(id: string, dir: string): Promise<string[]> {
    const sbx = this.must(id)
    const prefix = this.normalize(dir).replace(/\/$/, "") + "/"
    const out: string[] = []
    for (const p of sbx.files.keys()) {
      if (p.startsWith(prefix) || prefix === "/") out.push(p)
    }
    return out
  }

  async deleteFile(id: string, path: string): Promise<void> {
    const sbx = this.must(id)
    if (!sbx.files.delete(this.normalize(path))) {
      throw new Error(`ENOENT: ${path}`)
    }
  }

  async exec(id: string, cmd: string, opts?: ExecOptions): Promise<ExecResult> {
    this.must(id)
    if (this.execHandler) return this.execHandler(cmd, opts)
    return { stdout: "", stderr: "", exitCode: 0, durationMs: 5 }
  }

  async execDetached(id: string, cmd: string): Promise<{ pid: number }> {
    const sbx = this.must(id)
    sbx.lastPid += 1
    sbx.detached.push({ pid: sbx.lastPid, cmd })
    return { pid: sbx.lastPid }
  }

  async getPreviewUrl(id: string, port: number): Promise<string> {
    this.must(id)
    return `https://${port}-${id}.mock.e2b.dev`
  }

  async isAlive(id: string): Promise<boolean> {
    return this.sandboxes.get(id)?.alive === true
  }

  async kill(id: string): Promise<void> {
    const sbx = this.sandboxes.get(id)
    if (sbx) sbx.alive = false
  }

  // ── Test helpers ───────────────────────────────────────────────────────────

  /** Simulate the sandbox dying out-of-band (timeout, infra failure). */
  killExternally(id: string): void {
    const sbx = this.sandboxes.get(id)
    if (sbx) sbx.alive = false
  }

  private must(id: string): MockSandboxState {
    const sbx = this.sandboxes.get(id)
    if (!sbx || !sbx.alive) throw new Error(`Sandbox ${id} is not alive`)
    return sbx
  }

  private normalize(p: string): string {
    return p.replace(/^\/+/, "").replace(/\\/g, "/")
  }
}
