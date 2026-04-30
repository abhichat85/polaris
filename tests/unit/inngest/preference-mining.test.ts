/**
 * Phase 5 — preference-mining pure-helper tests.
 *
 * These cover the pure helpers extracted from the Inngest functions
 * (`computeSatisfactionVerdict`, `extractComplaintKeywords`, `tallyFeedback`).
 * The Inngest functions themselves are exercised by integration runs;
 * here we just verify the math.
 */

import { describe, it, expect } from "vitest"
import {
  computeSatisfactionVerdict,
  extractComplaintKeywords,
  tallyFeedback,
} from "@/features/conversations/inngest/preference-mining"

describe("computeSatisfactionVerdict", () => {
  it("returns unknown when total feedback is below the threshold", () => {
    const r = computeSatisfactionVerdict(8, 1, 9)
    expect(r.verdict).toBe("unknown")
    expect(r.confidence).toBe(0)
  })

  it("returns high when thumbs-up rate exceeds 70% (with enough data)", () => {
    // 16 up / 4 down = 80% up rate, total 20
    const r = computeSatisfactionVerdict(16, 4, 20)
    expect(r.verdict).toBe("high")
    expect(r.confidence).toBeCloseTo(0.8)
  })

  it("returns low when thumbs-down rate exceeds 50%", () => {
    // 4 up / 16 down = 80% down rate
    const r = computeSatisfactionVerdict(4, 16, 20)
    expect(r.verdict).toBe("low")
    expect(r.confidence).toBeCloseTo(0.7)
  })

  it("returns mixed when neither side dominates", () => {
    // 10 up / 10 down = 50/50, total 20 — neither >70% up nor >50% down
    const r = computeSatisfactionVerdict(10, 10, 20)
    expect(r.verdict).toBe("mixed")
    expect(r.confidence).toBeCloseTo(0.5)
  })

  it("handles exactly the minimum-feedback boundary (10) as known", () => {
    // 8 up / 2 down → up rate 0.8 > 0.7 with 10 rows.
    const r = computeSatisfactionVerdict(8, 2, 10)
    expect(r.verdict).toBe("high")
  })

  it("treats exactly 70% up rate as not-yet-high (strict >)", () => {
    // 7 up / 3 down = 70% up rate, 10 total → mixed.
    const r = computeSatisfactionVerdict(7, 3, 10)
    expect(r.verdict).toBe("mixed")
  })

  it("treats exactly 50% down rate as not-yet-low (strict >)", () => {
    // 5 up / 5 down = 50% each, 10 total → mixed.
    const r = computeSatisfactionVerdict(5, 5, 10)
    expect(r.verdict).toBe("mixed")
  })
})

describe("extractComplaintKeywords", () => {
  it("returns the top-N most frequent meaningful words", () => {
    const comments = [
      "The button is broken and ugly",
      "Button placement is broken",
      "Layout looks broken on mobile",
      "Mobile button does not respond",
    ]
    const out = extractComplaintKeywords(comments, 3)
    // "broken" appears 3x, "button" 3x, "mobile" 2x → all three top.
    expect(out).toContain("broken")
    expect(out).toContain("button")
    expect(out).toContain("mobile")
    expect(out).toHaveLength(3)
  })

  it("filters out stop-words and short tokens", () => {
    const comments = ["The is a but and or"]
    const out = extractComplaintKeywords(comments, 3)
    expect(out).toEqual([])
  })

  it("handles empty input safely", () => {
    expect(extractComplaintKeywords([])).toEqual([])
    expect(extractComplaintKeywords([""])).toEqual([])
  })

  it("respects the topN parameter", () => {
    const comments = [
      "alpha beta gamma delta",
      "alpha beta gamma",
      "alpha beta",
      "alpha",
    ]
    const out = extractComplaintKeywords(comments, 2)
    expect(out).toHaveLength(2)
    expect(out[0]).toBe("alpha")
    expect(out[1]).toBe("beta")
  })

  it("breaks ties alphabetically for deterministic output", () => {
    const comments = ["delta charlie bravo alpha"]
    const out = extractComplaintKeywords(comments, 4)
    expect(out).toEqual(["alpha", "bravo", "charlie", "delta"])
  })

  it("is case-insensitive", () => {
    const comments = ["Broken broken BROKEN"]
    const out = extractComplaintKeywords(comments, 1)
    expect(out).toEqual(["broken"])
  })

  it("uses 3 as the default top-N", () => {
    const comments = [
      "alpha beta gamma delta epsilon zeta",
      "alpha beta gamma delta epsilon",
      "alpha beta gamma delta",
      "alpha beta gamma",
      "alpha beta",
      "alpha",
    ]
    const out = extractComplaintKeywords(comments)
    expect(out).toHaveLength(3)
  })
})

describe("tallyFeedback", () => {
  it("counts thumbs and collects only thumbs-down comments", () => {
    const rows = [
      { rating: "up" as const, comment: "looks great" },
      { rating: "up" as const },
      { rating: "down" as const, comment: "broken" },
      { rating: "down" as const, comment: "  " }, // whitespace, dropped
      { rating: "down" as const },                 // no comment, dropped
    ]
    const out = tallyFeedback(rows)
    expect(out.thumbsUp).toBe(2)
    expect(out.thumbsDown).toBe(3)
    expect(out.total).toBe(5)
    expect(out.downComments).toEqual(["broken"])
  })

  it("returns zeroes for empty input", () => {
    const out = tallyFeedback([])
    expect(out).toEqual({
      thumbsUp: 0,
      thumbsDown: 0,
      total: 0,
      downComments: [],
    })
  })
})
