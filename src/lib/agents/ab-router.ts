/**
 * A/B router — D-052 / Phase 4 (operational).
 *
 * Deterministic per-user bucketing for A/B experiments. Same user
 * always lands in the same bucket; different users distribute roughly
 * uniformly across `numBuckets`.
 *
 * Used today by the LLM task classifier rollout: a fraction of
 * pro/team users get the LLM classifier; everyone else stays on the
 * heuristic. Telemetry then compares outcomes across the cohorts.
 *
 * Why deterministic bucketing matters:
 *   - Same user gets a consistent experience within a session
 *   - Reproducible: same userId + experiment = same decision, so we
 *     can replay logs against a future cohort
 *   - No state needed: no Convex roundtrip per run, no random()
 */

import { createHash } from "node:crypto"

/**
 * Compute a bucket index in [0, numBuckets) for the given (userId,
 * experimentName) pair. Stable across processes, deployments, and
 * machine architectures.
 */
export function bucketFor(
  userId: string,
  experimentName: string,
  numBuckets: number,
): number {
  if (numBuckets <= 0) {
    throw new Error("numBuckets must be > 0")
  }
  // SHA-256 the (experiment, user) combination so different experiments
  // bucket users independently. Take 4 bytes → uint32 → modulo.
  const h = createHash("sha256")
  h.update(experimentName)
  h.update("\0")
  h.update(userId)
  const digest = h.digest()
  const u32 =
    (digest[0] << 24) | (digest[1] << 16) | (digest[2] << 8) | digest[3]
  // Use unsigned by AND-ing the sign bit off
  return (u32 >>> 0) % numBuckets
}

/**
 * True iff the user's bucket falls within the rollout percentage for
 * this experiment. Use this when a feature has a single "in" / "out"
 * decision (not a multi-variant test).
 *
 * Examples:
 *   inRollout("user1", "task_classifier_llm", 25) → 25% chance of true
 *   inRollout("user1", "task_classifier_llm", 100) → always true
 *   inRollout("user1", "task_classifier_llm", 0)   → always false
 */
export function inRollout(
  userId: string,
  experimentName: string,
  percentage: number,
): boolean {
  if (percentage <= 0) return false
  if (percentage >= 100) return true
  const bucket = bucketFor(userId, experimentName, 100)
  return bucket < percentage
}
