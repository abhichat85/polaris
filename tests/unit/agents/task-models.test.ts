import { describe, it, expect } from "vitest"
import {
  resolveTaskModel,
  applyTierGate,
  CLAUDE_OPUS_4_7,
  CLAUDE_SONNET_4_6,
  CLAUDE_HAIKU_4_5,
} from "@/lib/agents/task-models"

describe("resolveTaskModel", () => {
  it("planner → Opus", () => {
    expect(resolveTaskModel({ role: "planner" })).toBe(CLAUDE_OPUS_4_7)
  })

  it("evaluator → Opus", () => {
    expect(resolveTaskModel({ role: "evaluator" })).toBe(CLAUDE_OPUS_4_7)
  })

  it("compactor → Haiku", () => {
    expect(resolveTaskModel({ role: "compactor" })).toBe(CLAUDE_HAIKU_4_5)
  })

  it("executor + trivial → Haiku", () => {
    expect(resolveTaskModel({ role: "executor", taskClass: "trivial" })).toBe(CLAUDE_HAIKU_4_5)
  })

  it("executor + standard → Sonnet", () => {
    expect(resolveTaskModel({ role: "executor", taskClass: "standard" })).toBe(CLAUDE_SONNET_4_6)
  })

  it("executor + hard → Opus", () => {
    expect(resolveTaskModel({ role: "executor", taskClass: "hard" })).toBe(CLAUDE_OPUS_4_7)
  })

  it("executor without taskClass → Sonnet (defensive default)", () => {
    expect(resolveTaskModel({ role: "executor" })).toBe(CLAUDE_SONNET_4_6)
  })
})

describe("applyTierGate", () => {
  it("free locks executor to Sonnet regardless of resolved Opus", () => {
    expect(applyTierGate("free", CLAUDE_OPUS_4_7, "executor")).toBe(CLAUDE_SONNET_4_6)
  })

  it("free locks executor to Sonnet regardless of resolved Haiku", () => {
    expect(applyTierGate("free", CLAUDE_HAIKU_4_5, "executor")).toBe(CLAUDE_SONNET_4_6)
  })

  it("free locks planner/evaluator to Sonnet too", () => {
    expect(applyTierGate("free", CLAUDE_OPUS_4_7, "planner")).toBe(CLAUDE_SONNET_4_6)
    expect(applyTierGate("free", CLAUDE_OPUS_4_7, "evaluator")).toBe(CLAUDE_SONNET_4_6)
  })

  it("free still allows Haiku for compactor (cheap path)", () => {
    expect(applyTierGate("free", CLAUDE_HAIKU_4_5, "compactor")).toBe(CLAUDE_HAIKU_4_5)
  })

  it("pro passes through any resolved model", () => {
    expect(applyTierGate("pro", CLAUDE_OPUS_4_7, "executor")).toBe(CLAUDE_OPUS_4_7)
    expect(applyTierGate("pro", CLAUDE_HAIKU_4_5, "executor")).toBe(CLAUDE_HAIKU_4_5)
    expect(applyTierGate("pro", CLAUDE_SONNET_4_6, "planner")).toBe(CLAUDE_SONNET_4_6)
  })

  it("team passes through any resolved model", () => {
    expect(applyTierGate("team", CLAUDE_OPUS_4_7, "executor")).toBe(CLAUDE_OPUS_4_7)
    expect(applyTierGate("team", CLAUDE_HAIKU_4_5, "compactor")).toBe(CLAUDE_HAIKU_4_5)
  })
})
