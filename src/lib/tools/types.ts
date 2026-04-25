/**
 * Tool layer type contracts. Authority: CONSTITUTION.md Article VIII (D-017 amended).
 *
 * Errors are *fed back to the model* as tool results, not thrown — see §8.2.
 */

export const TOOL_ERROR_CODES = [
  "PATH_LOCKED",
  "PATH_NOT_FOUND",
  "PATH_ALREADY_EXISTS",
  "PATH_NOT_WRITABLE",
  "EDIT_NOT_FOUND",
  "EDIT_NOT_UNIQUE",
  "SANDBOX_DEAD",
  "COMMAND_TIMEOUT",
  "COMMAND_NONZERO_EXIT",
  "COMMAND_FORBIDDEN",
  "INTERNAL_ERROR",
] as const

export type ToolErrorCode = (typeof TOOL_ERROR_CODES)[number]

export type ToolOutput =
  | { ok: true; data: unknown }
  | { ok: false; error: string; errorCode: ToolErrorCode }

export interface ToolExecutionContext {
  projectId: string
  sandboxId: string | null
  userId: string
}
