/**
 * D-031 — per-template lint interface.
 *
 * Authority: OpenAI Harness Engineering — "we write the error messages
 * to inject remediation instructions into agent context."
 *
 * Each Lint inspects a single file against a per-template invariant.
 * When it fails, it returns a `LintResult` with both a human-readable
 * message AND a remediation paragraph that the Evaluator/Generator
 * loop will inject verbatim into the next agent turn.
 *
 * Lints are bundled per template (Next.js / Vite / Flask / etc) so we
 * don't apply React-specific rules to a Python project.
 */

export type LintSeverity = "error" | "warning"

export interface FileForLint {
  path: string
  content: string
}

export interface LintResult {
  severity: LintSeverity
  /** Path of the offending file (for the Evaluator to surface). */
  path: string
  /** Lint id — kebab-case, stable across versions. */
  lintId: string
  /** Brief human-readable description of what's wrong. */
  message: string
  /**
   * Concrete remediation. Written in the imperative voice — "move the
   * fetch into a route handler" — because this string is injected into
   * the agent's next turn as part of the eval feedback loop.
   */
  remediation: string
}

export interface Lint {
  id: string
  description: string
  /** Returns true when the lint should be considered for this file path. */
  appliesTo(path: string): boolean
  /** Run the lint. Return null when the file passes. */
  check(file: FileForLint): LintResult | null
}

/**
 * Run a bundle of lints against a list of files. Returns flat array of
 * results. The Evaluator passes this through to the Generator on
 * RETURN-FOR-FIX verdicts.
 */
export function runLints(lints: Lint[], files: FileForLint[]): LintResult[] {
  const out: LintResult[] = []
  for (const lint of lints) {
    for (const file of files) {
      if (!lint.appliesTo(file.path)) continue
      const r = lint.check(file)
      if (r) out.push(r)
    }
  }
  return out
}
