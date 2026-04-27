/**
 * Patterns the agent may NEVER execute via `run_command`.
 * Authority: CONSTITUTION §8.4, §13. Adding a pattern is allowed; removing
 * one requires a constitutional amendment.
 *
 * The canonical source-of-truth list lives in `src/lib/tools/definitions.ts`
 * (used by the modern `ToolExecutor`). This module re-exports it so the
 * legacy `code-agent.ts` path applies the same policy. Eval suite verifies
 * both paths reject the same set (no divergence allowed).
 */

import { FORBIDDEN_COMMAND_PATTERNS as CANONICAL } from "@/lib/tools/definitions"

export const FORBIDDEN_COMMAND_PATTERNS: readonly RegExp[] = CANONICAL

export function isForbiddenCommand(cmd: string): boolean {
  return FORBIDDEN_COMMAND_PATTERNS.some((re) => re.test(cmd))
}
