import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  classifyTask,
  classifyTaskWithLLM,
  clearTaskClassifierCache,
} from "@/lib/agents/task-classifier"

const baseInput = {
  userPrompt: "",
  planSize: 0,
  recentFileCount: 0,
  isFirstTurn: false,
}

describe("classifyTask", () => {
  it("first turn → hard (initial scaffold)", () => {
    expect(classifyTask({ ...baseInput, userPrompt: "build a todo app", isFirstTurn: true })).toBe("hard")
  })

  it("plan with > 5 features → hard", () => {
    expect(classifyTask({ ...baseInput, userPrompt: "next sprint", planSize: 8 })).toBe("hard")
  })

  it("hard keyword 'refactor' → hard", () => {
    expect(classifyTask({ ...baseInput, userPrompt: "refactor the auth module" })).toBe("hard")
  })

  it("hard keyword 'investigate' → hard", () => {
    expect(classifyTask({ ...baseInput, userPrompt: "investigate why the login flow breaks" })).toBe("hard")
  })

  it("> 5 recent files touched → hard", () => {
    expect(classifyTask({ ...baseInput, userPrompt: "small change", recentFileCount: 8 })).toBe("hard")
  })

  it("short imperative 'fix typo' → trivial", () => {
    expect(classifyTask({ ...baseInput, userPrompt: "fix typo in homepage hero" })).toBe("trivial")
  })

  it("short 'rename' → trivial", () => {
    expect(classifyTask({ ...baseInput, userPrompt: "rename Counter to Tally in App.tsx" })).toBe("trivial")
  })

  it("short 'add' → trivial", () => {
    expect(classifyTask({ ...baseInput, userPrompt: "add a tooltip to the save button" })).toBe("trivial")
  })

  it("long imperative (above 80 chars) → standard, NOT trivial", () => {
    const longUpdate =
      "update the theme to use a deeper accent color across all primary buttons in the dashboard"
    expect(longUpdate.length).toBeGreaterThan(80)
    expect(classifyTask({ ...baseInput, userPrompt: longUpdate })).toBe("standard")
  })

  it("non-imperative short prompt → standard", () => {
    expect(classifyTask({ ...baseInput, userPrompt: "the cart is broken" })).toBe("standard")
  })

  it("hard keyword overrides trivial verb", () => {
    // "rename" is a trivial verb but "refactor" is a hard keyword.
    expect(classifyTask({ ...baseInput, userPrompt: "rename and refactor Auth" })).toBe("hard")
  })

  it("first turn beats any other signal", () => {
    expect(
      classifyTask({
        ...baseInput,
        userPrompt: "fix typo",
        isFirstTurn: true,
      }),
    ).toBe("hard")
  })
})

describe("classifyTaskWithLLM (D-052)", () => {
  beforeEach(() => {
    clearTaskClassifierCache()
  })

  it("returns the LLM verdict when the call succeeds", async () => {
    const callImpl = vi.fn(async () => '{"class":"hard","reason":"multi-file rename"}')
    const r = await classifyTaskWithLLM(
      { ...baseInput, userPrompt: "fix typo across all 50 files" },
      { callImpl },
    )
    expect(r).toBe("hard")
    expect(callImpl).toHaveBeenCalledOnce()
  })

  it("strips markdown code fences before JSON.parse", async () => {
    const callImpl = vi.fn(async () =>
      '```json\n{"class":"trivial","reason":"comment only"}\n```',
    )
    const r = await classifyTaskWithLLM(
      { ...baseInput, userPrompt: "fix typo" },
      { callImpl },
    )
    expect(r).toBe("trivial")
  })

  it("falls back to heuristic when LLM returns invalid JSON", async () => {
    const callImpl = vi.fn(async () => "i am not json")
    // Heuristic for "fix typo in homepage hero" → trivial
    const r = await classifyTaskWithLLM(
      { ...baseInput, userPrompt: "fix typo in homepage hero" },
      { callImpl },
    )
    expect(r).toBe("trivial")
  })

  it("falls back to heuristic when LLM returns invalid class value", async () => {
    const callImpl = vi.fn(async () => '{"class":"super-hard"}')
    const r = await classifyTaskWithLLM(
      { ...baseInput, userPrompt: "investigate the bug" },
      { callImpl },
    )
    // Heuristic: "investigate" is hard
    expect(r).toBe("hard")
  })

  it("falls back to heuristic on SDK errors", async () => {
    const callImpl = vi.fn(async () => {
      throw new Error("rate limited")
    })
    const r = await classifyTaskWithLLM(
      { ...baseInput, userPrompt: "rename foo to bar" },
      { callImpl },
    )
    // Heuristic: trivial
    expect(r).toBe("trivial")
  })

  it("caches identical inputs (no second LLM call)", async () => {
    const callImpl = vi.fn(async () => '{"class":"standard"}')
    const input = { ...baseInput, userPrompt: "add a save button" }
    const r1 = await classifyTaskWithLLM(input, { callImpl })
    const r2 = await classifyTaskWithLLM(input, { callImpl })
    expect(r1).toBe("standard")
    expect(r2).toBe("standard")
    expect(callImpl).toHaveBeenCalledOnce()
  })

  it("does NOT cross-cache between distinct prompts", async () => {
    const callImpl = vi
      .fn()
      .mockResolvedValueOnce('{"class":"trivial"}')
      .mockResolvedValueOnce('{"class":"hard"}')
    const r1 = await classifyTaskWithLLM(
      { ...baseInput, userPrompt: "rename A to B" },
      { callImpl },
    )
    const r2 = await classifyTaskWithLLM(
      { ...baseInput, userPrompt: "refactor everything" },
      { callImpl },
    )
    expect(r1).toBe("trivial")
    expect(r2).toBe("hard")
    expect(callImpl).toHaveBeenCalledTimes(2)
  })

  it("respects cache TTL — expires after window", async () => {
    let now = 1_000_000
    const callImpl = vi
      .fn()
      .mockResolvedValueOnce('{"class":"trivial"}')
      .mockResolvedValueOnce('{"class":"hard"}')

    const input = { ...baseInput, userPrompt: "fix typo X" }
    const r1 = await classifyTaskWithLLM(input, { callImpl, now: () => now })
    expect(r1).toBe("trivial")

    // Advance past the 60-min TTL
    now += 70 * 60_000
    const r2 = await classifyTaskWithLLM(input, { callImpl, now: () => now })
    expect(r2).toBe("hard")
    expect(callImpl).toHaveBeenCalledTimes(2)
  })

  it("treats different planSize as different cache keys", async () => {
    const callImpl = vi
      .fn()
      .mockResolvedValueOnce('{"class":"trivial"}')
      .mockResolvedValueOnce('{"class":"hard"}')

    const r1 = await classifyTaskWithLLM(
      { userPrompt: "tweak", planSize: 0, recentFileCount: 0, isFirstTurn: false },
      { callImpl },
    )
    const r2 = await classifyTaskWithLLM(
      { userPrompt: "tweak", planSize: 8, recentFileCount: 0, isFirstTurn: false },
      { callImpl },
    )
    expect(r1).toBe("trivial")
    expect(r2).toBe("hard")
    expect(callImpl).toHaveBeenCalledTimes(2)
  })
})
