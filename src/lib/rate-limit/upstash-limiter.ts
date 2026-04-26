/**
 * Upstash-Redis-backed sliding-window limiter. Authority: sub-plan 09 Task 8/9.
 *
 * Same `RateLimitDecision` shape as TokenBucketLimiter, so middleware can
 * swap implementations without changing call sites.
 *
 * Configured via env:
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *
 * If either is missing, `createUpstashLimiter()` returns null and callers
 * fall back to the in-process TokenBucketLimiter.
 */

import { Redis } from "@upstash/redis"
import { Ratelimit } from "@upstash/ratelimit"
import type { RateLimitDecision } from "./limiter"

export interface UpstashLimiterConfig {
  /** Bucket name — distinguishes the keys in Redis. */
  prefix: string
  /** Tokens per window (capacity). */
  capacity: number
  /** Window length, in seconds. */
  windowSec: number
}

export interface RemoteLimiter {
  check(key: string): Promise<RateLimitDecision>
}

let cachedRedis: Redis | null = null

function getRedis(): Redis | null {
  if (cachedRedis) return cachedRedis
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  cachedRedis = new Redis({ url, token })
  return cachedRedis
}

export function createUpstashLimiter(
  cfg: UpstashLimiterConfig,
): RemoteLimiter | null {
  const redis = getRedis()
  if (!redis) return null

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(cfg.capacity, `${cfg.windowSec} s`),
    prefix: `polaris:${cfg.prefix}`,
    analytics: false,
  })

  return {
    async check(key: string): Promise<RateLimitDecision> {
      const r = await limiter.limit(key)
      const retryAfterSec = r.success
        ? 0
        : Math.max(1, Math.ceil((r.reset - Date.now()) / 1000))
      return {
        ok: r.success,
        remaining: r.remaining,
        retryAfterSec,
        capacity: cfg.capacity,
      }
    },
  }
}

/**
 * Pick the best limiter for a bucket: Upstash if configured, else fall back
 * to the in-memory limiter passed in. Both implement the same `check()`.
 */
export function pickLimiter<T extends { check: RemoteLimiter["check"] }>(
  cfg: UpstashLimiterConfig,
  fallback: T,
): T | RemoteLimiter {
  return createUpstashLimiter(cfg) ?? fallback
}
