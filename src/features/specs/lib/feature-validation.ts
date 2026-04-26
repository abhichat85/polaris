/**
 * Feature lifecycle: validation, status transitions, ULID id generator, sort.
 * Authority: sub-plan 05, CONSTITUTION §11.2 (ULID feature ids).
 *
 * Pure logic — no Convex dependency, fully unit-testable.
 */

import { z } from "zod"

export const FEATURE_STATUSES = ["todo", "in_progress", "done", "blocked"] as const
export type FeatureStatus = (typeof FEATURE_STATUSES)[number]

export const FEATURE_PRIORITIES = ["p0", "p1", "p2"] as const
export type FeaturePriority = (typeof FEATURE_PRIORITIES)[number]

export const FeatureSchema = z.object({
  id: z.string().length(26),
  title: z.string().min(1).max(120),
  description: z.string().max(2000),
  acceptanceCriteria: z.array(z.string().min(1).max(500)).min(1),
  status: z.enum(FEATURE_STATUSES),
  priority: z.enum(FEATURE_PRIORITIES),
  praxiomEvidenceIds: z.array(z.string()).optional(),
})

export type Feature = z.infer<typeof FeatureSchema>

/**
 * Allowed lifecycle transitions. Encoded as adjacency rather than a free
 * dropdown to enforce sensible workflows in the UI.
 *
 *   todo ──► in_progress ──► done
 *               ▲ │
 *               │ ▼
 *             blocked
 */
const TRANSITIONS: Record<FeatureStatus, FeatureStatus[]> = {
  todo: ["in_progress"],
  in_progress: ["todo", "done", "blocked"],
  blocked: ["in_progress"],
  done: ["in_progress"], // regression — must go back through in_progress
}

export function isValidStatusTransition(
  from: FeatureStatus,
  to: FeatureStatus,
): boolean {
  return TRANSITIONS[from].includes(to)
}

// ── ULID generator ────────────────────────────────────────────────────────────
// Crockford base32 alphabet (no I, L, O, U — avoids visual ambiguity).
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
const ENCODING_LEN = 10
const RANDOM_LEN = 16

function encodeTime(now: number, len: number): string {
  let out = ""
  let n = now
  for (let i = len - 1; i >= 0; i--) {
    const mod = n % 32
    out = ALPHABET[mod] + out
    n = (n - mod) / 32
  }
  return out
}

function encodeRandom(len: number): string {
  // crypto.getRandomValues is available in Node 18+ and the browser.
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  let out = ""
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % 32]
  return out
}

let lastTime = -1
let lastRandom = ""

/** Returns a 26-char ULID — strictly increasing under same-millisecond calls. */
export function newFeatureId(now: number = Date.now()): string {
  if (now === lastTime) {
    // Bump the random suffix monotonically so two ids in the same ms still sort.
    const next = bumpRandom(lastRandom)
    lastRandom = next
    return encodeTime(now, ENCODING_LEN) + next
  }
  lastTime = now
  lastRandom = encodeRandom(RANDOM_LEN)
  return encodeTime(now, ENCODING_LEN) + lastRandom
}

function bumpRandom(s: string): string {
  // Increment the base32 string by 1 (LSB at the end).
  const arr = s.split("")
  for (let i = arr.length - 1; i >= 0; i--) {
    const idx = ALPHABET.indexOf(arr[i])
    if (idx < 31) {
      arr[i] = ALPHABET[idx + 1]
      return arr.join("")
    }
    arr[i] = "0"
  }
  // Overflow: regenerate (vanishingly rare)
  return encodeRandom(RANDOM_LEN)
}

// ── Sort ──────────────────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<FeaturePriority, number> = { p0: 0, p1: 1, p2: 2 }

/** Sort by (priority asc, id asc). ID asc ≡ creation-time asc due to ULID. */
export function sortFeatures<T extends Pick<Feature, "id" | "priority">>(features: T[]): T[] {
  return [...features].sort((a, b) => {
    const dp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    if (dp !== 0) return dp
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}
