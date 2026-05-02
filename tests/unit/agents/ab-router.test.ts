import { describe, expect, it } from "vitest"
import { bucketFor, inRollout } from "@/lib/agents/ab-router"

describe("bucketFor", () => {
  it("is deterministic for the same inputs", () => {
    const a = bucketFor("user1", "exp", 100)
    const b = bucketFor("user1", "exp", 100)
    expect(a).toBe(b)
  })

  it("returns values in [0, numBuckets)", () => {
    for (let i = 0; i < 100; i++) {
      const b = bucketFor(`user${i}`, "exp", 10)
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThan(10)
    }
  })

  it("buckets users roughly uniformly", () => {
    // Sample 10000 users into 10 buckets — each bucket should have
    // ~1000 ± reasonable variance. Test stays loose on variance.
    const counts = new Array(10).fill(0)
    for (let i = 0; i < 10000; i++) {
      counts[bucketFor(`u${i}`, "exp", 10)]++
    }
    for (const c of counts) {
      expect(c).toBeGreaterThan(800)
      expect(c).toBeLessThan(1200)
    }
  })

  it("different experiments bucket the same user differently", () => {
    // For most users at least one of N experiments produces a different
    // bucket. We just check the experiment dimension is wired into the
    // hash by sampling.
    let differs = 0
    for (let i = 0; i < 100; i++) {
      const a = bucketFor(`u${i}`, "expA", 10)
      const b = bucketFor(`u${i}`, "expB", 10)
      if (a !== b) differs++
    }
    expect(differs).toBeGreaterThan(50) // most should differ
  })

  it("throws on non-positive numBuckets", () => {
    expect(() => bucketFor("u", "e", 0)).toThrow()
    expect(() => bucketFor("u", "e", -1)).toThrow()
  })
})

describe("inRollout", () => {
  it("returns false at 0%", () => {
    for (let i = 0; i < 50; i++) {
      expect(inRollout(`u${i}`, "exp", 0)).toBe(false)
    }
  })

  it("returns true at 100%", () => {
    for (let i = 0; i < 50; i++) {
      expect(inRollout(`u${i}`, "exp", 100)).toBe(true)
    }
  })

  it("returns true at >=100% (clamped)", () => {
    expect(inRollout("u", "exp", 200)).toBe(true)
  })

  it("returns false at <=0% (clamped)", () => {
    expect(inRollout("u", "exp", -50)).toBe(false)
  })

  it("approximates the rollout percentage", () => {
    let inCount = 0
    const N = 10000
    for (let i = 0; i < N; i++) {
      if (inRollout(`u${i}`, "rollout-25", 25)) inCount++
    }
    // 25% expected → ~2500. Allow ±150 variance.
    expect(inCount).toBeGreaterThan(2350)
    expect(inCount).toBeLessThan(2650)
  })

  it("is deterministic per user", () => {
    expect(inRollout("u1", "exp", 50)).toBe(inRollout("u1", "exp", 50))
  })
})
