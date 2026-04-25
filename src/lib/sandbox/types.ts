/**
 * SandboxProvider — the abstraction between Polaris and any cloud sandbox.
 * Authority: CONSTITUTION §6.2. Adding/removing methods requires amendment.
 *
 * Implementation rules (§6.2):
 *  1. Provider-agnostic. No method references E2B/Northflank/etc.
 *  2. All paths are POSIX-style ("/", not "\\").
 *  3. writeFile creates parent directories as needed.
 *  4. exec is synchronous; execDetached is for long-running processes.
 *  5. getPreviewUrl returns an immediately-reachable URL.
 *  6. isAlive is fast (<500ms). Used on every project open.
 *  7. The provider never reads or writes Convex.
 *  8. Adding a new provider is one file plus configuration.
 */

export type SandboxTemplate = "nextjs-supabase" | "nextjs" | "node" | "python"

export interface SandboxOptions {
  /** Sandbox lifetime in ms. Default 24h. */
  timeoutMs?: number
  /** Memory budget. Default "512mb". */
  ram?: "512mb" | "2gb" | "8gb"
  /** Tags for observability. */
  metadata?: Record<string, string>
}

export interface SandboxHandle {
  id: string
  createdAt: number
}

export interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number
  durationMs: number
}

export interface ExecOptions {
  cwd?: string
  timeoutMs?: number
}

export interface SandboxProvider {
  readonly name: string

  create(template: SandboxTemplate, opts: SandboxOptions): Promise<SandboxHandle>

  writeFile(id: string, path: string, content: string): Promise<void>
  readFile(id: string, path: string): Promise<string>
  listFiles(id: string, dir: string): Promise<string[]>
  deleteFile(id: string, path: string): Promise<void>

  exec(id: string, cmd: string, opts?: ExecOptions): Promise<ExecResult>

  /** Long-running command (e.g. `npm run dev`). Returns immediately. */
  execDetached(id: string, cmd: string, opts?: { cwd?: string }): Promise<{ pid: number }>

  /** Public URL for a port inside the sandbox. */
  getPreviewUrl(id: string, port: number): Promise<string>

  isAlive(id: string): Promise<boolean>
  kill(id: string): Promise<void>
}
