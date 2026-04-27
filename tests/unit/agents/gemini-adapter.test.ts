import { describe, it, expect } from "vitest"
import { GeminiAdapter } from "@/lib/agents/gemini-adapter"
import type { AgentStep } from "@/lib/agents/types"

/**
 * GeminiAdapter is a documented v1 stub (CONSTITUTION §5.2, ROADMAP O-001).
 * These tests validate the stub contract honestly. Replace with happy-path
 * tests when the real adapter ships.
 */
describe("GeminiAdapter (v1 stub)", () => {
  it("constructs with an apiKey", () => {
    const adapter = new GeminiAdapter({ apiKey: "test-key" })
    expect(adapter).toBeInstanceOf(GeminiAdapter)
  })

  it("constructs with apiKey + optional model", () => {
    const adapter = new GeminiAdapter({
      apiKey: "test-key",
      model: "gemini-2.0-flash",
    })
    expect(adapter).toBeInstanceOf(GeminiAdapter)
  })

  it("name is 'gemini'", () => {
    const adapter = new GeminiAdapter({ apiKey: "test-key" })
    expect(adapter.name).toBe("gemini")
  })

  it("runWithTools throws the documented stub error", async () => {
    const adapter = new GeminiAdapter({ apiKey: "test-key" })
    const gen = adapter.runWithTools(
      [{ role: "user", content: "hi" }],
      [],
      { systemPrompt: "", maxTokens: 100, timeoutMs: 1000 },
    )
    await expect(async () => {
      const out: AgentStep[] = []
      for await (const step of gen) out.push(step)
    }).rejects.toThrow(/GeminiAdapter not implemented in v1/)
  })

  it("stub error references CONSTITUTION + ROADMAP", async () => {
    const adapter = new GeminiAdapter({ apiKey: "test-key" })
    const gen = adapter.runWithTools(
      [{ role: "user", content: "hi" }],
      [],
      { systemPrompt: "", maxTokens: 100, timeoutMs: 1000 },
    )
    try {
      for await (const _ of gen) void _
      throw new Error("expected throw")
    } catch (err) {
      const msg = (err as Error).message
      expect(msg).toMatch(/CONSTITUTION/)
      expect(msg).toMatch(/ROADMAP/)
    }
  })
})
