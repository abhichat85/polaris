import { describe, it, expect } from "vitest"
import {
  STARTER_PROMPTS,
  findStarterPromptById,
} from "@/features/onboarding/lib/starter-prompt-catalog"

describe("STARTER_PROMPTS", () => {
  it("ships exactly three hand-picked prompts", () => {
    expect(STARTER_PROMPTS).toHaveLength(3)
  })

  it("each prompt has every required field", () => {
    for (const p of STARTER_PROMPTS) {
      expect(p.id).toMatch(/^[a-z0-9-]+$/)
      expect(p.title.length).toBeGreaterThan(0)
      expect(p.blurb.length).toBeGreaterThan(20)
      expect(p.icon.length).toBeGreaterThan(0)
      expect(p.prompt.length).toBeGreaterThan(80)
    }
  })

  it("ids are unique", () => {
    const ids = new Set(STARTER_PROMPTS.map((p) => p.id))
    expect(ids.size).toBe(STARTER_PROMPTS.length)
  })

  it("findStarterPromptById returns the matching entry", () => {
    expect(findStarterPromptById("saas-landing")?.title).toMatch(/saas/i)
    expect(findStarterPromptById("nope")).toBeUndefined()
  })
})
