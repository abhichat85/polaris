/**
 * HITLGate — Human-in-the-Loop checkpoint state machine.
 *
 * When the agent encounters a high-risk operation (destructive tool,
 * out-of-scope path, scope creep), it pauses and creates a HITL
 * checkpoint. The user can APPROVE, REJECT, or MODIFY the proposed
 * action. The agent then continues or stops based on the decision.
 *
 * State machine:
 *   PENDING → APPROVED | REJECTED | MODIFIED | TIMED_OUT | EXPIRED
 *
 * Persisted in the `hitl_checkpoints` Convex table (not in memory)
 * so the gate survives Inngest retries and server restarts.
 *
 * Code-specific triggers (NOT LOC-based like Praxiom):
 *   - Path-based: agent wants to touch a sensitive path
 *   - Scope-creep: agent wants to modify files outside declared scope
 *   - Destructive-tool: agent wants to delete files or run dangerous commands
 */

/** HITL checkpoint states. */
export type HitlStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "MODIFIED"
  | "EXPIRED"
  | "TIMED_OUT"

/** What triggered this HITL checkpoint. */
export type HitlTriggerType =
  | "destructive-tool"    // delete_file, dangerous run_command
  | "sensitive-path"      // touches config, env, CI files
  | "scope-creep"         // modifying files outside declared scope
  | "manual"              // user explicitly requested approval

export interface HitlTrigger {
  type: HitlTriggerType
  /** Human-readable reason for the checkpoint. */
  reason: string
  /** The tool call that triggered the checkpoint (if applicable). */
  toolName?: string
  /** The path involved (if applicable). */
  path?: string
}

export interface HitlCheckpoint {
  /** Unique checkpoint identifier. */
  id: string
  /** Run identifier (messageId). */
  runId: string
  /** Project identifier. */
  projectId: string
  /** Current status. */
  status: HitlStatus
  /** What triggered this checkpoint. */
  trigger: HitlTrigger
  /** The proposed action (serialized tool call or description). */
  proposedAction: string
  /** User's modification (only present if status === "MODIFIED"). */
  modification?: string
  /** When the checkpoint was created (epoch ms). */
  createdAt: number
  /** When the checkpoint was resolved (epoch ms). null if still pending. */
  resolvedAt: number | null
  /** Timeout duration in ms. After this, status transitions to TIMED_OUT. */
  timeoutMs: number
}

/** Default timeout for HITL checkpoints (5 minutes). */
export const DEFAULT_HITL_TIMEOUT_MS = 5 * 60_000

/**
 * Create a new HITL checkpoint in PENDING state.
 */
export function createCheckpoint(
  id: string,
  runId: string,
  projectId: string,
  trigger: HitlTrigger,
  proposedAction: string,
  timeoutMs: number = DEFAULT_HITL_TIMEOUT_MS,
): HitlCheckpoint {
  return {
    id,
    runId,
    projectId,
    status: "PENDING",
    trigger,
    proposedAction,
    createdAt: Date.now(),
    resolvedAt: null,
    timeoutMs,
  }
}

/**
 * Resolve a checkpoint to a terminal state.
 * Returns a new checkpoint (immutable).
 * Throws if the checkpoint is not in PENDING state.
 */
export function resolveCheckpoint(
  checkpoint: HitlCheckpoint,
  resolution: "APPROVED" | "REJECTED" | "MODIFIED",
  modification?: string,
): HitlCheckpoint {
  if (checkpoint.status !== "PENDING") {
    throw new Error(
      `Cannot resolve checkpoint ${checkpoint.id}: current status is ${checkpoint.status}, expected PENDING`,
    )
  }
  if (resolution === "MODIFIED" && !modification) {
    throw new Error(
      `Cannot resolve checkpoint ${checkpoint.id} as MODIFIED without a modification`,
    )
  }
  return {
    ...checkpoint,
    status: resolution,
    modification: resolution === "MODIFIED" ? modification : undefined,
    resolvedAt: Date.now(),
  }
}

/**
 * Check if a checkpoint has timed out. If it has, returns a new
 * checkpoint with TIMED_OUT status.
 */
export function checkTimeout(
  checkpoint: HitlCheckpoint,
  now: number = Date.now(),
): HitlCheckpoint {
  if (checkpoint.status !== "PENDING") return checkpoint
  if (now - checkpoint.createdAt >= checkpoint.timeoutMs) {
    return {
      ...checkpoint,
      status: "TIMED_OUT",
      resolvedAt: now,
    }
  }
  return checkpoint
}

/**
 * Check if a checkpoint is in a terminal state (resolved or timed out).
 */
export function isTerminal(checkpoint: HitlCheckpoint): boolean {
  return checkpoint.status !== "PENDING"
}

// ── Code-specific HITL triggers ──────────────────────────────────────────

/** Paths that are sensitive and require HITL approval. */
const SENSITIVE_PATHS = [
  /^\.env/,                    // environment files
  /^\.github\//,               // CI/CD
  /package\.json$/,            // dependencies
  /package-lock\.json$/,
  /tsconfig\.json$/,           // TypeScript config
  /next\.config\./,            // Next.js config
  /tailwind\.config\./,        // Tailwind config
  /\.gitignore$/,
  /convex\/schema\.ts$/,       // Database schema
  /convex\/_generated\//,      // Generated Convex code
]

/** Tool names that are destructive and require HITL approval. */
const DESTRUCTIVE_TOOLS = new Set([
  "delete_file",
])

/** Command patterns in run_command that are destructive. */
const DESTRUCTIVE_COMMAND_PATTERNS = [
  /\brm\s+-rf?\b/i,
  /\bgit\s+reset\b/i,
  /\bgit\s+push\s+--force\b/i,
  /\bdrop\s+(?:table|database)\b/i,
  /\bnpx?\s+.*--force\b/i,
]

/**
 * Evaluate whether a tool call should trigger a HITL checkpoint.
 * Returns the trigger if HITL is needed, or null if the action is safe.
 */
export function evaluateTrigger(
  toolName: string,
  toolInput: Record<string, unknown>,
  scopePaths?: string[],
): HitlTrigger | null {
  // Check destructive tools
  if (DESTRUCTIVE_TOOLS.has(toolName)) {
    const path = typeof toolInput.path === "string" ? toolInput.path : undefined
    return {
      type: "destructive-tool",
      reason: `Destructive operation: ${toolName}${path ? ` on ${path}` : ""}`,
      toolName,
      path,
    }
  }

  // Check destructive commands
  if (toolName === "run_command") {
    const command = typeof toolInput.command === "string" ? toolInput.command : ""
    for (const pattern of DESTRUCTIVE_COMMAND_PATTERNS) {
      if (pattern.test(command)) {
        return {
          type: "destructive-tool",
          reason: `Destructive command: ${command.slice(0, 100)}`,
          toolName: "run_command",
        }
      }
    }
  }

  // Check sensitive paths
  const path = typeof toolInput.path === "string" ? toolInput.path : undefined
  if (path) {
    for (const pattern of SENSITIVE_PATHS) {
      if (pattern.test(path)) {
        return {
          type: "sensitive-path",
          reason: `Sensitive file: ${path}`,
          toolName,
          path,
        }
      }
    }
  }

  // Check scope creep (only if scopePaths is provided)
  if (scopePaths && scopePaths.length > 0 && path) {
    const inScope = scopePaths.some(
      (sp) => path.startsWith(sp) || path === sp,
    )
    if (!inScope) {
      return {
        type: "scope-creep",
        reason: `Out-of-scope file: ${path} (scope: ${scopePaths.join(", ")})`,
        toolName,
        path,
      }
    }
  }

  return null
}
