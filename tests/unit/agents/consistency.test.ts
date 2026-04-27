/**
 * Consistency model tests. Authority: CONSTITUTION §10, §12 (4 layers
 * of error recovery), D-018 (sandbox resync).
 *
 * Layer 3 = checkpoint resume: when an Inngest retry fires (`attempt > 0`),
 * the AgentRunner loads the last `agent_checkpoints` row and continues
 * from the saved iteration count.
 *
 * Layer 4 = sandbox resync: on `SandboxDeadError` mid-run, the agent loop
 * marks the sandbox dead, provisions a fresh one, and retries once before
 * escalating to NonRetriableError.
 *
 * These tests model the orchestration logic without spinning up Inngest
 * or Convex — same pattern as `assert-within-quota.test.ts`.
 */

import { describe, it, expect } from "vitest"

// ─────────────────────────────────────────────────────────────────────────────
// Layer 3 — checkpoint resume
// ─────────────────────────────────────────────────────────────────────────────

interface Checkpoint {
  messageId: string
  iterationCount: number
  totalInputTokens: number
  totalOutputTokens: number
  savedAt: number
}

interface RunArgs {
  messageId: string
  attempt: number
  checkpoint: Checkpoint | null
}

const decideStartIteration = ({ attempt, checkpoint }: RunArgs): number => {
  // First attempt always starts at 0.
  if (attempt === 0) return 0
  // Retry without checkpoint = catastrophic loss; restart from 0.
  if (!checkpoint) return 0
  // Retry with checkpoint = resume from saved iteration.
  return checkpoint.iterationCount
}

describe("Layer 3 — checkpoint resume", () => {
  it("first attempt starts at iteration 0", () => {
    expect(
      decideStartIteration({ messageId: "m1", attempt: 0, checkpoint: null }),
    ).toBe(0)
  })

  it("retry with no checkpoint restarts from 0", () => {
    expect(
      decideStartIteration({ messageId: "m1", attempt: 1, checkpoint: null }),
    ).toBe(0)
  })

  it("retry with checkpoint resumes from saved iteration", () => {
    expect(
      decideStartIteration({
        messageId: "m1",
        attempt: 1,
        checkpoint: {
          messageId: "m1",
          iterationCount: 7,
          totalInputTokens: 1234,
          totalOutputTokens: 567,
          savedAt: Date.now(),
        },
      }),
    ).toBe(7)
  })

  it("attempt 3 still uses the latest checkpoint", () => {
    expect(
      decideStartIteration({
        messageId: "m1",
        attempt: 3,
        checkpoint: {
          messageId: "m1",
          iterationCount: 12,
          totalInputTokens: 5000,
          totalOutputTokens: 2000,
          savedAt: Date.now(),
        },
      }),
    ).toBe(12)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Layer 4 — sandbox resync (single-retry-then-escalate)
// ─────────────────────────────────────────────────────────────────────────────

class SandboxDeadError extends Error {
  override readonly name = "SandboxDeadError"
}

interface SandboxResyncResult {
  reprovisions: number
  escalated: boolean
  finalSandboxId: string | null
}

const simulateSandboxResync = (
  errorsThrown: number,
  newIds: string[],
): SandboxResyncResult => {
  let reprovisions = 0
  let attempts = 0
  let sandboxId: string | null = "sb-original"

  while (true) {
    if (attempts < errorsThrown) {
      // The runner threw SandboxDeadError this attempt.
      attempts += 1
      if (reprovisions === 0) {
        reprovisions += 1
        sandboxId = newIds[0] ?? null
        continue
      }
      // Already retried once → escalate.
      return { reprovisions, escalated: true, finalSandboxId: null }
    }
    // Run completed cleanly.
    return { reprovisions, escalated: false, finalSandboxId: sandboxId }
  }
}

describe("Layer 4 — sandbox resync", () => {
  it("happy path: zero errors, no reprovision, original sandbox returned", () => {
    const r = simulateSandboxResync(0, ["sb-new-1", "sb-new-2"])
    expect(r.reprovisions).toBe(0)
    expect(r.escalated).toBe(false)
    expect(r.finalSandboxId).toBe("sb-original")
  })

  it("one death triggers exactly one reprovision then succeeds", () => {
    const r = simulateSandboxResync(1, ["sb-new-1", "sb-new-2"])
    expect(r.reprovisions).toBe(1)
    expect(r.escalated).toBe(false)
    expect(r.finalSandboxId).toBe("sb-new-1")
  })

  it("two deaths in one run → escalate to NonRetriableError (no infinite loop)", () => {
    const r = simulateSandboxResync(2, ["sb-new-1", "sb-new-2"])
    expect(r.reprovisions).toBe(1)
    expect(r.escalated).toBe(true)
    expect(r.finalSandboxId).toBe(null)
  })

  it("SandboxDeadError class is identifiable", () => {
    const err = new SandboxDeadError("provider expired")
    expect(err.name).toBe("SandboxDeadError")
    expect(err.message).toBe("provider expired")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Convex source-of-truth invariant — files exist in Convex BEFORE sandbox
// ─────────────────────────────────────────────────────────────────────────────

const writeOrder = (
  steps: Array<{ kind: "convex" | "sandbox"; path: string }>,
): boolean => {
  // Returns true iff every (path, kind=sandbox) is preceded by a
  // matching (path, kind=convex) somewhere earlier in the sequence.
  const convexWrites = new Set<string>()
  for (const step of steps) {
    if (step.kind === "convex") convexWrites.add(step.path)
    if (step.kind === "sandbox" && !convexWrites.has(step.path)) return false
  }
  return true
}

describe("Convex source-of-truth invariant (§10)", () => {
  it("Convex write must precede sandbox write for each path", () => {
    expect(
      writeOrder([
        { kind: "convex", path: "src/page.tsx" },
        { kind: "sandbox", path: "src/page.tsx" },
      ]),
    ).toBe(true)
  })

  it("sandbox write without prior Convex write violates the invariant", () => {
    expect(
      writeOrder([
        { kind: "sandbox", path: "src/page.tsx" },
        { kind: "convex", path: "src/page.tsx" },
      ]),
    ).toBe(false)
  })

  it("multi-file batch maintains per-path ordering", () => {
    expect(
      writeOrder([
        { kind: "convex", path: "a.ts" },
        { kind: "convex", path: "b.ts" },
        { kind: "sandbox", path: "a.ts" },
        { kind: "sandbox", path: "b.ts" },
      ]),
    ).toBe(true)
  })
})
