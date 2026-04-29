/**
 * ScaffoldContract — contract for initial project scaffolding tasks.
 *
 * Used on the first turn when the agent builds a project from a prompt.
 * More lenient than CodeChangeContract (no "scope" to violate, write_file
 * is expected for new files).
 */

import type { Contract, ContractConstraint, ContractEvalResult, ConstraintResult } from "../contract"
import { buildEvalResult } from "../contract"

export interface ScaffoldResult {
  /** Whether the generated project compiles (tsc). */
  tscPassed: boolean
  /** Whether the generated project builds (next build). */
  buildPassed: boolean
  /** Whether the agent created placeholder files. */
  hasPlaceholders: boolean
  /** Number of files created. */
  filesCreated: number
  /** Whether the agent set up routing (at least one page). */
  hasRouting: boolean
  /** Whether basic styling is present. */
  hasStyling: boolean
}

const CONSTRAINTS: ContractConstraint[] = [
  {
    id: "must-compile",
    description: "Generated project must compile without TypeScript errors",
    severity: "hard",
  },
  {
    id: "must-build",
    description: "Generated project must build successfully (next build)",
    severity: "hard",
  },
  {
    id: "must-not-leave-placeholders",
    description: "Must not leave placeholder code (TODO, FIXME, '...', 'implement me')",
    severity: "hard",
  },
  {
    id: "should-have-routing",
    description: "Should create at least one page/route",
    severity: "soft",
  },
  {
    id: "should-have-styling",
    description: "Should include basic styling (CSS/Tailwind classes)",
    severity: "soft",
  },
  {
    id: "should-create-multiple-files",
    description: "Should create a meaningful file structure (not everything in one file)",
    severity: "soft",
  },
]

export class ScaffoldContract implements Contract<ScaffoldResult> {
  readonly id = "scaffold"
  readonly name = "Scaffold Contract"
  readonly constraints = CONSTRAINTS

  toPromptRequirements(): string {
    return [
      "## Scaffold Constraints",
      "",
      "You are scaffolding a new project. Follow these rules:",
      "",
      ...CONSTRAINTS.map(
        (c) => `- **[${c.severity.toUpperCase()}]** ${c.description}`,
      ),
      "",
      "The project must be functional and buildable when you're done.",
    ].join("\n")
  }

  evaluate(result: ScaffoldResult): ContractEvalResult {
    const results: ConstraintResult[] = [
      {
        constraintId: "must-compile",
        passed: result.tscPassed,
        detail: result.tscPassed ? undefined : "TypeScript compilation failed",
      },
      {
        constraintId: "must-build",
        passed: result.buildPassed,
        detail: result.buildPassed ? undefined : "next build failed",
      },
      {
        constraintId: "must-not-leave-placeholders",
        passed: !result.hasPlaceholders,
        detail: result.hasPlaceholders
          ? "Placeholder code detected in generated files"
          : undefined,
      },
      {
        constraintId: "should-have-routing",
        passed: result.hasRouting,
        detail: result.hasRouting ? undefined : "No routes/pages were created",
      },
      {
        constraintId: "should-have-styling",
        passed: result.hasStyling,
        detail: result.hasStyling ? undefined : "No styling was applied",
      },
      {
        constraintId: "should-create-multiple-files",
        passed: result.filesCreated >= 3,
        detail:
          result.filesCreated < 3
            ? `Only ${result.filesCreated} file(s) created — consider splitting into components`
            : undefined,
      },
    ]

    return buildEvalResult(results, CONSTRAINTS)
  }
}
