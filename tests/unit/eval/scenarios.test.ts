/**
 * Unit-level integrity test for the v2 eval scenario registry.
 *
 * Doesn't BOOT the scenarios — that's the live harness in `pnpm test:eval:real`.
 * Just asserts the registry is well-formed: 8 scenarios, unique ids,
 * non-empty prompts, every scenario has at least one assertion, every
 * assertion has a unique-within-scenario id.
 */

import { describe, it, expect } from "vitest"
import { ALL_SCENARIOS, getScenario } from "@/../tests/eval/v2/scenarios/index"

describe("v2 eval scenario registry — D-048", () => {
  it("exposes exactly 8 scenarios", () => {
    expect(ALL_SCENARIOS).toHaveLength(8)
  })

  it("scenario ids are unique", () => {
    const ids = ALL_SCENARIOS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("ids match the kebab-case prefix convention NN-name", () => {
    for (const s of ALL_SCENARIOS) {
      expect(s.id).toMatch(/^\d{2}-[a-z0-9-]+$/)
    }
  })

  it("each scenario has a non-empty prompt and title", () => {
    for (const s of ALL_SCENARIOS) {
      expect(s.prompt.length, s.id).toBeGreaterThan(20)
      expect(s.title.length, s.id).toBeGreaterThan(5)
    }
  })

  it("each scenario has a sensible budget (positive numbers)", () => {
    for (const s of ALL_SCENARIOS) {
      expect(s.budget.maxIterations, s.id).toBeGreaterThan(0)
      expect(s.budget.maxTokens, s.id).toBeGreaterThan(0)
      expect(s.budget.maxWallClockMs, s.id).toBeGreaterThan(0)
    }
  })

  it("each scenario has at least 2 postBuild assertions", () => {
    for (const s of ALL_SCENARIOS) {
      expect(s.postBuild.length, `scenario ${s.id} only has ${s.postBuild.length} assertions`).toBeGreaterThanOrEqual(2)
    }
  })

  it("assertion ids are unique within each scenario", () => {
    for (const s of ALL_SCENARIOS) {
      const aIds = s.postBuild.map((a) => a.id)
      expect(new Set(aIds).size, `scenario ${s.id}`).toBe(aIds.length)
    }
  })

  it("getScenario(id) round-trips", () => {
    for (const s of ALL_SCENARIOS) {
      expect(getScenario(s.id)?.id).toBe(s.id)
    }
    expect(getScenario("nonexistent")).toBeUndefined()
  })

  it("scenarios are listed in canonical order (01 → 08)", () => {
    const ids = ALL_SCENARIOS.map((s) => s.id)
    const expected = [
      "01-static-marketing-page",
      "02-auth-flow",
      "03-product-list-cart",
      "04-form-validation",
      "05-dark-light-toggle",
      "06-fix-runtime-bug",
      "07-image-to-ui",
      "08-fullstack-todo",
    ]
    expect(ids).toEqual(expected)
  })
})
