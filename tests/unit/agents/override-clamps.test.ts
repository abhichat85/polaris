/**
 * OverrideClamps — trust boundary for user-supplied overrides tests.
 */

import { describe, it, expect } from "vitest"
import {
  clampValue,
  applyOverrides,
  getDefaults,
  validateOverrides,
  DEFAULT_CLAMP_REGISTRY,
  type NumericClamp,
  type BooleanClamp,
  type ClampRegistry,
} from "@/lib/agent-kit/core/override-clamps"

// ---------------------------------------------------------------------------
// clampValue — numeric
// ---------------------------------------------------------------------------

describe("clampValue — numeric", () => {
  const numericDef: NumericClamp = {
    kind: "numeric",
    min: 1,
    max: 100,
    default: 50,
    step: 5,
  }

  it("returns default for undefined", () => {
    expect(clampValue(numericDef, undefined)).toBe(50)
  })

  it("returns default for null", () => {
    expect(clampValue(numericDef, null)).toBe(50)
  })

  it("returns default for a string value", () => {
    expect(clampValue(numericDef, "hello")).toBe(50)
  })

  it("returns default for NaN", () => {
    expect(clampValue(numericDef, NaN)).toBe(50)
  })

  it("returns default for Infinity", () => {
    expect(clampValue(numericDef, Infinity)).toBe(50)
  })

  it("returns default for -Infinity", () => {
    expect(clampValue(numericDef, -Infinity)).toBe(50)
  })

  it("returns default for an object", () => {
    expect(clampValue(numericDef, { value: 42 })).toBe(50)
  })

  it("clamps value below min to min", () => {
    expect(clampValue(numericDef, -10)).toBe(1)
  })

  it("clamps value above max to max", () => {
    expect(clampValue(numericDef, 999)).toBe(100) // step rounds: 100 is step-aligned from min=1
  })

  it("rounds value to nearest step", () => {
    // min=1, step=5: valid values are 1, 6, 11, 16, ..., 96
    // value 13 → (13-1)/5 = 2.4 → round(2.4)=2 → 2*5+1 = 11
    expect(clampValue(numericDef, 13)).toBe(11)
  })

  it("keeps value exactly on step boundary", () => {
    // 21: (21-1)/5 = 4.0 → round(4)=4 → 4*5+1 = 21
    expect(clampValue(numericDef, 21)).toBe(21)
  })

  it("clamps and rounds correctly at boundary", () => {
    // value 0 → clamp to 1 → (1-1)/5 = 0 → 0*5+1 = 1
    expect(clampValue(numericDef, 0)).toBe(1)
  })

  it("handles numeric clamp without step", () => {
    const noStep: NumericClamp = {
      kind: "numeric",
      min: 0,
      max: 1,
      default: 0.5,
    }
    expect(clampValue(noStep, 0.73)).toBe(0.73)
    expect(clampValue(noStep, -0.5)).toBe(0)
    expect(clampValue(noStep, 1.5)).toBe(1)
  })

  it("handles step rounding that could push past max", () => {
    const def: NumericClamp = {
      kind: "numeric",
      min: 0,
      max: 10,
      default: 5,
      step: 7,
    }
    // value 9 → clamp to 9 → (9-0)/7 = 1.286 → round = 1 → 1*7+0 = 7
    expect(clampValue(def, 9)).toBe(7)
    // value 10 → clamp to 10 → (10-0)/7 = 1.429 → round = 1 → 7
    // But wait, round(1.429)=1 → 7. If round(1.5)+ → 2 → 14 → re-clamp to 10
    expect(clampValue(def, 10)).toBe(7)
  })

  it("handles step=0 (treated as no step)", () => {
    const def: NumericClamp = {
      kind: "numeric",
      min: 0,
      max: 100,
      default: 50,
      step: 0,
    }
    expect(clampValue(def, 33)).toBe(33)
  })

  it("handles min === max", () => {
    const def: NumericClamp = {
      kind: "numeric",
      min: 42,
      max: 42,
      default: 42,
      step: 1,
    }
    expect(clampValue(def, 0)).toBe(42)
    expect(clampValue(def, 100)).toBe(42)
    expect(clampValue(def, 42)).toBe(42)
  })
})

// ---------------------------------------------------------------------------
// clampValue — boolean
// ---------------------------------------------------------------------------

