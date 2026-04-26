/**
 * upstash-limiter tests. Authority: sub-plan 09 Task 8.
 *
 * Just verifies the env-gating + the fallback selector — actual Redis
 * behavior is exercised by the @upstash/ratelimit library.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { createUpstashLimiter, pickLimiter } from "@/lib/rate-limit/upstash-limiter"
import { TokenBucketLimiter } from "@/lib/rate-limit/limiter"

describe("createUpstashLimiter", () => {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
  })

  afterEach(() => {
    if (url) process.env.UPSTASH_REDIS_REST_URL = url
    if (token) process.env.UPSTASH_REDIS_REST_TOKEN = token
  })

  it("returns null when env vars are missing", () => {
    const lim = createUpstashLimiter({
      prefix: "test",
      capacity: 10,
      windowSec: 60,
    })
    expect(lim).toBeNull()
  })
})

describe("pickLimiter", () => {
  it("returns the fallback when Upstash is unconfigured", () => {
    const fallback = new TokenBucketLimiter({ capacity: 1, refillPerSec: 1 })
    const picked = pickLimiter(
      { prefix: "x", capacity: 1, windowSec: 60 },
      fallback,
    )
    expect(picked).toBe(fallback)
  })
})
