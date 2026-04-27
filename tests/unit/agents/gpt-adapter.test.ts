import { describe, it, expect } from "vitest"
import { GPTAdapter } from "@/lib/agents/gpt-adapter"
import type { AgentStep } from "@/lib/agents/types"

/**
 * GPTAdapter is a documented v1 stub (CONSTITUTION §5.2, ROADMAP O-001).
 * These tests validate the stub contract honestly — they do NOT pretend
 * an OpenAI integration exists. When the real adapter ships, replace
 * the stub-error assertions with happy-path streaming tests matching
 * the ClaudeAdapter test style.
 */
describe("GPTAdapter (v1 stub)", () => {
  it("constructs with an apiKey", () => {
    const adapter = new GPTAdapter({ apiKey: "test-key" })
    expect(adapter).toBeInstanceOf(GPTAdapter)
  })

  it("constructs with apiKey + optional model", () => {
    const adapter = new GPTAdapter({ apiKey: "test-key", model: "gpt-4o" })
    expect(adapter).toBeInstanceOf(GPTAdapter)
  })

  it("name is 'gpt'", () => {
    const adapter = new GPTAdapter({ apiKey: "test-key" })
    expect(adapter.name).toBe("gpt")
  })

  it("runWithTools throws the documented stub error", async () => {
    const adapter = new GPTAdapter({ apiKey: "test-key" })
    const gen = adapter.runWithTools(
      [{ role: "user", content: "hi" }],
      [],
      { systemPrompt: "", maxTokens: 100, timeoutMs: 1000 },
    )
    await expect(async () => {
      const out: AgentStep[] = []
      for await (const step of gen) out.push(step)
    }).rejects.toThrow(/GPTAdapter not implemented in v1/)
  })

  it("stub error references CONSTITUTION + ROADMAP", async () => {
    const adapter = new GPTAdapter({ apiKey: "test-key" })
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
