/**
 * StreamMonitor — regex-based heuristic pattern matching tests.
 */

import { describe, it, expect } from "vitest"
import { StreamMonitor } from "@/lib/agent-kit/core/stream-monitor"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Produce a filler string of exactly `n` characters. */
function filler(n: number): string {
  return "x".repeat(n)
}

// ---------------------------------------------------------------------------
// Basic accumulation
// ---------------------------------------------------------------------------

describe("StreamMonitor — basic accumulation", () => {
  it("tracks accumulated character count across deltas", () => {
    const mon = new StreamMonitor()
    mon.onDelta("hello")
    expect(mon.getCharCount()).toBe(5)
    mon.onDelta(" world")
    expect(mon.getCharCount()).toBe(11)
  })

  it("starts with no alerts", () => {
    const mon = new StreamMonitor()
    expect(mon.getAlerts()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Apology loop detection (500+ chars)
// ---------------------------------------------------------------------------

describe("StreamMonitor — apology loop detection", () => {
  it("fires at 500+ chars when apology pattern appears twice", () => {
    const mon = new StreamMonitor()
    // Pad to 500 chars then inject two apologies
    mon.onDelta(filler(480))
    // The regex requires 2+ consecutive group matches (no gap between them)
    mon.onDelta(" I apologizeI apologize ")
    // Should now be over 500 chars with 2x apology
    expect(mon.getCharCount()).toBeGreaterThanOrEqual(500)

    const alerts = mon.getAlerts()
    const apology = alerts.find((a) => a.type === "apology-loop")
    expect(apology).toBeDefined()
    expect(apology!.message).toContain("apology loop")
  })

  it("does NOT fire below 500 chars even if pattern matches", () => {
    const mon = new StreamMonitor()
    mon.onDelta("I apologizeI apologize") // only 22 chars, below threshold
    expect(mon.getAlerts()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Scope creep detection (500+ chars)
// ---------------------------------------------------------------------------

describe("StreamMonitor — scope creep detection", () => {
  it("fires when scope-creep language appears at 500+ chars", () => {
    const mon = new StreamMonitor()
    mon.onDelta(filler(500) + " while I'm at it let me also refactor")

    const alerts = mon.getAlerts()
    const creep = alerts.find((a) => a.type === "scope-creep")
    expect(creep).toBeDefined()
    expect(creep!.message).toContain("expanding scope")
  })
})

// ---------------------------------------------------------------------------
// Placeholder code detection (2000+ chars)
// ---------------------------------------------------------------------------

describe("StreamMonitor — placeholder code detection", () => {
  it("fires when placeholder markers appear at 2000+ chars", () => {
    const mon = new StreamMonitor()
    mon.onDelta(filler(2000) + "\n// TODO implement this\n")

    const alerts = mon.getAlerts()
    const placeholder = alerts.find((a) => a.type === "placeholder-code")
    expect(placeholder).toBeDefined()
    expect(placeholder!.message).toContain("placeholder code")
  })

  it("does NOT fire below 2000 chars", () => {
    const mon = new StreamMonitor()
    mon.onDelta(filler(100) + " // TODO fix this")
    expect(
      mon.getAlerts().find((a) => a.type === "placeholder-code"),
    ).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// No-tool-calls alert (5000+ chars)
// ---------------------------------------------------------------------------

describe("StreamMonitor — no-tool-calls alert", () => {
  it("fires at 5000+ chars when no tool calls have been made", () => {
    const mon = new StreamMonitor()
    mon.onDelta(filler(5001))

    const alerts = mon.getAlerts()
    const noTools = alerts.find((a) => a.type === "no-tool-calls")
    expect(noTools).toBeDefined()
    expect(noTools!.message).toContain("5000+ characters")
    expect(noTools!.charOffset).toBe(5001)
  })

  it("does NOT fire if tool calls were made before reaching 5000 chars", () => {
    const mon = new StreamMonitor()
    mon.onDelta(filler(3000))
    mon.onToolCall() // records a tool call
    mon.onDelta(filler(2001)) // total now > 5000

    const alerts = mon.getAlerts()
    const noTools = alerts.find((a) => a.type === "no-tool-calls")
    expect(noTools).toBeUndefined()
  })

  it("does NOT fire if onToolCall is called before threshold", () => {
    const mon = new StreamMonitor()
    mon.onToolCall()
    mon.onDelta(filler(6000))

    expect(
      mon.getAlerts().find((a) => a.type === "no-tool-calls"),
    ).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Pattern fires only once (no duplicates)
// ---------------------------------------------------------------------------

describe("StreamMonitor — deduplication", () => {
  it("each pattern fires at most once even if text continues to match", () => {
    const mon = new StreamMonitor()
    // Trigger scope-creep
    mon.onDelta(filler(500) + " while I'm at it ")
    const count1 = mon
      .getAlerts()
      .filter((a) => a.type === "scope-creep").length
    expect(count1).toBe(1)

    // Feed more matching text
    mon.onDelta(" also add another feature ")
    const count2 = mon
      .getAlerts()
      .filter((a) => a.type === "scope-creep").length
    expect(count2).toBe(1) // still just one
  })
})

// ---------------------------------------------------------------------------
// maxAlerts cap
// ---------------------------------------------------------------------------

describe("StreamMonitor — maxAlerts cap", () => {
  it("stops producing alerts after reaching maxAlerts", () => {
    const mon = new StreamMonitor({ maxAlerts: 2 })

    // Trigger multiple patterns at once: scope-creep + apology-loop
    mon.onDelta(
      filler(500) +
        " while I'm at it I apologize I apologize " +
        filler(1600) +
        " // TODO fix ",
    )

    // Should have at most 2 alerts
    expect(mon.getAlerts().length).toBeLessThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------
// reset() behavior
// ---------------------------------------------------------------------------

describe("StreamMonitor — reset", () => {
  it("clears accumulated text and tool call count but keeps alerts", () => {
    const mon = new StreamMonitor()

    // Build up some state and trigger an alert
    mon.onDelta(filler(500) + " while I'm at it ")
    mon.onToolCall()

    expect(mon.getCharCount()).toBeGreaterThan(500)
    expect(mon.getAlerts().length).toBeGreaterThan(0)

    const alertsBefore = mon.getAlerts().length

    mon.reset()

    // Text and tool count are cleared
    expect(mon.getCharCount()).toBe(0)

    // Alerts are preserved
    expect(mon.getAlerts().length).toBe(alertsBefore)
  })

  it("after reset, previously fired patterns do not fire again", () => {
    const mon = new StreamMonitor()
    mon.onDelta(filler(500) + " while I'm at it ")
    expect(mon.getAlerts().length).toBe(1)

    mon.reset()

    // Re-trigger same pattern text
    mon.onDelta(filler(500) + " while I'm at it ")
    // Still only 1 alert total because firedPatterns is preserved
    expect(
      mon.getAlerts().filter((a) => a.type === "scope-creep").length,
    ).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// onToolCall prevents no-tool-calls alert
// ---------------------------------------------------------------------------

describe("StreamMonitor — onToolCall interaction", () => {
  it("recording a tool call prevents the no-tool-calls alert", () => {
    const mon = new StreamMonitor()
    mon.onDelta(filler(4000))
    mon.onToolCall()
    mon.onDelta(filler(2000))

    expect(
      mon.getAlerts().find((a) => a.type === "no-tool-calls"),
    ).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Alert shape
// ---------------------------------------------------------------------------

describe("StreamMonitor — alert shape", () => {
  it("produces alerts with correct shape (type, message, charOffset, timestamp)", () => {
    const mon = new StreamMonitor()
    const before = Date.now()
    mon.onDelta(filler(500) + " while I'm at it ")
    const after = Date.now()

    const alert = mon.getAlerts()[0]!
    expect(alert.type).toBe("scope-creep")
    expect(typeof alert.message).toBe("string")
    expect(alert.charOffset).toBeGreaterThanOrEqual(500)
    expect(alert.timestamp).toBeGreaterThanOrEqual(before)
    expect(alert.timestamp).toBeLessThanOrEqual(after)
  })
})
