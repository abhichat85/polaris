/**
 * Rate-limiter tests. Authority: CONSTITUTION §13.4, sub-plan 09 Task 9.
 *
 * Token-bucket. Each bucket has a `capacity` and `refillPerSec`. Tests are
 * deterministic — we inject a clock instead of relying on Date.now().
 */

import { describe, it, expect } from "vitest"
import { TokenBucketLimiter } from "@/lib/rate-limit/limiter"

describe("TokenBucketLimiter", () => {
  it("admits up to capacity, then 429s", async () => {
    let now = 0
    const lim = new TokenBucketLimiter({
      capacity: 3,
      refillPerSec: 1,
      now: () => now,
    })
    expect((await lim.check("u1")).ok).toBe(true)
    expect((await lim.check("u1")).ok).toBe(true)
    expect((await lim.check("u1")).ok).toBe(true)
    const fourth = await lim.check("u1")
    expect(fourth.ok).toBe(false)
    expect(fourth.retryAfterSec).toBeGreaterThan(0)
  })

  it("refills tokens over time", async () => {
    let now = 0
    const lim = new TokenBucketLimiter({
      capacity: 2,
      refillPerSec: 1,
      now: () => now,
    })
    await lim.check("u")
    await lim.check("u")
    expect((await lim.check("u")).ok).toBe(false)
    now += 1000 // 1 second → 1 token refilled
    expect((await lim.check("u")).ok).toBe(true)
    expect((await lim.check("u")).ok).toBe(false)
  })

  it("isolates buckets by key", async () => {
    let now = 0
    const lim = new TokenBucketLimiter({
      capacity: 1,
      refillPerSec: 1,
      now: () => now,
    })
    expect((await lim.check("u1")).ok).toBe(true)
    expect((await lim.check("u2")).ok).toBe(true)
    expect((await lim.check("u1")).ok).toBe(false)
  })

  it("Retry-After is ceil seconds-until-next-token", async () => {
    let now = 0
    const lim = new TokenBucketLimiter({
      capacity: 1,
      refillPerSec: 0.5, // 1 token every 2s
      now: () => now,
    })
    await lim.check("u")
    const blocked = await lim.check("u")
    expect(blocked.ok).toBe(false)
    expect(blocked.retryAfterSec).toBe(2)
  })

  it("never exceeds capacity even after long idle", async () => {
    let now = 0
    const lim = new TokenBucketLimiter({
      capacity: 5,
      refillPerSec: 100,
      now: () => now,
    })
    now += 1_000_000 // big jump
    // Capacity should still be 5; verify by consuming exactly 5.
    for (let i = 0; i < 5; i++) {
      expect((await lim.check("u")).ok).toBe(true)
    }
    expect((await lim.check("u")).ok).toBe(false)
  })
})
