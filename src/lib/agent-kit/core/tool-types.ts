/**
 * Tool layer type contracts for the agent-kit.
 *
 * Extracted from Polaris tool types. Errors are *fed back to the model*
 * as tool results, not thrown — see CONSTITUTION §8.2.
 */

import type { ToolCall } from "./types"

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

/**
 * Generic tool executor interface. Implementations dispatch a ToolCall
 * to the appropriate handler and return a structured ToolOutput.
 */
export interface IToolExecutor {
  execute(toolCall: ToolCall, ctx: ToolExecutionContext): Promise<ToolOutput>
}
