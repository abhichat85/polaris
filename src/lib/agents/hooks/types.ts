/**
 * Hook system — D-055 / Phase 2.2.
 *
 * Hooks are user-defined endpoints (HTTP or Convex actions) called by
 * the agent harness at well-known lifecycle points: before each tool
 * call, after each tool call, on iteration start, on agent done.
 *
 * Use cases:
 *   - Compliance: deny tool calls that touch /migrations on production
 *   - Audit: log every shell command + its diff to an external SIEM
 *   - Custom validation: reject `multi_edit` that doesn't pass a custom linter
 *   - Workflow: notify Slack when an agent run completes
 *
 * Design principles:
 *   - Synchronous: hooks block the agent step until they respond, so
 *     decisions like "deny" can take effect before the tool runs
 *   - Bounded: hard 5s timeout per hook, fail-mode (open|closed) per hook
 *   - Idempotent: hooks must tolerate being called multiple times
 *   - Stateless: the harness sends all needed context in the payload;
 *     hooks do not maintain their own session state
 */

import type { ToolCall } from "../types"
import type { ToolOutput } from "@/lib/tools/types"

export type HookEvent =
  /** Fired BEFORE a tool call dispatches. May deny or modify input. */
  | "pre_tool_call"
  /** Fired AFTER a tool call returns. May modify output. */
  | "post_tool_call"
  /** Fired at the start of every agent iteration. Observability only. */
  | "iteration_start"
  /** Fired when the agent run terminates. Observability + workflow trigger. */
  | "agent_done"

export interface HookContext {
  /** Project the run belongs to. */
  projectId: string
  /** User who initiated the run. */
  userId: string
  /** Agent message id. */
  messageId: string
  /** Conversation id. */
  conversationId: string
  /** Iteration counter (0-based). */
  iteration: number
}

export interface PreToolCallPayload {
  event: "pre_tool_call"
  ctx: HookContext
  toolCall: ToolCall
}

export interface PostToolCallPayload {
  event: "post_tool_call"
  ctx: HookContext
  toolCall: ToolCall
  output: ToolOutput
}

export interface IterationStartPayload {
  event: "iteration_start"
  ctx: HookContext
}

export interface AgentDonePayload {
  event: "agent_done"
  ctx: HookContext
  status: "completed" | "error" | "cancelled"
  errorMessage?: string
}

export type HookPayload =
  | PreToolCallPayload
  | PostToolCallPayload
  | IterationStartPayload
  | AgentDonePayload

/* ─────────────────────────────────────────────────────────────────────────
 * Hook return contract
 *
 * { decision: "continue" }                    — proceed unchanged
 * { decision: "deny", reason: "..." }         — pre-only: abort the tool call
 * { decision: "modify", inputPatch: any }     — pre-only: edit toolCall.input
 * { decision: "transform_output",             — post-only: edit output
 *   outputPatch: ToolOutput }
 * ───────────────────────────────────────────────────────────────────── */

export type HookDecision =
  | { decision: "continue" }
  | { decision: "deny"; reason: string }
  | { decision: "modify"; inputPatch: Record<string, unknown> }
  | { decision: "transform_output"; outputPatch: ToolOutput }

export interface HookConfig {
  /** Stable id for the hook (used in audit logs). */
  id: string
  /** Which lifecycle event to fire on. */
  event: HookEvent
  /** Where to send the payload. */
  target:
    | { type: "http"; url: string; headers?: Record<string, string> }
    | { type: "function"; fn: (payload: HookPayload) => Promise<HookDecision> }
  /** Behaviour when the hook times out or returns an error. Default "open". */
  failMode?: "open" | "closed"
  /** Per-hook timeout in ms. Default 5000. */
  timeoutMs?: number
  /** When false, the hook is registered but not invoked. */
  enabled?: boolean
}

/** Hook timeout default. */
export const DEFAULT_HOOK_TIMEOUT_MS = 5_000
