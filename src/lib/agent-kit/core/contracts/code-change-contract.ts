/**
 * CodeChangeContract — constraint-based contract for code-editing agent tasks.
 *
 * Enforces rules like:
 *   - Must not touch paths outside the declared scope
 *   - Must not leave placeholder/TODO code
 *   - Must run tests after edits (if tests exist)
 *   - Must not introduce TypeScript errors
 *   - Edits should be surgical (prefer edit_file over write_file)
 */

import type { Contract, ContractConstraint, ContractEvalResult, ConstraintResult } from "../contract"
import { buildEvalResult } from "../contract"

/** The result shape that CodeChangeContract evaluates against. */
export interface CodeChangeResult {
  /** Paths that were modified during the agent run. */
  changedPaths: string[]
  /** Paths the agent was scoped to modify (from the task/plan). */
  scopePaths: string[]
  /** Whether TypeScript compilation passed after edits. */
  tscPassed: boolean
  /** Whether ESLint passed after edits. */
  eslintPassed: boolean
  /** Whether the agent ran tests (and they passed). null = no tests exist. */
  testsPassed: boolean | null
  /** Whether the agent's edits contain placeholder/TODO markers. */
  hasPlaceholders: boolean
  /** Count of write_file (full rewrite) vs edit_file (surgical) tool calls. */
  writeFileCount: number
  editFileCount: number
}

const CONSTRAINTS: ContractConstraint[] = [
  {
    id: "must-not-touch-paths-outside-scope",
    description: "Must not modify files outside the declared scope",
    severity: "hard",
  },
  {
    id: "must-not-leave-placeholders",
    description: "Must not leave placeholder code (TODO, FIXME, '...', 'implement me')",
    severity: "hard",
  },
  {
    id: "must-pass-tsc",
    description: "Must not introduce TypeScript compilation errors",
    severity: "hard",
  },
  {
    id: "must-pass-eslint",
    description: "Must not introduce ESLint errors",
    severity: "soft",
  },
  {
    id: "should-run-tests",
    description: "Should run tests after making edits if tests exist",
    severity: "soft",
  },
  {
    id: "prefer-surgical-edits",
    description: "Prefer edit_file (surgical) over write_file (full rewrite) for existing files",
    severity: "soft",
  },
]

export class CodeChangeContract implements Contract<CodeChangeResult> {
  readonly id = "code-change"
  readonly name = "Code Change Contract"
  readonly constraints = CONSTRAINTS

  toPromptRequirements(): string {
    return [
      "## Code Change Constraints",
      "",
      "You MUST follow these rules when editing code:",
      "",
      ...CONSTRAINTS.map(
        (c) => `- **[${c.severity.toUpperCase()}]** ${c.description}`,
      ),
      "",
      "Hard constraints are non-negotiable. Soft constraints lower quality scores but don't fail the task.",
    ].join("\n")
  }

  evaluate(result: CodeChangeResult): ContractEvalResult {
    const results: ConstraintResult[] = []

    // Hard: scope check
    const outOfScope = result.changedPaths.filter(
      (p) => !result.scopePaths.some((sp) => p.startsWith(sp) || p === sp),
    )
    results.push({
      constraintId: "must-not-touch-paths-outside-scope",
      passed: outOfScope.length === 0,
      detail:
        outOfScope.length > 0
          ? `Out-of-scope files modified: ${outOfScope.join(", ")}`
          : undefined,
    })

    // Hard: no placeholders
    results.push({
      constraintId: "must-not-leave-placeholders",
      passed: !result.hasPlaceholders,
      detail: result.hasPlaceholders
        ? "Placeholder code detected in output"
        : undefined,
    })

    // Hard: tsc
    results.push({
      constraintId: "must-pass-tsc",
      passed: result.tscPassed,
      detail: result.tscPassed ? undefined : "TypeScript compilation failed",
    })

    // Soft: eslint
    results.push({
      constraintId: "must-pass-eslint",
      passed: result.eslintPassed,
      detail: result.eslintPassed ? undefined : "ESLint errors found",
    })

    // Soft: tests
    results.push({
      constraintId: "should-run-tests",
      passed: result.testsPassed !== false, // null (no tests) counts as pass
      detail:
        result.testsPassed === false ? "Tests failed after edits" : undefined,
    })

    // Soft: surgical edits
    const totalEdits = result.writeFileCount + result.editFileCount
    const surgicalRatio = totalEdits > 0 ? result.editFileCount / totalEdits : 1
    results.push({
      constraintId: "prefer-surgical-edits",
      passed: surgicalRatio >= 0.5, // at least half should be surgical
      detail:
        surgicalRatio < 0.5
          ? `Only ${Math.round(surgicalRatio * 100)}% of edits were surgical (${result.editFileCount}/${totalEdits})`
          : undefined,
    })

    return buildEvalResult(results, CONSTRAINTS)
  }
}
