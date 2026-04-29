/**
 * Contract<T> — the core agent-kit primitive.
 *
 * A Contract defines what an agent MUST do (constraints) and how to check
 * whether it did it. It has two consumers:
 *   1. System prompt builder calls `toPromptRequirements()` to inject constraint
 *      text the agent sees as instructions.
 *   2. Post-loop evaluator calls `evaluate(result)` to check compliance and
 *      produce a score + issues list for the healing loop.
 *
 * Contracts are constraint-based (NOT quota-based). For code agents:
 *   ✓ "must run tests after edits"
 *   ✓ "must not touch paths outside scope"
 *   ✗ "must find at least 3 issues" (quota — creates perverse incentives)
 *
 * The generic type T is the result shape the contract evaluates against.
 * E.g. for a code-change contract, T would include changedPaths, testsPassed, etc.
 */

export interface ContractConstraint {
  /** Machine-readable identifier, e.g. "must-run-tests-after-edit". */
  id: string
  /** Human-readable description for the system prompt. */
  description: string
  /** Severity: 'hard' constraints fail the eval; 'soft' lower the score but don't fail. */
  severity: "hard" | "soft"
}

export interface ContractEvalResult {
  /** Overall score 0–1. 1 = perfect compliance, 0 = total failure. */
  score: number
  /** Per-constraint pass/fail results. */
  constraintResults: ConstraintResult[]
  /** Human-readable issues for the healing prompt. */
  issues: string[]
  /** True if ALL hard constraints passed. */
  hardPass: boolean
}

export interface ConstraintResult {
  constraintId: string
  passed: boolean
  /** Optional detail message (e.g. "file src/foo.ts was touched but is outside scope"). */
  detail?: string
}

/**
 * Contract<T> — generic contract that evaluates a result of type T.
 */
export interface Contract<T> {
  /** Unique identifier for this contract type. */
  readonly id: string
  /** Human-readable name. */
  readonly name: string
  /** The constraints this contract enforces. */
  readonly constraints: readonly ContractConstraint[]

  /**
   * Generate the constraint text for the agent's system prompt.
   * The returned string is appended to the system prompt so the agent
   * knows what rules it must follow.
   */
  toPromptRequirements(): string

  /**
   * Evaluate a result against this contract's constraints.
   * Returns a score (0–1), per-constraint results, and human-readable issues
   * that can be fed to the healing loop.
   */
  evaluate(result: T): ContractEvalResult
}

/**
 * Helper to build a ContractEvalResult from individual constraint checks.
 * Computes score as: (passed constraints weighted by severity) / total weight.
 * Hard constraints have weight 3, soft have weight 1.
 */
export function buildEvalResult(
  constraintResults: ConstraintResult[],
  constraints: readonly ContractConstraint[],
): ContractEvalResult {
  const issues: string[] = []
  let totalWeight = 0
  let earnedWeight = 0
  let hardPass = true

  for (const cr of constraintResults) {
    const constraint = constraints.find((c) => c.id === cr.constraintId)
    if (!constraint) continue

    const weight = constraint.severity === "hard" ? 3 : 1
    totalWeight += weight

    if (cr.passed) {
      earnedWeight += weight
    } else {
      if (constraint.severity === "hard") hardPass = false
      issues.push(
        cr.detail
          ? `[${constraint.severity.toUpperCase()}] ${constraint.description}: ${cr.detail}`
          : `[${constraint.severity.toUpperCase()}] ${constraint.description}`,
      )
    }
  }

  const score = totalWeight > 0 ? earnedWeight / totalWeight : 1

  return { score, constraintResults, issues, hardPass }
}
