/**
 * Verifier — runs tsc + eslint against agent-changed paths and returns
 * formatted errors for injection back into the agent loop.
 *
 * Pure function: deps-injected exec for testability. The agent loop
 * (agent-loop.ts) wires the real sandbox.exec. Tests pass a vi.fn().
 *
 * Authority: D-036 — verification loop between agent turns.
 */

export type VerifyStage = "tsc" | "eslint"

export interface VerifyResult {
  ok: boolean
  /** Present iff ok=false. Formatted text suitable for direct injection. */
  errors?: string
  /** Which stage flagged the issue. Present iff ok=false. */
  stage?: VerifyStage
}

export interface VerifyDeps {
  exec: (
    cmd: string,
    opts?: { cwd?: string; timeoutMs?: number },
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>
}

const TSC_TIMEOUT_MS = 60_000
const ESLINT_TIMEOUT_MS = 60_000
const TSC_MAX_LINES = 100
const ESLINT_MAX_LINES = 200

export async function verify(
  changedPaths: ReadonlySet<string>,
  deps: VerifyDeps,
): Promise<VerifyResult> {
  // Skip if nothing to verify (defensive — caller usually checks).
  if (changedPaths.size === 0) return { ok: true }

  // Stage 1 — tsc --noEmit, project-wide. Filter output to lines that
  // start with one of the changed paths so we ignore pre-existing
  // errors in untouched files.
  const tsRes = await deps.exec(
    "npx --no-install tsc --noEmit --pretty false",
    { timeoutMs: TSC_TIMEOUT_MS },
  )
  // tsc exits non-zero when there are errors; we don't fail on exec exit
  // code alone — we want to inspect stdout for the changed paths.
  if (tsRes.exitCode !== 0) {
    const filtered = filterTscOutput(tsRes.stdout, changedPaths, TSC_MAX_LINES)
    if (filtered.length > 0) {
      return { ok: false, errors: filtered, stage: "tsc" }
    }
    // Exit non-zero but no errors in changed paths — pre-existing
    // errors elsewhere. Continue to eslint.
  }

  // Stage 2 — eslint on changed TS/TSX/JS/JSX files only.
  const lintable = [...changedPaths].filter((p) =>
    /\.(tsx|ts|jsx|js)$/.test(p),
  )
  if (lintable.length === 0) return { ok: true }

  const args = lintable.map(shellQuote).join(" ")
  const lintRes = await deps.exec(
    `npx --no-install eslint --quiet --no-error-on-unmatched-pattern ${args}`,
    { timeoutMs: ESLINT_TIMEOUT_MS },
  )
  if (lintRes.exitCode !== 0) {
    const trimmed = trimLines(lintRes.stdout, ESLINT_MAX_LINES)
    return { ok: false, errors: trimmed, stage: "eslint" }
  }

  return { ok: true }
}

function filterTscOutput(
  raw: string,
  changedPaths: ReadonlySet<string>,
  maxLines: number,
): string {
  // tsc lines look like:
  //   src/app/page.tsx(12,5): error TS2345: ...
  // Filter to lines whose path prefix matches a changed path.
  const matched: string[] = []
  for (const line of raw.split("\n")) {
    const m = line.match(/^([^(]+)\(\d+,\d+\):/)
    if (!m) continue
    const path = m[1].trim()
    if (changedPaths.has(path)) matched.push(line)
    if (matched.length >= maxLines) break
  }
  return matched.join("\n")
}

function trimLines(raw: string, maxLines: number): string {
  const lines = raw.split("\n")
  if (lines.length <= maxLines) return raw
  return (
    lines.slice(0, maxLines).join("\n") + `\n[…truncated at ${maxLines} lines]`
  )
}

function shellQuote(p: string): string {
  return `'${p.replace(/'/g, "'\\''")}'`
}
