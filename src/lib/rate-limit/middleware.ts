/**
 * Rate-limit middleware for Next.js Route Handlers.
 *
 * Authority: CONSTITUTION §13.4. This thin wrapper picks the Upstash
 * limiter when env vars are configured (production) and falls back to
 * the in-process TokenBucketLimiter in dev / tests.
 *
 * Usage:
 *
 *   const decision = await applyRateLimit({
 *     userId,                                  // or IP for unauth routes
 *     bucket: "agentRun",
 *     plan: customer?.plan ?? "free",          // for per-tier multipliers
 *   });
 *   if (!decision.ok) {
 *     return new NextResponse(JSON.stringify({ error: "rate_limited" }), {
 *       status: 429,
 *       headers: { "Retry-After": String(decision.retryAfterSec) },
 *     });
 *   }
 */

import { NextResponse } from "next/server"

import {
  limiterConfigs,
  limiters,
  type RateLimitDecision,
} from "./limiter"
import { createUpstashLimiter } from "./upstash-limiter"

export type Bucket = keyof typeof limiters
type Plan = "free" | "pro" | "team"

// D-022 — per-tier multipliers applied on top of the Constitution §13.4
// base capacities. Free is the base; pro/team multiply.
const PLAN_MULTIPLIER: Record<Plan, number> = {
  free: 1,
  pro: 6, // 60/min instead of 10/min for agentRun, etc.
  team: 24,
}

/**
 * Lazy-cached per-(bucket, plan) Upstash limiters. We construct one
 * Ratelimit per tuple so the bucket capacity reflects the multiplier.
 */
const remoteCache = new Map<string, ReturnType<typeof createUpstashLimiter>>()

const remoteFor = (bucket: Bucket, plan: Plan) => {
  const key = `${bucket}:${plan}`
  if (remoteCache.has(key)) return remoteCache.get(key)!
  const cfg = limiterConfigs[bucket]
  const remote = createUpstashLimiter({
    prefix: `${cfg.prefix}:${plan}`,
    capacity: cfg.capacity * PLAN_MULTIPLIER[plan],
    windowSec: cfg.windowSec,
  })
  remoteCache.set(key, remote)
  return remote
}

export interface ApplyRateLimitArgs {
  userId: string
  bucket: Bucket
  plan?: Plan
}

export async function applyRateLimit({
  userId,
  bucket,
  plan = "free",
}: ApplyRateLimitArgs): Promise<RateLimitDecision> {
  const remote = remoteFor(bucket, plan)
  if (remote) {
    return remote.check(`${plan}:${userId}`)
  }
  // In-process fallback. Pro/team users get N parallel checks (cheap
  // approximation of multiplier — better than nothing in dev).
  const localCfg = limiterConfigs[bucket]
  const limiter = limiters[bucket]
  const mult = PLAN_MULTIPLIER[plan]
  let last: RateLimitDecision = {
    ok: false,
    remaining: 0,
    retryAfterSec: localCfg.windowSec,
    capacity: localCfg.capacity * mult,
  }
  for (let i = 0; i < mult; i++) {
    last = await limiter.check(`${plan}:${userId}`)
    if (last.ok) return last
  }
  return last
}

/**
 * Convenience: returns a 429 NextResponse with Retry-After when blocked,
 * or `null` when the request may proceed. Call sites:
 *
 *   const blocked = await rateLimitOr429({ userId, bucket: "agentRun" });
 *   if (blocked) return blocked;
 */
export async function rateLimitOr429(
  args: ApplyRateLimitArgs,
): Promise<NextResponse | null> {
  const decision = await applyRateLimit(args)
  if (decision.ok) return null
  return NextResponse.json(
    {
      error: "rate_limited",
      bucket: args.bucket,
      retryAfterSec: decision.retryAfterSec,
    },
    {
      status: 429,
      headers: { "Retry-After": String(decision.retryAfterSec) },
    },
  )
}
