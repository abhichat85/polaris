/**
 * search_code — ripgrep-backed text search across project files.
 * Authority: CONSTITUTION.md Article VIII (D-034). Pure function;
 * sandbox `exec` and project root injected as deps for testability.
 *
 * Behavior contract (D-034):
 *   - Plain-text by default; regex on opt-in.
 *   - Case-insensitive by default.
 *   - Optional path glob (e.g. "src/** /*.tsx").
 *   - maxResults clamped to [_, 500]; default 80.
 *   - rg exit 1 (no matches) is success — empty matches.
 *   - Other non-zero exits throw with stderr.
 *   - Snippets truncated to 200 chars per match.
 *   - truncated = true iff returned matches.length === clamped maxResults.
 */

export interface SearchCodeArgs {
  query: string
  pathGlob?: string
  regex?: boolean
  caseSensitive?: boolean
  maxResults?: number
}

export interface SearchCodeMatch {
  path: string
  line: number
  snippet: string
}

export interface SearchCodeResult {
  matches: SearchCodeMatch[]
  truncated: boolean
}

export interface SearchCodeDeps {
  exec: (
    cmd: string,
    opts?: { cwd?: string; timeoutMs?: number },
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>
  /**
   * Working directory for ripgrep. Optional — if omitted, the underlying
   * sandbox provider's default cwd applies (in the e2b provider, "/").
   */
  projectRoot?: string
}

const DEFAULT_MAX_RESULTS = 80
const HARD_MAX_RESULTS = 500
const SNIPPET_MAX_CHARS = 200
const EXEC_TIMEOUT_MS = 30_000

/** POSIX single-quote a string: 'foo' → 'foo'; 'fo'o' → 'fo'\''o'. */
function sq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

export async function searchCode(
  args: SearchCodeArgs,
  deps: SearchCodeDeps,
): Promise<SearchCodeResult> {
  const cap = Math.min(
    Math.max(1, args.maxResults ?? DEFAULT_MAX_RESULTS),
    HARD_MAX_RESULTS,
  )

  const flags: string[] = ["--line-number", "--color=never", "--no-heading", `--max-count=${cap}`]

  if (args.regex !== true) flags.push("--fixed-strings")
  if (args.caseSensitive !== true) flags.push("--ignore-case")
  if (args.pathGlob) flags.push(`--glob=${sq(args.pathGlob)}`)

  // Query as final positional arg, single-quoted with escapes.
  const cmd = `rg ${flags.join(" ")} -- ${sq(args.query)}`

  const execOpts: { cwd?: string; timeoutMs?: number } = { timeoutMs: EXEC_TIMEOUT_MS }
  if (deps.projectRoot !== undefined) execOpts.cwd = deps.projectRoot
  const result = await deps.exec(cmd, execOpts)

  // ripgrep: exit 0 = matches, exit 1 = no matches, exit 2+ = error.
  if (result.exitCode === 1) {
    return { matches: [], truncated: false }
  }
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`
    throw new Error(`ripgrep failed: ${detail}`)
  }

  const matches: SearchCodeMatch[] = []
  const lines = result.stdout.split("\n")
  for (const raw of lines) {
    if (matches.length >= cap) break
    if (!raw) continue
    // path:line:content — POSIX file paths theoretically allow ':' in the
    // name, but ripgrep's default output format makes the first two ':'-
    // separated segments path and line. Files with ':' in the name will be
    // silently dropped from results — acceptable since the user projects
    // searched here are web/Next.js codebases that don't use such names.
    const m = raw.match(/^([^:]+):(\d+):(.*)$/)
    if (!m) continue
    const [, path, lineStr, snippet] = m
    matches.push({
      path,
      line: Number(lineStr),
      snippet:
        snippet.length > SNIPPET_MAX_CHARS ? snippet.slice(0, SNIPPET_MAX_CHARS) : snippet,
    })
  }

  return { matches, truncated: matches.length === cap }
}
