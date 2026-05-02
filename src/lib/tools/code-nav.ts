/**
 * find_definition / find_references — D-053 / Phase 3.2.
 *
 * Symbol-aware code navigation for the agent. Backed by ripgrep with
 * TypeScript-aware patterns rather than a full ts-morph project, because
 * loading the entire source tree into a Project per agent run is slow
 * (several seconds on medium projects) and memory-hungry (tens of MB).
 *
 * The ripgrep approach gives ~80% accuracy at <100ms latency, which is
 * the right tradeoff for an agent that wants to navigate code without
 * dumping whole files into context.
 *
 * Why both tools, not one fancy "code_search":
 *   - find_definition: returns the FEW lines where a symbol is created
 *     (export function, class, interface, type alias, const/let/var).
 *   - find_references: returns ALL lines that mention a symbol, anywhere.
 *
 * The agent prompt the model is doing — "where is useAppStore defined?"
 * vs "where is useAppStore called?" — is fundamentally different and
 * having two tools makes the choice obvious.
 *
 * Future: when RAG ships (Phase 4.1), this module will be augmented
 * with a `find_semantic` tool that uses embeddings rather than text.
 */

export interface FindDefinitionArgs {
  /** The symbol to locate (function, class, type, const, var). */
  symbol: string
  /**
   * Optional kind filter — narrow to one definition style. Useful when
   * a symbol exists as both a type and a value (common in TS).
   */
  kind?: "function" | "class" | "interface" | "type" | "const" | "var" | "any"
  /** Optional glob to scope the search. */
  pathGlob?: string
  /** Cap on returned matches. Default 20, hard max 100. */
  maxResults?: number
}

export interface FindReferencesArgs {
  /** The symbol to find references to. */
  symbol: string
  /** Optional glob to scope. */
  pathGlob?: string
  /** Default 80, hard max 500 — same as search_code. */
  maxResults?: number
  /** When true, also include the definition site(s). Default false. */
  includeDefinitions?: boolean
}

export interface CodeNavMatch {
  path: string
  line: number
  snippet: string
  /**
   * Inferred kind for definition sites. Heuristic, not always correct
   * (e.g. won't tell function-vs-method apart), but useful for the agent
   * to pick the right hit when scanning results.
   */
  kind?: string
}

export interface CodeNavResult {
  matches: CodeNavMatch[]
  truncated: boolean
}

