import { describe, it, expect } from "vitest"
import {
  FeatureSchema,
  FEATURE_STATUSES,
  FEATURE_PRIORITIES,
  isValidStatusTransition,
  newFeatureId,
  sortFeatures,
} from "@/features/specs/lib/feature-validation"

describe("FEATURE_STATUSES", () => {
  it("includes the four lifecycle states", () => {
    expect(FEATURE_STATUSES).toEqual(["todo", "in_progress", "done", "blocked"])
  })
})

describe("FEATURE_PRIORITIES", () => {
  it("includes p0/p1/p2", () => {
    expect(FEATURE_PRIORITIES).toEqual(["p0", "p1", "p2"])
  })
})

describe("FeatureSchema", () => {
  const valid = {
    id: "01HX0000000000000000000000",
    title: "User can sign in",
    description: "Email + password login that creates a Supabase session.",
    acceptanceCriteria: ["Login form renders", "Successful login redirects to /app"],
    status: "todo" as const,
    priority: "p0" as const,
  }

  it("accepts a fully valid feature", () => {
    expect(FeatureSchema.safeParse(valid).success).toBe(true)
  })

  it("rejects missing title", () => {
    expect(FeatureSchema.safeParse({ ...valid, title: "" }).success).toBe(false)
  })

  it("rejects empty acceptanceCriteria", () => {
    expect(
      FeatureSchema.safeParse({ ...valid, acceptanceCriteria: [] }).success,
    ).toBe(false)
  })

  it("rejects unknown status", () => {
    expect(
      FeatureSchema.safeParse({ ...valid, status: "shipped" as never }).success,
    ).toBe(false)
  })

  it("rejects unknown priority", () => {
    expect(
      FeatureSchema.safeParse({ ...valid, priority: "high" as never }).success,
    ).toBe(false)
  })

  it("accepts optional praxiomEvidenceIds", () => {
    expect(
      FeatureSchema.safeParse({ ...valid, praxiomEvidenceIds: ["evt_1", "evt_2"] }).success,
    ).toBe(true)
  })
})

describe("isValidStatusTransition", () => {
  it("allows todo → in_progress", () => {
    expect(isValidStatusTransition("todo", "in_progress")).toBe(true)
  })

  it("allows in_progress → done", () => {
    expect(isValidStatusTransition("in_progress", "done")).toBe(true)
  })

  it("allows in_progress → blocked", () => {
    expect(isValidStatusTransition("in_progress", "blocked")).toBe(true)
  })

  it("allows blocked → in_progress (unblock)", () => {
    expect(isValidStatusTransition("blocked", "in_progress")).toBe(true)
  })

  it("allows done → in_progress (regression)", () => {
    expect(isValidStatusTransition("done", "in_progress")).toBe(true)
  })

  it("forbids done → todo (must regress through in_progress)", () => {
    expect(isValidStatusTransition("done", "todo")).toBe(false)
  })

  it("forbids same-state transitions (no-op)", () => {
    expect(isValidStatusTransition("todo", "todo")).toBe(false)
  })

  it("forbids blocked → done (must unblock first)", () => {
    expect(isValidStatusTransition("blocked", "done")).toBe(false)
  })
})

describe("newFeatureId", () => {
  it("returns a 26-character ULID", () => {
    const id = newFeatureId()
    expect(id).toHaveLength(26)
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/) // Crockford base32 alphabet
  })

  it("returns unique ids on repeated calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => newFeatureId()))
    expect(ids.size).toBe(100)
  })

  it("returns ids that sort lexicographically by creation time", async () => {
    const a = newFeatureId()
    await new Promise((r) => setTimeout(r, 5))
    const b = newFeatureId()
    expect(a < b).toBe(true)
  })
})

describe("sortFeatures", () => {
  const f = (overrides: Partial<{ id: string; priority: "p0" | "p1" | "p2" }>) => ({
    id: "01HX0000000000000000000001",
    title: "x",
    description: "y",
    acceptanceCriteria: ["a"],
    status: "todo" as const,
    priority: "p1" as const,
    ...overrides,
  })

  it("sorts p0 before p1 before p2", () => {
    const sorted = sortFeatures([
      f({ priority: "p2", id: "01HX0000000000000000000003" }),
      f({ priority: "p0", id: "01HX0000000000000000000001" }),
      f({ priority: "p1", id: "01HX0000000000000000000002" }),
    ])
    expect(sorted.map((x) => x.priority)).toEqual(["p0", "p1", "p2"])
  })

  it("sorts by id (timestamp) within the same priority", () => {
    const sorted = sortFeatures([
      f({ priority: "p1", id: "01HX0000000000000000000002" }),
      f({ priority: "p1", id: "01HX0000000000000000000001" }),
    ])
    expect(sorted[0].id).toBe("01HX0000000000000000000001")
  })
})
