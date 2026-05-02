/**
 * Warm sandbox pool replenisher — Phase 3.1.
 *
 * Inngest cron that runs every 60 seconds to keep the warm pool at
 * the target size. Behaviour:
 *
 *   1. Compute a dynamic target: `f(active users in last 5min)`. The
 *      static env var POLARIS_WARM_POOL_TARGET acts as a CEILING and
 *      a default; live load shrinks the target when traffic is low so
 *      we don't burn E2B minutes for absent users.
 *   2. Rotate any unclaimed sandbox older than maxAgeMs out of the pool
 *      (kill the actual sandbox, delete the row).
 *   3. Count remaining unclaimed sandboxes.
 *   4. Spin up `target - current` fresh sandboxes (capped per tick).
 *
 * Sizing formula (when POLARIS_WARM_POOL_AUTOSCALE is enabled):
 *   target = clamp(ceil(active_5min * RATIO) + BASELINE, 0, CEILING)
 *
 * Defaults: RATIO=0.3 (30% of active users get a warm sandbox),
 * BASELINE=2 (always keep 2 warm so first-of-day users hit fast),
 * CEILING=POLARIS_WARM_POOL_TARGET (the env var becomes the cap).
 *
 * Env vars:
 *   - POLARIS_WARM_POOL_TARGET     — pool ceiling / fixed target (default 0)
 *   - POLARIS_WARM_POOL_AUTOSCALE  — "true" to enable load-based sizing
 *   - POLARIS_WARM_POOL_BASELINE   — minimum target when autoscaling (default 2)
 *   - POLARIS_WARM_POOL_RATIO      — fraction of active users (default 0.3)
 *   - POLARIS_WARM_POOL_MAX_AGE_MS — rotate after this age (default 20m)
 *   - POLARIS_WARM_POOL_PER_TICK   — max spins per tick (default 2)
 *
 * Setting POLARIS_WARM_POOL_TARGET=0 disables the pool entirely
 * (autoscale or not — the ceiling clamps to 0).
 */

import { ConvexHttpClient } from "convex/browser"
import { NonRetriableError } from "inngest"
import { inngest } from "@/inngest/client"
import { api } from "../../../../convex/_generated/api"
import { getSandboxProvider } from "@/lib/sandbox"

const DEFAULT_MAX_AGE_MS = 20 * 60_000 // 20 minutes
const DEFAULT_PER_TICK = 2
const PROVISION_TIMEOUT_MS = 24 * 60 * 60_000 // 24h E2B default

export const warmPoolReplenisher = inngest.createFunction(
  {
    id: "warm-pool-replenisher",
    name: "Warm Sandbox Pool Replenisher",
    retries: 0,
  },
  // Every 60s — short cadence so the pool stays close to target.
  { cron: "* * * * *" },
  async ({ step }) => {
    const ceiling = Number(process.env.POLARIS_WARM_POOL_TARGET ?? 0)
    if (!Number.isFinite(ceiling) || ceiling <= 0) {
      return { skipped: "pool disabled (POLARIS_WARM_POOL_TARGET=0 or unset)" }
    }

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY
    if (!convexUrl || !internalKey) {
      throw new NonRetriableError(
        "NEXT_PUBLIC_CONVEX_URL + POLARIS_CONVEX_INTERNAL_KEY required.",
      )
    }
    const convex = new ConvexHttpClient(convexUrl)
    const sandbox = getSandboxProvider()

    const maxAgeMs = Number(
      process.env.POLARIS_WARM_POOL_MAX_AGE_MS ?? DEFAULT_MAX_AGE_MS,
    )
    const perTick = Math.max(
      1,
      Math.min(
        10,
        Number(process.env.POLARIS_WARM_POOL_PER_TICK ?? DEFAULT_PER_TICK),
      ),
    )

    // ── Dynamic target sizing ────────────────────────────────────────────
    // When autoscale is on, compute the target from recent activity rather
    // than always using the ceiling. This is the difference between
    // "always have 5 warm" (cost: 5 sandboxes 24/7) and "have warm
    // sandboxes proportional to who's actually using the product".
    const autoscale = process.env.POLARIS_WARM_POOL_AUTOSCALE === "true"
    const targetSize = await (async () => {
      if (!autoscale) return ceiling
      const baseline = Number(
        process.env.POLARIS_WARM_POOL_BASELINE ?? 2,
      )
      const ratio = Number(process.env.POLARIS_WARM_POOL_RATIO ?? 0.3)
      const fiveMinAgo = Date.now() - 5 * 60_000
      const activeUsers = await step.run("count-active-users", async () => {
        try {
          const ids = await convex.query(
            api.harness_telemetry.getActiveUsersSinceInternal,
            { internalKey, sinceMs: fiveMinAgo },
          )
          return ids?.length ?? 0
        } catch {
          // On query failure, fall back to ceiling (safe over-provision).
          return ceiling
        }
      })
      const desired = Math.ceil(activeUsers * ratio) + baseline
      return Math.max(0, Math.min(ceiling, desired))
    })()

    if (targetSize === 0) {
      return { skipped: "autoscale target=0 (no recent activity)" }
    }

    // ── 1. Rotate stale sandboxes out of the pool ────────────────────────
    const expired = await step.run("list-expired", async () =>
      convex.query(api.warm_sandboxes.rotateExpiredInternal, {
        internalKey,
        maxAgeMs,
      }),
    )
    let rotated = 0
    for (const row of expired ?? []) {
      try {
        await step.run(`kill-${row.sandboxId}`, async () => {
          await sandbox.kill(row.sandboxId).catch(() => {
            /* sandbox might already be gone; that's fine */
          })
          await convex.mutation(api.warm_sandboxes.removeInternal, {
            internalKey,
            sandboxId: row.sandboxId,
          })
        })
        rotated++
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[warm-pool] rotate failed for ${row.sandboxId}:`, err)
      }
    }

    // ── 2. Count current idle pool size ──────────────────────────────────
    const idle = await step.run("count-idle", async () =>
      convex.query(api.warm_sandboxes.listIdleInternal, {
        internalKey,
        template: "nextjs",
      }),
    )
    const currentSize = (idle ?? []).length
    const deficit = Math.max(0, targetSize - currentSize)
    const toProvision = Math.min(deficit, perTick)

    // ── 3. Provision fresh sandboxes ─────────────────────────────────────
    let provisioned = 0
    for (let i = 0; i < toProvision; i++) {
      try {
        await step.run(`provision-${i}`, async () => {
          const handle = await sandbox.create("nextjs", {
            timeoutMs: PROVISION_TIMEOUT_MS,
          })
          await convex.mutation(api.warm_sandboxes.addInternal, {
            internalKey,
            sandboxId: handle.id,
            template: "nextjs",
          })
        })
        provisioned++
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[warm-pool] provision failed:`, err)
        // Keep going — partial fills are better than none.
      }
    }

    return {
      target: targetSize,
      ceiling,
      autoscale,
      currentBefore: currentSize,
      rotated,
      provisioned,
      deficit,
    }
  },
)
