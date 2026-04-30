/**
 * UserProfile — user preferences and adaptation signals tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  createUserProfile,
  updateProfile,
  recordRunStats,
  type UserProfile,
  type VerbosityLevel,
  type CodeStylePreferences,
  type RunStats,
} from "@/lib/agent-kit/core/user-profile"

// ---------------------------------------------------------------------------
// createUserProfile
// ---------------------------------------------------------------------------

describe("createUserProfile", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-30T12:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns a profile with correct userId", () => {
    const profile = createUserProfile("user-123")
    expect(profile.userId).toBe("user-123")
  })

  it("sets createdAt and updatedAt to current time", () => {
    const profile = createUserProfile("user-123")
    const now = Date.now()
    expect(profile.createdAt).toBe(now)
    expect(profile.updatedAt).toBe(now)
  })

  it("defaults verbosity to 'normal'", () => {
    const profile = createUserProfile("user-123")
    expect(profile.verbosity).toBe("normal")
  })

  it("defaults codeStyle to all null", () => {
    const profile = createUserProfile("user-123")
    expect(profile.codeStyle).toEqual({
      paradigm: null,
      exportStyle: null,
      typeStyle: null,
      maxLineLength: null,
    })
  })

  it("defaults overrides to empty object", () => {
    const profile = createUserProfile("user-123")
    expect(profile.overrides).toEqual({})
  })

  it("defaults runStats to zeroed state", () => {
    const profile = createUserProfile("user-123")
    expect(profile.runStats.totalRuns).toBe(0)
    expect(profile.runStats.successfulRuns).toBe(0)
    expect(profile.runStats.averageIterations).toBe(0)
    expect(profile.runStats.averageTokens).toBe(0)
    expect(profile.runStats.averageDurationMs).toBe(0)
    expect(profile.runStats.taskClassDistribution).toEqual({})
    expect(profile.runStats.averageEvalScore).toBeNull()
  })

  it("defaults persistentNotes to empty array", () => {
    const profile = createUserProfile("user-123")
    expect(profile.persistentNotes).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// updateProfile
// ---------------------------------------------------------------------------

describe("updateProfile", () => {
  let base: UserProfile

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-30T12:00:00Z"))
    base = createUserProfile("user-456")
    // Advance time so updatedAt changes
    vi.advanceTimersByTime(10_000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("updates verbosity and preserves other fields", () => {
    const updated = updateProfile(base, { verbosity: "detailed" })
    expect(updated.verbosity).toBe("detailed")
    expect(updated.codeStyle).toEqual(base.codeStyle)
    expect(updated.overrides).toEqual(base.overrides)
    expect(updated.persistentNotes).toEqual(base.persistentNotes)
    expect(updated.userId).toBe(base.userId)
    expect(updated.createdAt).toBe(base.createdAt)
  })

  it("updates updatedAt timestamp", () => {
    const updated = updateProfile(base, { verbosity: "minimal" })
    expect(updated.updatedAt).toBeGreaterThan(base.updatedAt)
    expect(updated.updatedAt).toBe(Date.now())
  })

  it("updates codeStyle with shallow merge", () => {
    const updated = updateProfile(base, {
      codeStyle: { paradigm: "functional", exportStyle: null, typeStyle: null, maxLineLength: null },
    })
    expect(updated.codeStyle.paradigm).toBe("functional")
  })

  it("updates codeStyle partially (merges with existing)", () => {
    // First set paradigm
    const first = updateProfile(base, {
      codeStyle: { paradigm: "oop", exportStyle: null, typeStyle: null, maxLineLength: null },
    })
    vi.advanceTimersByTime(1000)
    // Then set exportStyle — paradigm should be preserved
    const second = updateProfile(first, {
      codeStyle: { paradigm: "oop", exportStyle: "named", typeStyle: null, maxLineLength: null },
    })
    expect(second.codeStyle.paradigm).toBe("oop")
    expect(second.codeStyle.exportStyle).toBe("named")
  })

  it("updates overrides (merges with existing)", () => {
    const first = updateProfile(base, {
      overrides: { "budget.maxIterations": 100 },
    })
    vi.advanceTimersByTime(1000)
    const second = updateProfile(first, {
      overrides: { "healing.maxAttempts": 5 },
    })
    expect(second.overrides["budget.maxIterations"]).toBe(100)
    expect(second.overrides["healing.maxAttempts"]).toBe(5)
  })

  it("replaces persistentNotes entirely", () => {
    const first = updateProfile(base, {
      persistentNotes: ["note 1", "note 2"],
    })
    vi.advanceTimersByTime(1000)
    const second = updateProfile(first, {
      persistentNotes: ["note 3"],
    })
    expect(second.persistentNotes).toEqual(["note 3"])
  })

  it("handles empty updates (only updatedAt changes)", () => {
    const updated = updateProfile(base, {})
    expect(updated.verbosity).toBe(base.verbosity)
    expect(updated.codeStyle).toEqual(base.codeStyle)
    expect(updated.overrides).toEqual(base.overrides)
    expect(updated.persistentNotes).toEqual(base.persistentNotes)
    expect(updated.updatedAt).toBeGreaterThan(base.updatedAt)
  })

  it("does not mutate the original profile", () => {
    const original = { ...base }
    updateProfile(base, { verbosity: "detailed" })
    expect(base.verbosity).toBe(original.verbosity)
    expect(base.updatedAt).toBe(original.updatedAt)
  })
})

// ---------------------------------------------------------------------------
// recordRunStats
// ---------------------------------------------------------------------------

describe("recordRunStats", () => {
  let base: UserProfile

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-30T12:00:00Z"))
    base = createUserProfile("user-789")
    vi.advanceTimersByTime(5000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("records first run correctly", () => {
    const updated = recordRunStats(base, {
      iterations: 10,
      tokens: 5000,
      durationMs: 60_000,
      taskClass: "bugfix",
      evalScore: 0.9,
    })

    expect(updated.runStats.totalRuns).toBe(1)
    expect(updated.runStats.successfulRuns).toBe(1)
    expect(updated.runStats.averageIterations).toBe(10)
    expect(updated.runStats.averageTokens).toBe(5000)
    expect(updated.runStats.averageDurationMs).toBe(60_000)
    expect(updated.runStats.taskClassDistribution).toEqual({ bugfix: 1 })
    expect(updated.runStats.averageEvalScore).toBe(0.9)
  })

  it("computes running average correctly after two runs", () => {
    const after1 = recordRunStats(base, {
      iterations: 10,
      tokens: 4000,
      durationMs: 60_000,
      taskClass: "bugfix",
      evalScore: 0.8,
    })

    vi.advanceTimersByTime(1000)

    const after2 = recordRunStats(after1, {
      iterations: 20,
      tokens: 6000,
      durationMs: 120_000,
      taskClass: "feature",
      evalScore: 1.0,
    })

    expect(after2.runStats.totalRuns).toBe(2)
    expect(after2.runStats.successfulRuns).toBe(2)
    // Running average: 10 + (20-10)/2 = 15
    expect(after2.runStats.averageIterations).toBe(15)
    // 4000 + (6000-4000)/2 = 5000
    expect(after2.runStats.averageTokens).toBe(5000)
    // 60000 + (120000-60000)/2 = 90000
    expect(after2.runStats.averageDurationMs).toBe(90_000)
    expect(after2.runStats.taskClassDistribution).toEqual({ bugfix: 1, feature: 1 })
    // 0.8 + (1.0-0.8)/2 = 0.9
    expect(after2.runStats.averageEvalScore).toBeCloseTo(0.9)
  })

  it("computes running average correctly after three runs", () => {
    const run1 = recordRunStats(base, {
      iterations: 6,
      tokens: 3000,
      durationMs: 30_000,
      taskClass: "refactor",
      evalScore: 0.7,
    })
    const run2 = recordRunStats(run1, {
      iterations: 12,
      tokens: 6000,
      durationMs: 90_000,
      taskClass: "bugfix",
      evalScore: 0.85,
    })
    const run3 = recordRunStats(run2, {
      iterations: 9,
      tokens: 4500,
      durationMs: 60_000,
      taskClass: "refactor",
      evalScore: 0.95,
    })

    expect(run3.runStats.totalRuns).toBe(3)
    expect(run3.runStats.successfulRuns).toBe(3)
    // Average iterations: (6+12+9)/3 = 9
    expect(run3.runStats.averageIterations).toBe(9)
    // Average tokens: (3000+6000+4500)/3 = 4500
    expect(run3.runStats.averageTokens).toBe(4500)
    // Average duration: (30000+90000+60000)/3 = 60000
    expect(run3.runStats.averageDurationMs).toBe(60_000)
    expect(run3.runStats.taskClassDistribution).toEqual({
      refactor: 2,
      bugfix: 1,
    })
    // Average eval: (0.7+0.85+0.95)/3 ≈ 0.8333
    expect(run3.runStats.averageEvalScore).toBeCloseTo(0.8333, 3)
  })

  it("handles run without eval score", () => {
    const updated = recordRunStats(base, {
      iterations: 5,
      tokens: 2000,
      durationMs: 30_000,
      taskClass: "exploration",
    })

    expect(updated.runStats.totalRuns).toBe(1)
    expect(updated.runStats.successfulRuns).toBe(0)
    expect(updated.runStats.averageIterations).toBe(5)
    expect(updated.runStats.averageEvalScore).toBeNull()
  })

  it("handles mixed runs (some with eval, some without)", () => {
    const run1 = recordRunStats(base, {
      iterations: 10,
      tokens: 5000,
      durationMs: 60_000,
      taskClass: "bugfix",
      evalScore: 0.8,
    })
    const run2 = recordRunStats(run1, {
      iterations: 8,
      tokens: 4000,
      durationMs: 45_000,
      taskClass: "exploration",
      // no evalScore
    })

    expect(run2.runStats.totalRuns).toBe(2)
    expect(run2.runStats.successfulRuns).toBe(1) // only run1 had eval
    // Averages still computed for iterations/tokens/duration
    expect(run2.runStats.averageIterations).toBe(9)
    expect(run2.runStats.averageTokens).toBe(4500)
    // Eval score unchanged (only 1 scored run)
    expect(run2.runStats.averageEvalScore).toBe(0.8)
  })

  it("increments task class distribution", () => {
    let profile = base
    for (let i = 0; i < 3; i++) {
      profile = recordRunStats(profile, {
        iterations: 5,
        tokens: 1000,
        durationMs: 10_000,
        taskClass: "bugfix",
      })
    }
    profile = recordRunStats(profile, {
      iterations: 5,
      tokens: 1000,
      durationMs: 10_000,
      taskClass: "feature",
    })

    expect(profile.runStats.taskClassDistribution).toEqual({
      bugfix: 3,
      feature: 1,
    })
    expect(profile.runStats.totalRuns).toBe(4)
  })

  it("handles run with 0 values", () => {
    const updated = recordRunStats(base, {
      iterations: 0,
      tokens: 0,
      durationMs: 0,
      taskClass: "noop",
      evalScore: 0,
    })

    expect(updated.runStats.totalRuns).toBe(1)
    expect(updated.runStats.successfulRuns).toBe(1)
    expect(updated.runStats.averageIterations).toBe(0)
    expect(updated.runStats.averageTokens).toBe(0)
    expect(updated.runStats.averageDurationMs).toBe(0)
    expect(updated.runStats.averageEvalScore).toBe(0)
  })

  it("updates updatedAt timestamp", () => {
    const updated = recordRunStats(base, {
      iterations: 1,
      tokens: 100,
      durationMs: 1000,
      taskClass: "test",
    })
    expect(updated.updatedAt).toBe(Date.now())
    expect(updated.updatedAt).toBeGreaterThan(base.updatedAt)
  })

  it("does not mutate the original profile", () => {
    const originalRuns = base.runStats.totalRuns
    recordRunStats(base, {
      iterations: 5,
      tokens: 1000,
      durationMs: 10_000,
      taskClass: "bugfix",
    })
    expect(base.runStats.totalRuns).toBe(originalRuns)
  })

  it("does not mutate the original taskClassDistribution", () => {
    const run1 = recordRunStats(base, {
      iterations: 5,
      tokens: 1000,
      durationMs: 10_000,
      taskClass: "bugfix",
    })
    const run2 = recordRunStats(run1, {
      iterations: 5,
      tokens: 1000,
      durationMs: 10_000,
      taskClass: "bugfix",
    })
    // run1's distribution should not have been mutated
    expect(run1.runStats.taskClassDistribution).toEqual({ bugfix: 1 })
    expect(run2.runStats.taskClassDistribution).toEqual({ bugfix: 2 })
  })
})
