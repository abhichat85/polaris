/**
 * Barrel for inline markdown components emitted by the agent.
 *
 * These components are designed to be wired into the markdown renderer
 * via the `components` map (e.g. react-markdown) so the agent can embed
 * structured UI in its assistant messages.
 */

export { DiffBlock, computeDiff } from "./diff-block"
export type { DiffBlockProps, DiffSegments } from "./diff-block"

export { TestResultsBlock } from "./test-results-block"
export type {
  TestResultsBlockProps,
  TestFailure,
} from "./test-results-block"

export { CoverageBlock } from "./coverage-block"
export type { CoverageBlockProps, CoverageFile } from "./coverage-block"

export { LintBlock } from "./lint-block"
export type {
  LintBlockProps,
  LintFinding,
  LintSeverity,
} from "./lint-block"
