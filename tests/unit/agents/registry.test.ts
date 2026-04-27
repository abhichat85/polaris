import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { GPTAdapter } from "@/lib/agents/gpt-adapter"
import { GeminiAdapter } from "@/lib/agents/gemini-adapter"

describe("GPTAdapter — registry-level smoke", () => {
  it("name is 'gpt'", () => {
    expect(new GPTAdapter({ apiKey: "fake" }).name).toBe("gpt")
  })
})

describe("GeminiAdapter — registry-level smoke", () => {
  it("name is 'gemini'", () => {
    expect(new GeminiAdapter({ apiKey: "fake" }).name).toBe("gemini")
  })
})

describe("registry.getAdapter", () => {
  const ORIGINAL_ENV = { ...process.env }

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "fake-anthropic"
    process.env.OPENAI_API_KEY = "fake-openai"
    process.env.GOOGLE_API_KEY = "fake-google"
    vi.resetModules()
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it("returns ClaudeAdapter for 'claude'", async () => {
    const { getAdapter } = await import("@/lib/agents/registry")
    expect(getAdapter("claude").name).toBe("claude")
  })

  it("returns GPTAdapter for 'gpt' (v1 stub)", async () => {
    const { getAdapter } = await import("@/lib/agents/registry")
    expect(getAdapter("gpt").name).toBe("gpt")
  })

  it("returns GeminiAdapter for 'gemini' (v1 stub)", async () => {
    const { getAdapter } = await import("@/lib/agents/registry")
    expect(getAdapter("gemini").name).toBe("gemini")
  })

  it("is a singleton — repeated calls return the same instance", async () => {
    const { getAdapter } = await import("@/lib/agents/registry")
    expect(getAdapter("claude")).toBe(getAdapter("claude"))
  })

  it("throws for unknown model keys", async () => {
    const { getAdapter } = await import("@/lib/agents/registry")
    expect(() => getAdapter("unknown" as never)).toThrow(/unknown model/i)
  })

  it("throws if ANTHROPIC_API_KEY is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY
    vi.resetModules()
    const { getAdapter } = await import("@/lib/agents/registry")
    expect(() => getAdapter("claude")).toThrow(/ANTHROPIC_API_KEY/)
  })
})
