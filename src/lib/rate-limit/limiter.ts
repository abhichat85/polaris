/**
 * Token-bucket rate limiter. Authority: CONSTITUTION §13.4, sub-plan 09 Task 9.
 *
 * In-process, in-memory implementation with a pluggable clock for tests.
 * In production this can be swapped for an Upstash Redis-backed limiter
 * (same interface). The middleware constructs one limiter per bucket type
 * and threads `userId` (or IP) as the key.
 */

export interface RateLimitDecision {
  ok: boolean
  remaining: number
  retryAfterSec: number
  capacity: number
}

export interface LimiterConfig {
  capacity: number
  refillPerSec: number
  /** Optional clock for tests; defaults to Date.now. */
  now?: () => number
}

interface BucketState {
  tokens: number
  lastRefill: number
}

export class TokenBucketLimiter {
  private readonly state = new Map<string, BucketState>()
  private readonly cfg: Required<LimiterConfig>

  constructor(cfg: LimiterConfig) {
    this.cfg = {
      capacity: cfg.capacity,
      refillPerSec: cfg.refillPerSec,
      now: cfg.now ?? Date.now,
    }
  }

  async check(key: string): Promise<RateLimitDecision> {
    const now = this.cfg.now()
    const cur = this.state.get(key) ?? {
      tokens: this.cfg.capacity,
      lastRefill: now,
    }

    // Refill since last check.
    const elapsedMs = now - cur.lastRefill
    if (elapsedMs > 0) {
      const refill = (elapsedMs / 1000) * this.cfg.refillPerSec
      cur.tokens = Math.min(this.cfg.capacity, cur.tokens + refill)
      cur.lastRefill = now
    }

    if (cur.tokens >= 1) {
      cur.tokens -= 1
      this.state.set(key, cur)
      return {
        ok: true,
        remaining: Math.floor(cur.tokens),
        retryAfterSec: 0,
        capacity: this.cfg.capacity,
      }
    }

    // Insufficient tokens.
    const needed = 1 - cur.tokens
    const retryAfterSec = Math.ceil(needed / this.cfg.refillPerSec)
    this.state.set(key, cur)
    return {
      ok: false,
      remaining: 0,
      retryAfterSec,
      capacity: this.cfg.capacity,
    }
  }
}

/** Five canonical buckets per CONSTITUTION §13.4. Tunable via env later. */
export const limiters = {
  httpGlobal: new TokenBucketLimiter({ capacity: 60, refillPerSec: 1 }), // 60/min
  agentRun: new TokenBucketLimiter({ capacity: 5, refillPerSec: 5 / 60 }), // 5/min
  scaffold: new TokenBucketLimiter({ capacity: 3, refillPerSec: 3 / 60 }), // 3/min
  deploy: new TokenBucketLimiter({ capacity: 2, refillPerSec: 2 / 60 }), // 2/min
  githubPush: new TokenBucketLimiter({ capacity: 5, refillPerSec: 5 / 60 }),
}
