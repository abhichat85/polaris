/**
 * OverrideClamps — single trust boundary for user-supplied overrides.
 *
 * Every numeric or boolean parameter that a user can tune at runtime
 * passes through a clamp definition. This prevents:
 *   - Budget explosion (user sets maxIterations to 99999)
 *   - Threshold inversion (goodEnoughThreshold below hopelessThreshold)
 *   - Feature flags enabling destructive modes
 *
 * Authority: Praxiom Architecture §5 — "one function, one boundary."
 */

export interface NumericClamp {
  kind: "numeric"
  min: number
  max: number
  default: number
  /** Optional step size — values are rounded to nearest step. */
  step?: number
}

export interface BooleanClamp {
  kind: "boolean"
  default: boolean
  /** If true, only admins can override this value. */
  adminOnly?: boolean
}

export type ClampDef = NumericClamp | BooleanClamp

/**
 * Registry of all user-tunable parameters with their safe ranges.
 * Keys are dot-path parameter names (e.g. "budget.maxIterations").
 */
export type ClampRegistry = Record<string, ClampDef>

/**
 * The canonical clamp registry for Polaris agent parameters.
 * Every tunable knob must be registered here.
 */
export const DEFAULT_CLAMP_REGISTRY: ClampRegistry = {
  // Budget overrides
  "budget.maxIterations": { kind: "numeric", min: 1, max: 500, default: 50, step: 1 },
  "budget.maxTokens": { kind: "numeric", min: 10_000, max: 1_000_000, default: 150_000, step: 1000 },
  "budget.maxDurationMs": { kind: "numeric", min: 60_000, max: 7_200_000, default: 300_000, step: 60_000 },

  // Healing loop thresholds
  "healing.goodEnoughThreshold": { kind: "numeric", min: 0.5, max: 1.0, default: 0.85, step: 0.05 },
  "healing.minImprovement": { kind: "numeric", min: 0.01, max: 0.3, default: 0.05, step: 0.01 },
  "healing.hopelessThreshold": { kind: "numeric", min: 0.0, max: 0.5, default: 0.2, step: 0.05 },
  "healing.maxAttempts": { kind: "numeric", min: 1, max: 10, default: 3, step: 1 },

  // StreamMonitor config
  "streamMonitor.maxAlerts": { kind: "numeric", min: 1, max: 50, default: 10, step: 1 },

  // Compaction
  "compaction.threshold": { kind: "numeric", min: 20_000, max: 500_000, default: 100_000, step: 10_000 },

  // Verifier config
  "verifier.maxAutoFixAttempts": { kind: "numeric", min: 0, max: 10, default: 3, step: 1 },
  "verifier.maxBuildFixAttempts": { kind: "numeric", min: 0, max: 5, default: 2, step: 1 },
  "verifier.enabled": { kind: "boolean", default: true },
  "verifier.buildEnabled": { kind: "boolean", default: true },

  // HITL gate
  "hitl.enabled": { kind: "boolean", default: true },
  "hitl.timeoutMs": { kind: "numeric", min: 30_000, max: 1_800_000, default: 300_000, step: 30_000 },

  // Agent behavior flags
  "agent.extendedThinking": { kind: "boolean", default: false },
  "agent.autoCommit": { kind: "boolean", default: false, adminOnly: true },
}

/** Count decimal places in a number (for floating-point precision fix). */
function countDecimals(n: number): number {
  const s = String(n)
  const dot = s.indexOf(".")
  return dot === -1 ? 0 : s.length - dot - 1
}

/**
 * Clamp a single value to its registered range.
 * Returns the default if the value is undefined or the wrong type.
 * For numeric values: clamps to [min, max] and rounds to step if provided.
 * For boolean values: returns the value if boolean, default otherwise.
 */
export function clampValue(def: ClampDef, value: unknown): number | boolean {
  if (def.kind === "boolean") {
    if (typeof value === "boolean") return value
    return def.default
  }

  // Numeric clamp
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return def.default
  }

  // Clamp to [min, max]
  let clamped = Math.min(def.max, Math.max(def.min, value))

  // Round to step if provided
  if (def.step != null && def.step > 0) {
    clamped = Math.round((clamped - def.min) / def.step) * def.step + def.min
    // Fix IEEE 754 floating-point drift (e.g. 0.85 → 0.8500000000000001).
    // Round to the precision implied by the step size.
    const stepDecimals = countDecimals(def.step)
    const minDecimals = countDecimals(def.min)
    const precision = Math.max(stepDecimals, minDecimals)
    clamped = Number(clamped.toFixed(precision))
    // Re-clamp after rounding (step rounding could push past max)
    clamped = Math.min(def.max, Math.max(def.min, clamped))
  }

  return clamped
}

/**
 * Apply a bag of user overrides through the clamp registry.
 * Unknown keys are silently dropped.
 * Returns a new object with only valid, clamped values.
 */
export function applyOverrides(
  overrides: Record<string, unknown>,
  registry: ClampRegistry = DEFAULT_CLAMP_REGISTRY,
): Record<string, number | boolean> {
  const result: Record<string, number | boolean> = {}

  for (const key of Object.keys(overrides)) {
    const def = registry[key]
    if (!def) continue // unknown key — drop silently
    result[key] = clampValue(def, overrides[key])
  }

  return result
}

/**
 * Get the default values from the registry.
 */
export function getDefaults(
  registry: ClampRegistry = DEFAULT_CLAMP_REGISTRY,
): Record<string, number | boolean> {
  const result: Record<string, number | boolean> = {}

  for (const [key, def] of Object.entries(registry)) {
    result[key] = def.default
  }

  return result
}

/**
 * Validate overrides and return a list of warnings (e.g. "budget.maxIterations clamped from 999 to 500").
 * Does not mutate the input.
 */
export function validateOverrides(
  overrides: Record<string, unknown>,
  registry: ClampRegistry = DEFAULT_CLAMP_REGISTRY,
): { clamped: Record<string, number | boolean>; warnings: string[] } {
  const clamped: Record<string, number | boolean> = {}
  const warnings: string[] = []

  for (const key of Object.keys(overrides)) {
    const def = registry[key]
    if (!def) {
      warnings.push(`${key}: unknown parameter, ignored`)
      continue
    }

    const raw = overrides[key]
    const result = clampValue(def, raw)
    clamped[key] = result

    // Check if the value was changed during clamping
    if (def.kind === "numeric") {
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        warnings.push(`${key}: invalid value ${String(raw)}, using default ${def.default}`)
      } else if (raw !== result) {
        warnings.push(`${key}: clamped from ${raw} to ${result}`)
      }
    } else {
      // boolean
      if (typeof raw !== "boolean") {
        warnings.push(`${key}: invalid value ${String(raw)}, using default ${def.default}`)
      }
    }
  }

  return { clamped, warnings }
}
