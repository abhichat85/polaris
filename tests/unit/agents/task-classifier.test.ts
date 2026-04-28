import { describe, it, expect } from "vitest"
import { classifyTask } from "@/lib/agents/task-classifier"

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
