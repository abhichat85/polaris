/**
 * Doc-gardener drift-detection tests. Pure function — no Convex.
 */

import { describe, it, expect } from "vitest"
import {
  detectDrift,
  renderDriftReport,
  type DriftInput,
} from "@/features/conversations/inngest/doc-garden-detect"

const NOW = 1_700_000_000_000
const DAY = 24 * 60 * 60 * 1000

const baseInput: DriftInput = {
  agentsMdContent:
    "# Polaris project\n\nThis project uses Next.js + Convex.\n\n## Conventions\n\n- Zod at API boundaries\n- Praxiom design tokens",
  notesMdContent: "Convex queries cache for 30s.",
  features: [],
  lastActivityAt: NOW - 5 * DAY,
  now: NOW,
}

describe("detectDrift — happy paths", () => {
  it("returns clean=true when everything is in shape", () => {
    const r = detectDrift(baseInput)
    expect(r.clean).toBe(true)
    expect(r.notices).toHaveLength(0)
  })
})

describe("detectDrift — missing docs", () => {
  it("flags missing AGENTS.md as a warning", () => {
    const r = detectDrift({ ...baseInput, agentsMdContent: null })
    expect(r.clean).toBe(false)
    const notice = r.notices.find((n) => n.id === "missing-agents-md")
    expect(notice?.severity).toBe("warning")
    expect(notice?.remediation).toMatch(/AGENTS\.md/)
  })

  it("flags too-short AGENTS.md as info", () => {
    const r = detectDrift({ ...baseInput, agentsMdContent: "# Project" })
    expect(r.notices.find((n) => n.id === "agents-md-too-short")?.severity).toBe(
      "info",
    )
  })

  it("flags missing notes.md as info (lower priority)", () => {
    const r = detectDrift({ ...baseInput, notesMdContent: null })
    expect(r.notices.find((n) => n.id === "missing-notes-md")?.severity).toBe(
      "info",
    )
  })
})

describe("detectDrift — stale features", () => {
  it("flags an in_progress feature older than 14 days", () => {
    const r = detectDrift({
      ...baseInput,
      features: [
        {
          id: "auth-clerk",
          status: "in_progress",
          updatedAt: NOW - 20 * DAY,
        },
      ],
    })
    const notice = r.notices.find((n) => n.id === "stale-feature:auth-clerk")
    expect(notice).toBeDefined()
    expect(notice?.severity).toBe("warning")
    expect(notice?.message).toMatch(/~20 days/)
  })

  it("does NOT flag in_progress features under the threshold", () => {
    const r = detectDrift({
      ...baseInput,
      features: [
        {
          id: "fresh-thing",
          status: "in_progress",
          updatedAt: NOW - 3 * DAY,
        },
      ],
    })
    expect(r.notices.find((n) => n.id === "stale-feature:fresh-thing")).toBeUndefined()
  })

  it("does NOT flag features in done/todo/blocked", () => {
    const r = detectDrift({
      ...baseInput,
      features: [
        { id: "a", status: "done", updatedAt: NOW - 30 * DAY },
        { id: "b", status: "todo", updatedAt: NOW - 30 * DAY },
        { id: "c", status: "blocked", updatedAt: NOW - 30 * DAY },
      ],
    })
    expect(r.clean).toBe(true)
  })

  it("falls back to lastActivityAt when feature has no updatedAt", () => {
    const r = detectDrift({
      ...baseInput,
      lastActivityAt: NOW - 30 * DAY,
      features: [{ id: "x", status: "in_progress" }],
    })
    expect(r.notices.find((n) => n.id === "stale-feature:x")).toBeDefined()
  })

  it("respects custom staleAfterMs", () => {
    const r = detectDrift({
      ...baseInput,
      staleAfterMs: 2 * DAY,
      features: [
        {
          id: "tight-window",
          status: "in_progress",
          updatedAt: NOW - 3 * DAY,
        },
      ],
    })
    expect(r.notices.find((n) => n.id === "stale-feature:tight-window")).toBeDefined()
  })
})

describe("renderDriftReport", () => {
  it("returns a clean banner when findings are empty", () => {
    const out = renderDriftReport({ clean: true, notices: [] })
    expect(out).toMatch(/no drift detected/i)
  })

  it("formats notices with severity emojis and remediation hints", () => {
    const out = renderDriftReport({
      clean: false,
      notices: [
        {
          severity: "warning",
          id: "x",
          message: "thing happened",
          remediation: "fix it",
        },
        { severity: "info", id: "y", message: "fyi" },
      ],
    })
    expect(out).toMatch(/⚠️ thing happened/)
    expect(out).toMatch(/→ fix it/)
    expect(out).toMatch(/ℹ️ fyi/)
    expect(out).toMatch(/paid tier/i)
  })
})
