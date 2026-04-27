/**
 * D-026 — plan-format round-trip tests.
 */

import { describe, it, expect } from "vitest"
import {
  serializePlan,
  parsePlan,
  planProgress,
  findFeature,
  type Plan,
} from "@/lib/specs/plan-format"

const sample: Plan = {
  title: "SilverNish — Custom Silver Jewellery Storefront",
  sprints: [
    {
      index: 1,
      name: "Foundation",
      features: [
        {
          id: "auth-clerk",
          title: "Wire Clerk for sign-up + sign-in",
          description: "Email + password; Google OAuth toggle later.",
          acceptanceCriteria: [
            "User can sign up with email",
            "Redirect to /dashboard after sign-in",
          ],
          status: "todo",
          priority: "p0",
          sprint: 1,
        },
        {
          id: "schema-products",
          title: "Convex schema for products table",
          description: "id, slug, name, price, weight, materials.",
          acceptanceCriteria: ["schema deploys", "products.list returns []"],
          status: "in_progress",
          priority: "p0",
          sprint: 1,
        },
      ],
    },
    {
      index: 2,
      name: "Catalog",
      features: [
        {
          id: "product-list",
          title: "/products page renders catalog",
          description: "",
          acceptanceCriteria: ["page renders", "0 console errors"],
          status: "done",
          priority: "p1",
          sprint: 2,
        },
      ],
    },
  ],
}

describe("plan-format — serialize → parse round-trip", () => {
  it("preserves title", () => {
    const md = serializePlan(sample)
    const parsed = parsePlan(md)
    expect(parsed.title).toBe(sample.title)
  })

  it("preserves sprint count + names", () => {
    const md = serializePlan(sample)
    const parsed = parsePlan(md)
    expect(parsed.sprints).toHaveLength(2)
    expect(parsed.sprints[0].name).toBe("Foundation")
    expect(parsed.sprints[1].name).toBe("Catalog")
  })

  it("preserves feature ids + titles + priorities", () => {
    const md = serializePlan(sample)
    const parsed = parsePlan(md)
    const f = findFeature(parsed, "auth-clerk")
    expect(f).toBeTruthy()
    expect(f!.title).toBe("Wire Clerk for sign-up + sign-in")
    expect(f!.priority).toBe("p0")
  })

  it("preserves status across all 4 states", () => {
    const md = serializePlan(sample)
    const parsed = parsePlan(md)
    expect(findFeature(parsed, "auth-clerk")!.status).toBe("todo")
    expect(findFeature(parsed, "schema-products")!.status).toBe("in_progress")
    expect(findFeature(parsed, "product-list")!.status).toBe("done")
  })

  it("preserves acceptance criteria", () => {
    const md = serializePlan(sample)
    const parsed = parsePlan(md)
    const f = findFeature(parsed, "schema-products")!
    expect(f.acceptanceCriteria).toEqual([
      "schema deploys",
      "products.list returns []",
    ])
  })

  it("preserves description when present", () => {
    const md = serializePlan(sample)
    const parsed = parsePlan(md)
    const f = findFeature(parsed, "auth-clerk")!
    expect(f.description).toMatch(/Email \+ password/)
  })

  it("planProgress counts done features correctly", () => {
    expect(planProgress(sample)).toEqual({ done: 1, total: 3 })
  })
})

describe("plan-format — graceful degradation", () => {
  it("handles plan with no acceptance criteria", () => {
    const minimal: Plan = {
      title: "x",
      sprints: [
        {
          index: 1,
          name: "s1",
          features: [
            {
              id: "f1",
              title: "First",
              description: "",
              acceptanceCriteria: [],
              status: "todo",
              priority: "p1",
              sprint: 1,
            },
          ],
        },
      ],
    }
    const md = serializePlan(minimal)
    const parsed = parsePlan(md)
    expect(parsed.sprints[0].features[0].acceptanceCriteria).toEqual([])
  })

  it("falls back to 'todo' on unknown checkbox char", () => {
    const md =
      "# t\n\n## Sprint 1: s\n\n- [?] f1: First [p1]\n      Description.\n"
    const parsed = parsePlan(md)
    expect(parsed.sprints[0]?.features[0]?.status).toBe("todo")
  })

  it("falls back to 'p1' when priority missing", () => {
    const md = "# t\n\n## Sprint 1: s\n\n- [ ] f1: First\n"
    const parsed = parsePlan(md)
    expect(parsed.sprints[0]?.features[0]?.priority).toBe("p1")
  })

  it("returns empty plan on empty input", () => {
    const parsed = parsePlan("")
    expect(parsed.sprints).toEqual([])
  })
})
