/**
 * Tests for plan tools — Phase 3.3.
 */
import { describe, expect, it, vi } from "vitest"
import {
  ClarificationBudget,
  executeReadPlan,
  executeRequestPlannerInput,
  executeUpdateFeatureStatus,
  type PlanRecord,
  type PlanToolsDeps,
} from "@/lib/tools/plan-tools"

const samplePlan: PlanRecord = {
  _id: "p1",
  projectId: "proj1",
  title: "Build the todo app",
  features: [
    {
      id: "f1",
      title: "Add a list view",
      description: "Show all todos",
      acceptanceCriteria: ["renders list", "empty state shown"],
      dependencies: [],
      status: "done",
    },
    {
      id: "f2",
      title: "Add a create form",
      description: "User can add new todos",
      acceptanceCriteria: ["form works", "validates input"],
      dependencies: ["f1"],
      status: "in_progress",
    },
    {
      id: "f3",
      title: "Add filtering",
      description: "Filter by completed/active",
      acceptanceCriteria: ["filters work"],
      dependencies: ["f1", "f2"],
      status: "pending",
    },
  ],
  createdAt: 1,
  updatedAt: 2,
}

function makeDeps(overrides: Partial<PlanToolsDeps> = {}): PlanToolsDeps {
  return {
    getPlan: async () => samplePlan,
    updateFeatureStatus: vi.fn(async () => {}),
    ...overrides,
  }
}

describe("executeReadPlan", () => {
  it("returns null plan when none exists", async () => {
    const deps = makeDeps({ getPlan: async () => null })
    const r = await executeReadPlan({}, deps)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect((r.data as { plan: unknown }).plan).toBeNull()
    }
  })

  it("returns all features by default", async () => {
    const deps = makeDeps()
    const r = await executeReadPlan({}, deps)
    if (r.ok) {
      expect((r.data as { features: unknown[] }).features).toHaveLength(3)
    }
  })

  it("filters out done features when pendingOnly=true", async () => {
    const deps = makeDeps()
    const r = await executeReadPlan({ pendingOnly: true }, deps)
    if (r.ok) {
      const features = (r.data as { features: { id: string }[] }).features
      expect(features).toHaveLength(2)
      expect(features.every((f) => f.id !== "f1")).toBe(true)
    }
  })

  it("formats plan as readable Markdown", async () => {
    const deps = makeDeps()
    const r = await executeReadPlan({}, deps)
    if (r.ok) {
      const formatted = (r.data as { formatted: string }).formatted
      expect(formatted).toContain("Build the todo app")
      expect(formatted).toContain("Add a list view")
      expect(formatted).toContain("[done]")
      expect(formatted).toContain("[in_progress]")
      expect(formatted).toContain("Acceptance:")
      expect(formatted).toContain("Depends on: f1")
    }
  })
})

