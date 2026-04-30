/**
 * HITLGate — Human-in-the-Loop checkpoint state machine tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  createCheckpoint,
  resolveCheckpoint,
  checkTimeout,
  isTerminal,
  evaluateTrigger,
  DEFAULT_HITL_TIMEOUT_MS,
  type HitlCheckpoint,
  type HitlTrigger,
  type HitlStatus,
} from "@/lib/agent-kit/core/hitl"

// ---------------------------------------------------------------------------
// createCheckpoint
// ---------------------------------------------------------------------------

describe("createCheckpoint", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-15T12:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("creates a checkpoint in PENDING state with correct fields", () => {
    const trigger: HitlTrigger = {
      type: "destructive-tool",
      reason: "Destructive operation: delete_file on /src/index.ts",
      toolName: "delete_file",
      path: "/src/index.ts",
    }

    const cp = createCheckpoint(
      "cp-1",
      "run-abc",
      "proj-xyz",
      trigger,
      '{"tool":"delete_file","path":"/src/index.ts"}',
    )

    expect(cp.id).toBe("cp-1")
    expect(cp.runId).toBe("run-abc")
    expect(cp.projectId).toBe("proj-xyz")
    expect(cp.status).toBe("PENDING")
    expect(cp.trigger).toEqual(trigger)
    expect(cp.proposedAction).toBe('{"tool":"delete_file","path":"/src/index.ts"}')
    expect(cp.createdAt).toBe(Date.now())
    expect(cp.resolvedAt).toBeNull()
    expect(cp.timeoutMs).toBe(DEFAULT_HITL_TIMEOUT_MS)
    expect(cp.modification).toBeUndefined()
  })

  it("accepts a custom timeout", () => {
    const trigger: HitlTrigger = { type: "manual", reason: "user requested" }
    const cp = createCheckpoint("cp-2", "run-1", "proj-1", trigger, "action", 60_000)
    expect(cp.timeoutMs).toBe(60_000)
  })
})

// ---------------------------------------------------------------------------
// resolveCheckpoint
// ---------------------------------------------------------------------------

describe("resolveCheckpoint", () => {
  let pendingCp: HitlCheckpoint

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-15T12:00:00Z"))
    pendingCp = createCheckpoint(
      "cp-resolve",
      "run-1",
      "proj-1",
      { type: "destructive-tool", reason: "delete_file" },
      "delete /tmp/foo",
    )
    // Advance time so resolvedAt differs from createdAt
    vi.advanceTimersByTime(5_000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("APPROVED — transitions from PENDING to APPROVED, sets resolvedAt", () => {
    const resolved = resolveCheckpoint(pendingCp, "APPROVED")
    expect(resolved.status).toBe("APPROVED")
    expect(resolved.resolvedAt).toBe(Date.now())
    expect(resolved.resolvedAt).toBeGreaterThan(resolved.createdAt)
    expect(resolved.modification).toBeUndefined()
    // Original is unchanged (immutable)
    expect(pendingCp.status).toBe("PENDING")
  })

  it("REJECTED — transitions from PENDING to REJECTED", () => {
    const resolved = resolveCheckpoint(pendingCp, "REJECTED")
    expect(resolved.status).toBe("REJECTED")
    expect(resolved.resolvedAt).toBe(Date.now())
    expect(resolved.modification).toBeUndefined()
  })

  it("MODIFIED — transitions with modification text", () => {
    const resolved = resolveCheckpoint(pendingCp, "MODIFIED", "Use safer rm instead")
    expect(resolved.status).toBe("MODIFIED")
    expect(resolved.modification).toBe("Use safer rm instead")
    expect(resolved.resolvedAt).toBe(Date.now())
  })

  it("MODIFIED — throws if no modification text provided", () => {
    expect(() => resolveCheckpoint(pendingCp, "MODIFIED")).toThrow(
      /MODIFIED without a modification/,
    )
  })

  it("throws if checkpoint is not in PENDING state", () => {
    const approved = resolveCheckpoint(pendingCp, "APPROVED")
    expect(() => resolveCheckpoint(approved, "REJECTED")).toThrow(
      /current status is APPROVED, expected PENDING/,
    )
  })
})

// ---------------------------------------------------------------------------
// checkTimeout
// ---------------------------------------------------------------------------

describe("checkTimeout", () => {
  let pendingCp: HitlCheckpoint

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-15T12:00:00Z"))
    pendingCp = createCheckpoint(
      "cp-timeout",
      "run-1",
      "proj-1",
      { type: "sensitive-path", reason: ".env" },
      "edit .env",
      60_000, // 1 minute timeout
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns same checkpoint if within timeout", () => {
    const now = pendingCp.createdAt + 30_000 // 30s, well within 60s timeout
    const result = checkTimeout(pendingCp, now)
    expect(result).toBe(pendingCp) // same reference
    expect(result.status).toBe("PENDING")
  })

  it("returns TIMED_OUT if past timeout", () => {
    const now = pendingCp.createdAt + 60_000 // exactly at timeout boundary
    const result = checkTimeout(pendingCp, now)
    expect(result.status).toBe("TIMED_OUT")
    expect(result.resolvedAt).toBe(now)
    expect(result).not.toBe(pendingCp) // new object
  })

  it("returns same checkpoint if already resolved, even if past timeout", () => {
    const approved = resolveCheckpoint(pendingCp, "APPROVED")
    const now = approved.createdAt + 120_000 // way past timeout
    const result = checkTimeout(approved, now)
    expect(result).toBe(approved) // same reference, no change
    expect(result.status).toBe("APPROVED")
  })
})

// ---------------------------------------------------------------------------
// isTerminal
// ---------------------------------------------------------------------------

describe("isTerminal", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-15T12:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns false for PENDING", () => {
    const cp = createCheckpoint(
      "cp-term",
      "run-1",
      "proj-1",
      { type: "manual", reason: "test" },
      "action",
    )
    expect(isTerminal(cp)).toBe(false)
  })

  it.each<HitlStatus>(["APPROVED", "REJECTED", "MODIFIED", "EXPIRED", "TIMED_OUT"])(
    "returns true for %s",
    (status) => {
      const cp: HitlCheckpoint = {
        id: "cp-term",
        runId: "run-1",
        projectId: "proj-1",
        status,
        trigger: { type: "manual", reason: "test" },
        proposedAction: "action",
        createdAt: Date.now(),
        resolvedAt: Date.now(),
        timeoutMs: DEFAULT_HITL_TIMEOUT_MS,
      }
      expect(isTerminal(cp)).toBe(true)
    },
  )
})

// ---------------------------------------------------------------------------
// evaluateTrigger
// ---------------------------------------------------------------------------

describe("evaluateTrigger", () => {
  // ── Destructive tools ──────────────────────────────────────────────────

  it("delete_file triggers destructive-tool", () => {
    const result = evaluateTrigger("delete_file", { path: "/src/old.ts" })
    expect(result).not.toBeNull()
    expect(result!.type).toBe("destructive-tool")
    expect(result!.toolName).toBe("delete_file")
    expect(result!.path).toBe("/src/old.ts")
    expect(result!.reason).toContain("delete_file")
  })

  // ── Destructive commands ───────────────────────────────────────────────

  it("destructive command (rm -rf) triggers destructive-tool", () => {
    const result = evaluateTrigger("run_command", { command: "rm -rf /tmp/build" })
    expect(result).not.toBeNull()
    expect(result!.type).toBe("destructive-tool")
    expect(result!.reason).toContain("rm -rf")
  })

  it("destructive command (rm -r) triggers destructive-tool", () => {
    const result = evaluateTrigger("run_command", { command: "rm -r ./dist" })
    expect(result).not.toBeNull()
    expect(result!.type).toBe("destructive-tool")
  })

  it("destructive command (git reset) triggers destructive-tool", () => {
    const result = evaluateTrigger("run_command", { command: "git reset --hard HEAD~1" })
    expect(result).not.toBeNull()
    expect(result!.type).toBe("destructive-tool")
    expect(result!.reason).toContain("git reset")
  })

  it("destructive command (git push --force) triggers destructive-tool", () => {
    const result = evaluateTrigger("run_command", {
      command: "git push --force origin main",
    })
    expect(result).not.toBeNull()
    expect(result!.type).toBe("destructive-tool")
  })

  it("destructive command (DROP TABLE) triggers destructive-tool", () => {
    const result = evaluateTrigger("run_command", {
      command: "psql -c 'DROP TABLE users'",
    })
    expect(result).not.toBeNull()
    expect(result!.type).toBe("destructive-tool")
  })

  it("destructive command (npx --force) triggers destructive-tool", () => {
    const result = evaluateTrigger("run_command", {
      command: "npx prisma migrate reset --force",
    })
    expect(result).not.toBeNull()
    expect(result!.type).toBe("destructive-tool")
  })

  // ── Sensitive paths ────────────────────────────────────────────────────

  it("sensitive path (.env) triggers sensitive-path", () => {
    const result = evaluateTrigger("write_file", { path: ".env" })
    expect(result).not.toBeNull()
    expect(result!.type).toBe("sensitive-path")
    expect(result!.path).toBe(".env")
  })

  it("sensitive path (.env.local) triggers sensitive-path", () => {
    const result = evaluateTrigger("write_file", { path: ".env.local" })
    expect(result).not.toBeNull()
    expect(result!.type).toBe("sensitive-path")
  })

  it("sensitive path (package.json) triggers sensitive-path", () => {
    const result = evaluateTrigger("write_file", { path: "package.json" })
    expect(result).not.toBeNull()
    expect(result!.type).toBe("sensitive-path")
    expect(result!.path).toBe("package.json")
  })

  it("sensitive path (nested package.json) triggers sensitive-path", () => {
    const result = evaluateTrigger("write_file", { path: "packages/core/package.json" })
    expect(result).not.toBeNull()
    expect(result!.type).toBe("sensitive-path")
  })

  it("sensitive path (convex/schema.ts) triggers sensitive-path", () => {
    const result = evaluateTrigger("write_file", { path: "convex/schema.ts" })
    expect(result).not.toBeNull()
    expect(result!.type).toBe("sensitive-path")
    expect(result!.path).toBe("convex/schema.ts")
  })

  it("sensitive path (.github/) triggers sensitive-path", () => {
    const result = evaluateTrigger("write_file", {
      path: ".github/workflows/ci.yml",
    })
    expect(result).not.toBeNull()
    expect(result!.type).toBe("sensitive-path")
  })

  it("sensitive path (tsconfig.json) triggers sensitive-path", () => {
    const result = evaluateTrigger("write_file", { path: "tsconfig.json" })
    expect(result).not.toBeNull()
    expect(result!.type).toBe("sensitive-path")
  })

  it("sensitive path (next.config.mjs) triggers sensitive-path", () => {
    const result = evaluateTrigger("write_file", { path: "next.config.mjs" })
    expect(result).not.toBeNull()
    expect(result!.type).toBe("sensitive-path")
  })

  it("sensitive path (.gitignore) triggers sensitive-path", () => {
    const result = evaluateTrigger("write_file", { path: ".gitignore" })
    expect(result).not.toBeNull()
    expect(result!.type).toBe("sensitive-path")
  })

  it("sensitive path (convex/_generated/) triggers sensitive-path", () => {
    const result = evaluateTrigger("write_file", {
      path: "convex/_generated/api.ts",
    })
    expect(result).not.toBeNull()
    expect(result!.type).toBe("sensitive-path")
  })

  // ── Scope creep ────────────────────────────────────────────────────────

  it("scope creep — triggers when path is outside scopePaths", () => {
    const result = evaluateTrigger(
      "write_file",
      { path: "src/backend/server.ts" },
      ["src/frontend/"],
    )
    expect(result).not.toBeNull()
    expect(result!.type).toBe("scope-creep")
    expect(result!.path).toBe("src/backend/server.ts")
    expect(result!.reason).toContain("Out-of-scope")
    expect(result!.reason).toContain("src/frontend/")
  })

  it("in-scope path — returns null", () => {
    const result = evaluateTrigger(
      "write_file",
      { path: "src/frontend/App.tsx" },
      ["src/frontend/"],
    )
    expect(result).toBeNull()
  })

  it("exact scope path match — returns null", () => {
    const result = evaluateTrigger(
      "write_file",
      { path: "src/lib/utils.ts" },
      ["src/lib/utils.ts"],
    )
    expect(result).toBeNull()
  })

  // ── Safe operations ────────────────────────────────────────────────────

  it("safe operation (read_file) returns null", () => {
    const result = evaluateTrigger("read_file", { path: "src/index.ts" })
    expect(result).toBeNull()
  })

  it("safe command (ls) returns null", () => {
    const result = evaluateTrigger("run_command", { command: "ls -la" })
    expect(result).toBeNull()
  })

  it("no scope check when scopePaths not provided", () => {
    const result = evaluateTrigger("write_file", { path: "src/random/file.ts" })
    expect(result).toBeNull()
  })

  it("no scope check when scopePaths is empty", () => {
    const result = evaluateTrigger("write_file", { path: "src/random/file.ts" }, [])
    expect(result).toBeNull()
  })

  // ── Priority: destructive > sensitive > scope-creep ────────────────────

  it("destructive takes priority over sensitive path", () => {
    // delete_file on a sensitive path — should be "destructive-tool", not "sensitive-path"
    const result = evaluateTrigger("delete_file", { path: "package.json" })
    expect(result).not.toBeNull()
    expect(result!.type).toBe("destructive-tool")
  })

  it("destructive command takes priority over scope-creep", () => {
    const result = evaluateTrigger(
      "run_command",
      { command: "rm -rf /outside" },
      ["src/"],
    )
    expect(result).not.toBeNull()
    expect(result!.type).toBe("destructive-tool")
  })

  it("sensitive path takes priority over scope-creep", () => {
    // .env is sensitive AND outside scope — sensitive should win
    const result = evaluateTrigger(
      "write_file",
      { path: ".env" },
      ["src/"],
    )
    expect(result).not.toBeNull()
    expect(result!.type).toBe("sensitive-path")
  })
})
