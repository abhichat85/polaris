/**
 * HookRunner — D-055 / Phase 2.2.
 *
 * Executes registered hooks for a given lifecycle event. The default
 * production runner is HookRunner; tests use InMemoryHookRunner.
 * agent-loop.ts wires hooks via Convex queries (deferred — schema
 * changes land in a follow-up).
 */

import type {
  HookConfig,
  HookDecision,
  HookEvent,
  HookPayload,
} from "./types"
import { DEFAULT_HOOK_TIMEOUT_MS } from "./types"

export interface HookRunResult {
  /** Final decision after combining all hook responses for the event. */
  decision: HookDecision
  /** IDs of hooks that participated (for audit/telemetry). */
  invokedIds: string[]
  /** IDs of hooks that errored or timed out. */
  failedIds: string[]
}

/**
 * Execute every enabled hook for the given event in registration order.
 * Combination rules:
 *   - First "deny" wins and short-circuits subsequent hooks
 *   - Modifications accumulate (last writer wins per field)
 *   - Failures are recorded; effect depends on the hook's failMode
 */
export class HookRunner {
  constructor(private readonly hooks: readonly HookConfig[]) {}

  async runEvent(event: HookEvent, payload: HookPayload): Promise<HookRunResult> {
    const candidates = this.hooks.filter(
      (h) => h.event === event && h.enabled !== false,
    )
    if (candidates.length === 0) {
      return { decision: { decision: "continue" }, invokedIds: [], failedIds: [] }
    }

    let cumulativeDecision: HookDecision = { decision: "continue" }
    const invokedIds: string[] = []
    const failedIds: string[] = []

    for (const hook of candidates) {
      try {
        const decision = await this.runOne(hook, payload)
        invokedIds.push(hook.id)
        if (decision.decision === "deny") {
          // Short-circuit on first deny.
          return {
            decision,
            invokedIds,
            failedIds,
          }
        }
        if (decision.decision === "modify") {
          // Merge inputPatch onto any prior modify decision.
          if (cumulativeDecision.decision === "modify") {
            cumulativeDecision = {
              decision: "modify",
              inputPatch: { ...cumulativeDecision.inputPatch, ...decision.inputPatch },
            }
          } else {
            cumulativeDecision = decision
          }
        }
        if (decision.decision === "transform_output") {
          // Last writer wins on output transforms.
          cumulativeDecision = decision
        }
      } catch (err) {
        failedIds.push(hook.id)
        if ((hook.failMode ?? "open") === "closed") {
          return {
            decision: {
              decision: "deny",
              reason: `Hook ${hook.id} failed (failMode=closed): ${
                err instanceof Error ? err.message : String(err)
              }`,
            },
            invokedIds,
            failedIds,
          }
        }
        // failMode=open → log + continue
        // eslint-disable-next-line no-console
        console.warn(`[HookRunner] hook ${hook.id} errored (failMode=open):`, err)
      }
    }

    return { decision: cumulativeDecision, invokedIds, failedIds }
  }

  private async runOne(hook: HookConfig, payload: HookPayload): Promise<HookDecision> {
    const timeoutMs = hook.timeoutMs ?? DEFAULT_HOOK_TIMEOUT_MS
    if (hook.target.type === "function") {
      return await withTimeout(hook.target.fn(payload), timeoutMs, hook.id)
    }
    // HTTP target.
    return await withTimeout(
      runHttpHook(hook.target.url, hook.target.headers, payload),
      timeoutMs,
      hook.id,
    )
  }
}

/** Test-only registry that lets you wire hooks programmatically. */
export class InMemoryHookRunner extends HookRunner {
  constructor(hooks: HookConfig[] = []) {
    super(hooks)
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * Internals
 * ───────────────────────────────────────────────────────────────────── */

async function runHttpHook(
  url: string,
  headers: Record<string, string> | undefined,
  payload: HookPayload,
): Promise<HookDecision> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Polaris-Hooks/1.0",
      ...(headers ?? {}),
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`)
  }
  const body = await response.json()
  return validateDecision(body)
}

function validateDecision(raw: unknown): HookDecision {
  if (!raw || typeof raw !== "object") {
    throw new Error("hook response must be an object")
  }
  const obj = raw as Record<string, unknown>
  switch (obj.decision) {
    case "continue":
      return { decision: "continue" }
    case "deny":
      if (typeof obj.reason !== "string") {
        throw new Error("deny decision requires `reason: string`")
      }
      return { decision: "deny", reason: obj.reason }
    case "modify":
      if (!obj.inputPatch || typeof obj.inputPatch !== "object") {
        throw new Error("modify decision requires `inputPatch: object`")
      }
      return {
        decision: "modify",
        inputPatch: obj.inputPatch as Record<string, unknown>,
      }
    case "transform_output":
      if (!obj.outputPatch || typeof obj.outputPatch !== "object") {
        throw new Error("transform_output requires `outputPatch: ToolOutput`")
      }
      return {
        decision: "transform_output",
        outputPatch: obj.outputPatch as HookDecision extends { outputPatch: infer T } ? T : never,
      }
    default:
      throw new Error(`unknown decision: ${String(obj.decision)}`)
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number, hookId: string): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`hook ${hookId} timed out after ${ms}ms`)), ms),
    ),
  ])
}
