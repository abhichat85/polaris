import { describe, it, expect } from "vitest"
import { PATTERNS, PATTERNS_AGENTS_MD_FRAGMENT } from "@/lib/scaffold/patterns"

describe("scaffold patterns library — D-042", () => {
  it("exports 6 canonical patterns", () => {
    expect(PATTERNS).toHaveLength(6)
  })

  it("each pattern has filename, label, and non-empty content", () => {
    for (const p of PATTERNS) {
      expect(p.filename).toMatch(/^[a-z-]+\.tsx$/)
      expect(p.label).toBeTruthy()
      expect(p.content.length).toBeGreaterThan(200)
    }
  })

  it("each pattern's content references Praxiom tokens in its header", () => {
    for (const p of PATTERNS) {
      expect(p.content).toMatch(/Praxiom/i)
      expect(p.content).toMatch(/Tokens used/i)
    }
  })

  it("each pattern starts with a 'use client' directive (all are client components)", () => {
    for (const p of PATTERNS) {
      expect(p.content).toContain('"use client"')
    }
  })

  it("filenames are unique", () => {
    const names = PATTERNS.map((p) => p.filename)
    expect(new Set(names).size).toBe(names.length)
  })

  it("AGENTS.md fragment lists every pattern's filename", () => {
    for (const p of PATTERNS) {
      expect(PATTERNS_AGENTS_MD_FRAGMENT).toContain(p.filename)
      expect(PATTERNS_AGENTS_MD_FRAGMENT).toContain(p.label)
    }
  })

  it("AGENTS.md fragment is reasonably sized (not bloating the prompt)", () => {
    // Goal: < 1500 chars so it stays under ~400 tokens
    expect(PATTERNS_AGENTS_MD_FRAGMENT.length).toBeLessThan(1500)
  })

  it("expected pattern names cover the canonical surfaces", () => {
    const names = PATTERNS.map((p) => p.filename)
    expect(names).toContain("auth-form.tsx")
    expect(names).toContain("data-table.tsx")
    expect(names).toContain("dashboard-cards.tsx")
    expect(names).toContain("settings-page.tsx")
    expect(names).toContain("empty-state.tsx")
    expect(names).toContain("data-fetch-page.tsx")
  })
})