describe("clampValue — boolean", () => {
  const boolDef: BooleanClamp = {
    kind: "boolean",
    default: false,
  }

  const adminBoolDef: BooleanClamp = {
    kind: "boolean",
    default: false,
    adminOnly: true,
  }

  it("returns true when value is true", () => {
    expect(clampValue(boolDef, true)).toBe(true)
  })

  it("returns false when value is false", () => {
    expect(clampValue(boolDef, false)).toBe(false)
  })

  it("returns default for undefined", () => {
    expect(clampValue(boolDef, undefined)).toBe(false)
  })

  it("returns default for null", () => {
    expect(clampValue(boolDef, null)).toBe(false)
  })

  it("returns default for a number", () => {
    expect(clampValue(boolDef, 1)).toBe(false)
  })

  it("returns default for a string", () => {
    expect(clampValue(boolDef, "true")).toBe(false)
  })

  it("adminOnly flag does not change clamping behavior", () => {
    // adminOnly is metadata for the caller, not enforced by clampValue
    expect(clampValue(adminBoolDef, true)).toBe(true)
    expect(clampValue(adminBoolDef, undefined)).toBe(false)
  })

  it("returns true default when default is true", () => {
    const trueDef: BooleanClamp = { kind: "boolean", default: true }
    expect(clampValue(trueDef, undefined)).toBe(true)
    expect(clampValue(trueDef, "garbage")).toBe(true)
    expect(clampValue(trueDef, false)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// applyOverrides
// ---------------------------------------------------------------------------

describe("applyOverrides", () => {
  it("applies valid overrides and clamps them", () => {
    const result = applyOverrides({
      "budget.maxIterations": 999,
      "healing.goodEnoughThreshold": 0.9,
      "verifier.enabled": false,
    })
    expect(result["budget.maxIterations"]).toBe(500) // clamped to max
    expect(result["healing.goodEnoughThreshold"]).toBe(0.9)
    expect(result["verifier.enabled"]).toBe(false)
  })

  it("silently drops unknown keys", () => {
    const result = applyOverrides({
      "unknown.param": 42,
      "budget.maxIterations": 10,
    })
    expect(result["unknown.param"]).toBeUndefined()
    expect(result["budget.maxIterations"]).toBe(10)
    expect(Object.keys(result)).toHaveLength(1)
  })

  it("handles empty overrides", () => {
    const result = applyOverrides({})
    expect(Object.keys(result)).toHaveLength(0)
  })

  it("applies overrides with mixed types (invalid types fall back to default)", () => {
    const result = applyOverrides({
      "budget.maxIterations": "not-a-number",
      "verifier.enabled": 42,
    })
    expect(result["budget.maxIterations"]).toBe(50) // default
    expect(result["verifier.enabled"]).toBe(true) // default
  })

  it("uses custom registry when provided", () => {
    const custom: ClampRegistry = {
      "my.param": { kind: "numeric", min: 0, max: 10, default: 5, step: 1 },
    }
    const result = applyOverrides({ "my.param": 7 }, custom)
    expect(result["my.param"]).toBe(7)
  })
})

// ---------------------------------------------------------------------------
// getDefaults
// ---------------------------------------------------------------------------

describe("getDefaults", () => {
  it("returns defaults for all keys in the default registry", () => {
    const defaults = getDefaults()
    expect(defaults["budget.maxIterations"]).toBe(50)
    expect(defaults["budget.maxTokens"]).toBe(150_000)
    expect(defaults["healing.goodEnoughThreshold"]).toBe(0.85)
    expect(defaults["verifier.enabled"]).toBe(true)
    expect(defaults["agent.autoCommit"]).toBe(false)
    expect(defaults["hitl.enabled"]).toBe(true)
  })

  it("has an entry for every key in the registry", () => {
    const defaults = getDefaults()
    const registryKeys = Object.keys(DEFAULT_CLAMP_REGISTRY)
    expect(Object.keys(defaults)).toHaveLength(registryKeys.length)
    for (const key of registryKeys) {
      expect(defaults).toHaveProperty(key)
    }
  })

  it("works with a custom registry", () => {
    const custom: ClampRegistry = {
      "foo.bar": { kind: "numeric", min: 0, max: 100, default: 42 },
      "foo.baz": { kind: "boolean", default: true },
    }
    const defaults = getDefaults(custom)
    expect(defaults).toEqual({ "foo.bar": 42, "foo.baz": true })
  })
})

// ---------------------------------------------------------------------------
// validateOverrides
// ---------------------------------------------------------------------------

describe("validateOverrides", () => {
  it("returns clamped values and no warnings for valid overrides", () => {
    const { clamped, warnings } = validateOverrides({
      "budget.maxIterations": 25,
      "verifier.enabled": false,
    })
    expect(clamped["budget.maxIterations"]).toBe(25)
    expect(clamped["verifier.enabled"]).toBe(false)
    expect(warnings).toHaveLength(0)
  })

  it("warns when numeric value is clamped", () => {
    const { clamped, warnings } = validateOverrides({
      "budget.maxIterations": 999,
    })
    expect(clamped["budget.maxIterations"]).toBe(500)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("budget.maxIterations")
    expect(warnings[0]).toContain("clamped from 999 to 500")
  })

  it("warns when numeric value is clamped below min", () => {
    const { clamped, warnings } = validateOverrides({
      "budget.maxIterations": -5,
    })
    expect(clamped["budget.maxIterations"]).toBe(1)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("clamped from -5 to 1")
  })

  it("warns about unknown parameters", () => {
    const { clamped, warnings } = validateOverrides({
      "nonexistent.key": 42,
    })
    expect(clamped["nonexistent.key"]).toBeUndefined()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("nonexistent.key")
    expect(warnings[0]).toContain("unknown parameter")
  })

  it("warns about invalid types for numeric", () => {
    const { clamped, warnings } = validateOverrides({
      "budget.maxIterations": "fast",
    })
    expect(clamped["budget.maxIterations"]).toBe(50) // default
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("invalid value")
    expect(warnings[0]).toContain("default 50")
  })

  it("warns about invalid types for boolean", () => {
    const { clamped, warnings } = validateOverrides({
      "verifier.enabled": "yes",
    })
    expect(clamped["verifier.enabled"]).toBe(true) // default
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("invalid value")
  })

  it("handles NaN as invalid numeric", () => {
    const { clamped, warnings } = validateOverrides({
      "budget.maxTokens": NaN,
    })
    expect(clamped["budget.maxTokens"]).toBe(150_000)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("invalid value")
  })

  it("handles Infinity as invalid numeric", () => {
    const { clamped, warnings } = validateOverrides({
      "budget.maxTokens": Infinity,
    })
    expect(clamped["budget.maxTokens"]).toBe(150_000)
    expect(warnings).toHaveLength(1)
  })

  it("produces multiple warnings for multiple issues", () => {
    const { warnings } = validateOverrides({
      "budget.maxIterations": 9999,
      "unknown.key": true,
      "verifier.enabled": 42,
    })
    expect(warnings).toHaveLength(3)
  })

  it("works with custom registry", () => {
    const custom: ClampRegistry = {
      "x": { kind: "numeric", min: 0, max: 10, default: 5 },
    }
    const { clamped, warnings } = validateOverrides({ "x": 20 }, custom)
    expect(clamped["x"]).toBe(10)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("clamped from 20 to 10")
  })

  it("step rounding produces a warning when value changes", () => {
    const { clamped, warnings } = validateOverrides({
      "budget.maxIterations": 23,
    })
    // step=1 so 23 stays 23 — no warning expected
    expect(clamped["budget.maxIterations"]).toBe(23)
    expect(warnings).toHaveLength(0)
  })

  it("step rounding on fractional step produces a warning", () => {
    const { clamped, warnings } = validateOverrides({
      "healing.goodEnoughThreshold": 0.87,
    })
    // step=0.05, min=0.5: (0.87-0.5)/0.05 = 7.4 → round = 7 → 7*0.05+0.5 = 0.85
    expect(clamped["healing.goodEnoughThreshold"]).toBe(0.85)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("clamped from 0.87 to 0.85")
  })
})

// ---------------------------------------------------------------------------
// DEFAULT_CLAMP_REGISTRY integrity
// ---------------------------------------------------------------------------

describe("DEFAULT_CLAMP_REGISTRY", () => {
  it("has all numeric defaults within their own [min, max]", () => {
    for (const [key, def] of Object.entries(DEFAULT_CLAMP_REGISTRY)) {
      if (def.kind === "numeric") {
        expect(def.default).toBeGreaterThanOrEqual(def.min)
        expect(def.default).toBeLessThanOrEqual(def.max)
        expect(def.min).toBeLessThanOrEqual(def.max)
        if (def.step !== undefined) {
          expect(def.step).toBeGreaterThan(0)
        }
      }
    }
  })

  it("has expected keys for all categories", () => {
    const keys = Object.keys(DEFAULT_CLAMP_REGISTRY)
    expect(keys.some(k => k.startsWith("budget."))).toBe(true)
    expect(keys.some(k => k.startsWith("healing."))).toBe(true)
    expect(keys.some(k => k.startsWith("verifier."))).toBe(true)
    expect(keys.some(k => k.startsWith("hitl."))).toBe(true)
    expect(keys.some(k => k.startsWith("agent."))).toBe(true)
    expect(keys.some(k => k.startsWith("compaction."))).toBe(true)
    expect(keys.some(k => k.startsWith("streamMonitor."))).toBe(true)
  })
})