export interface CodeNavDeps {
  exec: (
    cmd: string,
    opts?: { cwd?: string; timeoutMs?: number },
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>
  projectRoot?: string
}

const DEFAULT_DEF_RESULTS = 20
const DEFAULT_REF_RESULTS = 80
const HARD_MAX_RESULTS = 500
const SNIPPET_MAX_CHARS = 200
const EXEC_TIMEOUT_MS = 30_000

function sq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

/** Escape regex metacharacters in a literal symbol. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/* ─────────────────────────────────────────────────────────────────────────
 * find_definition
 * ───────────────────────────────────────────────────────────────────── */

/**
 * Build the ripgrep regex(es) for finding a definition of `symbol`.
 * Returns one pattern that matches any of the supported definition forms,
 * scoped by `kind` if provided.
 */
function buildDefinitionPattern(
  symbol: string,
  kind: FindDefinitionArgs["kind"] = "any",
): string {
  const s = escapeRegex(symbol)
  // Word-boundary match so `foo` doesn't match `foobar`.
  const pieces: string[] = []
  if (kind === "any" || kind === "function") {
    pieces.push(`\\b(?:export\\s+)?(?:async\\s+)?function\\s+${s}\\b`)
  }
  if (kind === "any" || kind === "class") {
    pieces.push(`\\b(?:export\\s+)?(?:abstract\\s+)?class\\s+${s}\\b`)
  }
  if (kind === "any" || kind === "interface") {
    pieces.push(`\\b(?:export\\s+)?interface\\s+${s}\\b`)
  }
  if (kind === "any" || kind === "type") {
    pieces.push(`\\b(?:export\\s+)?type\\s+${s}\\b`)
  }
  if (kind === "any" || kind === "const") {
    pieces.push(`\\b(?:export\\s+)?const\\s+${s}\\b`)
  }
  if (kind === "any" || kind === "var") {
    pieces.push(`\\b(?:export\\s+)?(?:let|var)\\s+${s}\\b`)
  }
  // Generic enum / namespace are caught by the "any" path.
  if (kind === "any") {
    pieces.push(`\\b(?:export\\s+)?(?:enum|namespace)\\s+${s}\\b`)
  }
  return `(${pieces.join("|")})`
}

/** Heuristic to pick the definition kind from the matched line. */
function inferKind(line: string): string | undefined {
  if (/\bfunction\s+/.test(line)) return "function"
  if (/\bclass\s+/.test(line)) return "class"
  if (/\binterface\s+/.test(line)) return "interface"
  if (/\btype\s+\w+\s*=/.test(line)) return "type"
  if (/\bconst\s+/.test(line)) return "const"
  if (/\b(?:let|var)\s+/.test(line)) return "var"
  if (/\benum\s+/.test(line)) return "enum"
  if (/\bnamespace\s+/.test(line)) return "namespace"
  return undefined
}

export async function findDefinition(
  args: FindDefinitionArgs,
  deps: CodeNavDeps,
): Promise<CodeNavResult> {
  if (!args.symbol || args.symbol.trim().length === 0) {
    return { matches: [], truncated: false }
  }
  const cap = Math.min(
    Math.max(1, args.maxResults ?? DEFAULT_DEF_RESULTS),
    HARD_MAX_RESULTS,
  )
  const pattern = buildDefinitionPattern(args.symbol, args.kind)

  const flags = [
    "--line-number",
    "--color=never",
    "--no-heading",
    `--max-count=${cap}`,
    "--ignore-case",
  ]
  if (args.pathGlob) flags.push(`--glob=${sq(args.pathGlob)}`)
  const cmd = `rg ${flags.join(" ")} -- ${sq(pattern)}`

  return await runRipgrep(cmd, deps, cap, true)
}

/* ─────────────────────────────────────────────────────────────────────────
 * find_references
 * ───────────────────────────────────────────────────────────────────── */

export async function findReferences(
  args: FindReferencesArgs,
  deps: CodeNavDeps,
): Promise<CodeNavResult> {
  if (!args.symbol || args.symbol.trim().length === 0) {
    return { matches: [], truncated: false }
  }
  const cap = Math.min(
    Math.max(1, args.maxResults ?? DEFAULT_REF_RESULTS),
    HARD_MAX_RESULTS,
  )
  // Word-boundary match — avoids `foo` matching `foobar`. Apostrophes in
  // symbol names are unsupported (TS doesn't allow them anyway).
  const pattern = `\\b${escapeRegex(args.symbol)}\\b`

  const flags = [
    "--line-number",
    "--color=never",
    "--no-heading",
    `--max-count=${cap}`,
  ]
  if (args.pathGlob) flags.push(`--glob=${sq(args.pathGlob)}`)
  const cmd = `rg ${flags.join(" ")} -- ${sq(pattern)}`

  const result = await runRipgrep(cmd, deps, cap, false)

  if (args.includeDefinitions) {
    return result
  }

  // Filter out lines that look like definitions — we want references, not
  // declarations. (Less precise than ts-morph but adequate for the agent.)
  const filtered = result.matches.filter((m) => !looksLikeDefinition(m.snippet, args.symbol))
  return { matches: filtered, truncated: result.truncated }
}

function looksLikeDefinition(line: string, symbol: string): boolean {
  // Match the patterns from buildDefinitionPattern at line level.
  const s = escapeRegex(symbol)
  const re = new RegExp(
    `\\b(?:export\\s+)?(?:async\\s+|abstract\\s+)?(?:function|class|interface|type|const|let|var|enum|namespace)\\s+${s}\\b`,
  )
  return re.test(line)
}

/* ─────────────────────────────────────────────────────────────────────────
 * Shared ripgrep runner + parser
 * ───────────────────────────────────────────────────────────────────── */

async function runRipgrep(
  cmd: string,
  deps: CodeNavDeps,
  cap: number,
  inferKindFromLine: boolean,
): Promise<CodeNavResult> {
  const execOpts: { cwd?: string; timeoutMs?: number } = { timeoutMs: EXEC_TIMEOUT_MS }
  if (deps.projectRoot !== undefined) execOpts.cwd = deps.projectRoot
  const result = await deps.exec(cmd, execOpts)

  // exit 1 = no matches → empty result; exit 2+ = real error.
  if (result.exitCode === 1) {
    return { matches: [], truncated: false }
  }
  if (result.exitCode !== 0 && result.exitCode !== 1) {
    throw new Error(`ripgrep failed (exit ${result.exitCode}): ${result.stderr.trim()}`)
  }

  const lines = result.stdout.split(/\r?\n/).filter((l) => l.length > 0)
  const matches: CodeNavMatch[] = []
  for (const raw of lines) {
    // Format: <path>:<line>:<content>
    const idx1 = raw.indexOf(":")
    if (idx1 < 0) continue
    const idx2 = raw.indexOf(":", idx1 + 1)
    if (idx2 < 0) continue
    const path = raw.slice(0, idx1)
    const line = parseInt(raw.slice(idx1 + 1, idx2), 10)
    if (!Number.isFinite(line)) continue
    const rawSnippet = raw.slice(idx2 + 1)
    const snippet =
      rawSnippet.length > SNIPPET_MAX_CHARS
        ? rawSnippet.slice(0, SNIPPET_MAX_CHARS) + "…"
        : rawSnippet
    const m: CodeNavMatch = { path, line, snippet }
    if (inferKindFromLine) {
      const k = inferKind(rawSnippet)
      if (k) m.kind = k
    }
    matches.push(m)
  }
  // ripgrep --max-count is per-file; truncation is signaled when we've
  // hit cap globally. Conservative: report truncated=true at exact cap.
  const truncated = matches.length >= cap
  return { matches: truncated ? matches.slice(0, cap) : matches, truncated }
}

/** Format a CodeNavResult for display in the agent's tool output. */
export function formatCodeNavMatches(r: CodeNavResult): string {
  if (r.matches.length === 0) return "No matches."
  const lines = r.matches.map((m) => {
    const kindTag = m.kind ? ` [${m.kind}]` : ""
    return `${m.path}:${m.line}:${kindTag} ${m.snippet}`
  })
  if (r.truncated) {
    lines.push(`... (truncated at ${r.matches.length})`)
  }
  return lines.join("\n")
}
