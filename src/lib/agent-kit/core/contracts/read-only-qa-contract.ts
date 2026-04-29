/**
 * ReadOnlyQAContract — contract for read-only question-answering tasks.
 *
 * Used when the agent is asked to explain, analyze, or answer questions
 * without modifying code.
 */

import type { Contract, ContractConstraint, ContractEvalResult, ConstraintResult } from "../contract"
import { buildEvalResult } from "../contract"

export interface ReadOnlyQAResult {
  /** Whether the agent attempted any write/edit/create/delete tool calls. */
  attemptedWrites: boolean
  /** Whether the agent's response addressed the user's question. */
  addressedQuestion: boolean
  /** Whether the agent cited specific file paths / line numbers. */
  citedSources: boolean
}

const CONSTRAINTS: ContractConstraint[] = [
  {
    id: "must-not-mutate",
    description: "Must not modify, create, or delete any files",
    severity: "hard",
  },
  {
    id: "must-address-question",
    description: "Must directly address the user's question",
    severity: "hard",
  },
  {
    id: "should-cite-sources",
    description: "Should cite specific file paths and line numbers when referencing code",
    severity: "soft",
  },
]

export class ReadOnlyQAContract implements Contract<ReadOnlyQAResult> {
  readonly id = "read-only-qa"
  readonly name = "Read-Only Q&A Contract"
  readonly constraints = CONSTRAINTS

  toPromptRequirements(): string {
    return [
      "## Read-Only Q&A Constraints",
      "",
      "This is a READ-ONLY task. You must answer the question without modifying any files.",
      "",
      ...CONSTRAINTS.map(
        (c) => `- **[${c.severity.toUpperCase()}]** ${c.description}`,
      ),
    ].join("\n")
  }

  evaluate(result: ReadOnlyQAResult): ContractEvalResult {
    const results: ConstraintResult[] = [
      {
        constraintId: "must-not-mutate",
        passed: !result.attemptedWrites,
        detail: result.attemptedWrites
          ? "Agent attempted to modify files during a read-only task"
          : undefined,
      },
      {
        constraintId: "must-address-question",
        passed: result.addressedQuestion,
        detail: result.addressedQuestion
          ? undefined
          : "Response did not address the user's question",
      },
      {
        constraintId: "should-cite-sources",
        passed: result.citedSources,
        detail: result.citedSources
          ? undefined
          : "Response did not cite specific file paths or line numbers",
      },
    ]

    return buildEvalResult(results, CONSTRAINTS)
  }
}