describe("executeUpdateFeatureStatus", () => {
  it("rejects empty featureId", async () => {
    const deps = makeDeps()
    const r = await executeUpdateFeatureStatus(
      { featureId: "", status: "done" },
      deps,
    )
    expect(r.ok).toBe(false)
  })

  it("requires blocker when status=blocked", async () => {
    const deps = makeDeps()
    const r = await executeUpdateFeatureStatus(
      { featureId: "f1", status: "blocked" },
      deps,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/blocker/i)
  })

  it("accepts blocker when status=blocked", async () => {
    const update = vi.fn(async () => {})
    const deps = makeDeps({ updateFeatureStatus: update })
    const r = await executeUpdateFeatureStatus(
      { featureId: "f1", status: "blocked", blocker: "missing API key" },
      deps,
    )
    expect(r.ok).toBe(true)
    expect(update).toHaveBeenCalledWith({
      featureId: "f1",
      status: "blocked",
      blocker: "missing API key",
    })
  })

  it("forwards non-blocked statuses unchanged", async () => {
    const update = vi.fn(async () => {})
    const deps = makeDeps({ updateFeatureStatus: update })
    const r = await executeUpdateFeatureStatus(
      { featureId: "f2", status: "done" },
      deps,
    )
    expect(r.ok).toBe(true)
    expect(update).toHaveBeenCalledWith({
      featureId: "f2",
      status: "done",
      blocker: undefined,
    })
  })

  it("wraps deps errors as INTERNAL_ERROR", async () => {
    const deps = makeDeps({
      updateFeatureStatus: async () => {
        throw new Error("convex died")
      },
    })
    const r = await executeUpdateFeatureStatus(
      { featureId: "f1", status: "done" },
      deps,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe("INTERNAL_ERROR")
  })
})

describe("ClarificationBudget", () => {
  it("starts with full budget", () => {
    const b = new ClarificationBudget(3)
    expect(b.remaining()).toBe(3)
  })

  it("consume() decrements and returns true while available", () => {
    const b = new ClarificationBudget(2)
    expect(b.consume()).toBe(true)
    expect(b.remaining()).toBe(1)
    expect(b.consume()).toBe(true)
    expect(b.remaining()).toBe(0)
  })

  it("consume() returns false when exhausted", () => {
    const b = new ClarificationBudget(1)
    expect(b.consume()).toBe(true)
    expect(b.consume()).toBe(false)
    expect(b.remaining()).toBe(0)
  })
})

describe("executeRequestPlannerInput", () => {
  it("rejects when planner not configured", async () => {
    const deps = makeDeps({ requestPlannerInput: undefined })
    const budget = new ClarificationBudget()
    const r = await executeRequestPlannerInput(
      { question: "ok?" },
      deps,
      budget,
    )
    expect(r.ok).toBe(false)
  })

  it("rejects empty question", async () => {
    const deps = makeDeps({ requestPlannerInput: async () => ({ answer: "x" }) })
    const r = await executeRequestPlannerInput(
      { question: "" },
      deps,
      new ClarificationBudget(),
    )
    expect(r.ok).toBe(false)
  })

  it("returns answer on successful round-trip", async () => {
    const deps = makeDeps({
      requestPlannerInput: async () => ({ answer: "use a modal" }),
    })
    const r = await executeRequestPlannerInput(
      { question: "modal or page?" },
      deps,
      new ClarificationBudget(),
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect((r.data as { answer: string }).answer).toBe("use a modal")
    }
  })

  it("returns ok with timedOut flag when planner doesn't answer", async () => {
    const deps = makeDeps({
      requestPlannerInput: async () => ({ timedOut: true }),
    })
    const r = await executeRequestPlannerInput(
      { question: "x" },
      deps,
      new ClarificationBudget(),
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect((r.data as { timedOut: boolean }).timedOut).toBe(true)
    }
  })

  it("blocks further calls after budget exhausted", async () => {
    const deps = makeDeps({
      requestPlannerInput: vi.fn(async () => ({ answer: "x" })),
    })
    const budget = new ClarificationBudget(1)
    await executeRequestPlannerInput({ question: "q1" }, deps, budget)
    const second = await executeRequestPlannerInput(
      { question: "q2" },
      deps,
      budget,
    )
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.error).toMatch(/budget/i)
    // requestPlannerInput should only have been called once.
    expect(deps.requestPlannerInput).toHaveBeenCalledTimes(1)
  })

  it("clamps timeout to hard max (5min)", async () => {
    const captured: { timeoutMs: number }[] = []
    const deps = makeDeps({
      requestPlannerInput: async (args) => {
        captured.push(args)
        return { answer: "ok" }
      },
    })
    await executeRequestPlannerInput(
      { question: "q", timeoutMs: 99_999_999 },
      deps,
      new ClarificationBudget(),
    )
    expect(captured[0].timeoutMs).toBeLessThanOrEqual(5 * 60_000)
  })
})
