/**
 * ShellSession — D-051 / Phase 1.1.
 *
 * Stateful wrapper around the SandboxProvider's stateless `exec` that
 * preserves working directory across calls. The agent's `shell` tool
 * uses one ShellSession per sandbox, so a sequence like:
 *
 *     shell("cd packages/web")
 *     shell("pnpm install")
 *     shell("pnpm test")
 *
 * runs each command in the right directory without the agent re-`cd`ing
 * every call. Without this, every `exec` starts at the sandbox root —
 * a major source of wasted tokens (the agent prefixes `cd` to every
 * command) and broken builds (forgetting to cd → wrong package.json).
 *
 * Implementation: each command is wrapped in a small bash preamble that
 * sets the session's CWD, runs the user command, and echoes the final
 * CWD via a unique sentinel. The wrapper parses the sentinel to update
 * its tracked CWD, then strips the sentinel from stdout so the model
 * sees only the user-visible output.
 *
 * Environment-variable persistence is intentionally NOT modeled in v1.
 * Inline (`FOO=bar npm run x`) handles 95% of cases; tracking exports
 * across calls would require parsing `set` diffs which is brittle. v2
 * may upgrade to a true PTY-backed persistent bash via E2B's pty API.
 *
 * Risk: if the user-command output happens to contain the sentinel,
 * parsing breaks. Mitigation: sentinels are 22-byte random tokens,
 * making collision astronomically unlikely.
 */

import { randomBytes } from "node:crypto"
import type { ExecResult, SandboxProvider } from "../sandbox/types"

/** Default working directory for a fresh ShellSession. */
export const DEFAULT_CWD = "/"

/** Default per-command timeout, matched to the run_command default. */
const DEFAULT_TIMEOUT_MS = 60_000

export interface ShellSessionOptions {
  /** Initial cwd. Defaults to "/". */
  initialCwd?: string
  /** Test seam: deterministic marker generator. */
  generateMarker?: () => string
}

export interface ShellExecOptions {
  /** Per-command timeout. Defaults to 60s, matching run_command. */
  timeoutMs?: number
}

export class ShellSession {
  private cwd: string
  private readonly generateMarker: () => string

  constructor(
    private readonly sandbox: SandboxProvider,
    private readonly sandboxId: string,
    opts: ShellSessionOptions = {},
  ) {
    this.cwd = opts.initialCwd ?? DEFAULT_CWD
    this.generateMarker = opts.generateMarker ?? defaultMarkerGenerator
  }

  /** Current cwd as tracked by the session — useful for tests + diagnostics. */
  getCwd(): string {
    return this.cwd
  }

  /** Reset session state (cwd, etc.) — does not touch the sandbox. */
  reset(initialCwd: string = DEFAULT_CWD): void {
    this.cwd = initialCwd
  }

  /**
   * Execute a command with the session's tracked state.
   * Returns the same ExecResult shape as SandboxProvider.exec, with the
   * sentinel line stripped from stdout. cwd is updated only if the
   * sentinel is recovered (a malformed/aborted session leaves cwd intact).
   */
  async exec(command: string, opts: ShellExecOptions = {}): Promise<ExecResult> {
    if (typeof command !== "string" || command.trim().length === 0) {
      throw new Error("ShellSession.exec: command must be a non-empty string")
    }
    const marker = this.generateMarker()
    const wrapped = wrapCommand(this.cwd, command, marker)

    const result = await this.sandbox.exec(this.sandboxId, wrapped, {
      timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    })

    return this.parseAndUpdate(result, marker)
  }

  private parseAndUpdate(result: ExecResult, marker: string): ExecResult {
    // The sentinel line looks like:  __POLARIS_<marker>__:CWD:<path>
    const re = new RegExp(`^__POLARIS_${escapeRegex(marker)}__:CWD:(.*)$`, "m")
    const match = result.stdout.match(re)
    let newCwd: string | null = null
    if (match) {
      newCwd = match[1].trim()
      if (newCwd) this.cwd = newCwd
    }
    // Strip the sentinel line + any trailing blank from stdout.
    const cleanedStdout = result.stdout
      .replace(re, "")
      .replace(/\n{2,}$/, "\n")
      .replace(/\n$/, "")
    return { ...result, stdout: cleanedStdout }
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * ShellSessionRegistry — manages one session per sandbox in the executor.
 * Lazy-instantiates on first call; disposes on agent-run completion.
 * ───────────────────────────────────────────────────────────────────── */

export class ShellSessionRegistry {
  private readonly sessions = new Map<string, ShellSession>()

  constructor(private readonly sandbox: SandboxProvider) {}

  forSandbox(sandboxId: string, initialCwd?: string): ShellSession {
    let session = this.sessions.get(sandboxId)
    if (!session) {
      session = new ShellSession(this.sandbox, sandboxId, { initialCwd })
      this.sessions.set(sandboxId, session)
    }
    return session
  }

  dispose(sandboxId: string): void {
    this.sessions.delete(sandboxId)
  }

  disposeAll(): void {
    this.sessions.clear()
  }

  /** Visible for tests. */
  size(): number {
    return this.sessions.size
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * Internals
 * ───────────────────────────────────────────────────────────────────── */

function defaultMarkerGenerator(): string {
  // 16 random bytes → 22 base64url chars; effectively impossible collision.
  return randomBytes(16).toString("base64url")
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Build the wrapped bash command. `cd` is run first to set context; if
 * it fails (e.g. directory deleted), the user command runs from wherever
 * bash defaults to and the sentinel still emits the resulting cwd. The
 * user's exit code is preserved.
 *
 * Single-quoted strings are tricky: we escape them by closing-quote /
 * escaped-quote / re-open-quote ('"'"'). Commands containing `$` or
 * backticks pass through unchanged because we run them inside `bash -c`
 * with the user content as its own quoted argument is hard — we use
 * a heredoc-style approach via stdin redirection instead.
 *
 * Simpler reliable form: emit a multi-line bash script. The final exit
 * is `exit $rc` so the caller's exitCode reflects the user's command.
 */
function wrapCommand(cwd: string, command: string, marker: string): string {
  // Embed the user command verbatim — a literal block is safer than
  // attempting nested quoting. We use a here-doc-free multi-line script:
  // the cwd is single-quoted (escape any single-quote in cwd).
  const safeCwd = cwd.replace(/'/g, "'\\''")
  // Put user command on its own line; bash treats newlines as separators,
  // so internal quoting/escaping in `command` is preserved.
  return [
    `cd '${safeCwd}' 2>/dev/null || true`,
    command,
    "__polaris_rc=$?",
    `echo "__POLARIS_${marker}__:CWD:$(pwd)"`,
    "exit $__polaris_rc",
  ].join("\n")
}
