/**
 * PreferenceInjector -- prompt addendum and runtime config extraction.
 */

import { describe, it, expect } from "vitest"
import {
  buildPreferencePrompt,
  injectPreferences,
  type InjectionResult,
} from "@/lib/agent-kit/core/preference-injector"
import type {
  UserProfile,
  VerbosityLevel,
  CodeStylePreferences,
} from "@/lib/agent-kit/core/user-profile"
import { createUserProfile } from "@/lib/agent-kit/core/user-profile"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProfile(
  overrides: Partial<UserProfile> = {},
): UserProfile {
  const base = createUserProfile("test-user")
  return { ...base, ...overrides }
}

function allNullCodeStyle(): CodeStylePreferences {
  return { paradigm: null, exportStyle: null, typeStyle: null, maxLineLength: null }
}

// ---------------------------------------------------------------------------
// buildPreferencePrompt — verbosity
// ---------------------------------------------------------------------------

describe("buildPreferencePrompt — verbosity", () => {
  it("minimal: includes conciseness instruction", () => {
    const prompt = buildPreferencePrompt("minimal", allNullCodeStyle(), [])
    expect(prompt).toContain("Be concise")
    expect(prompt).toContain("Show code, not words")
  })

  it("detailed: includes explanation instruction", () => {
    const prompt = buildPreferencePrompt("detailed", allNullCodeStyle(), [])
    expect(prompt).toContain("Explain your reasoning in detail")
    expect(prompt).toContain("Show alternatives considered")
  })

  it("normal: adds nothing for verbosity", () => {
    const prompt = buildPreferencePrompt("normal", allNullCodeStyle(), [])
    expect(prompt).toBe("")
  })
})

// ---------------------------------------------------------------------------
// buildPreferencePrompt — code style preferences
// ---------------------------------------------------------------------------

describe("buildPreferencePrompt — code style", () => {
  it("renders paradigm=functional preference", () => {
    const style: CodeStylePreferences = {
      paradigm: "functional",
      exportStyle: null,
      typeStyle: null,
      maxLineLength: null,
    }
    const prompt = buildPreferencePrompt("normal", style, [])
    expect(prompt).toContain("## Code style preferences")
    expect(prompt).toContain("Prefer functional patterns over OOP")
  })

  it("renders paradigm=oop preference", () => {
    const style: CodeStylePreferences = {
      paradigm: "oop",
      exportStyle: null,
      typeStyle: null,
      maxLineLength: null,
    }
    const prompt = buildPreferencePrompt("normal", style, [])
    expect(prompt).toContain("Prefer OOP patterns over functional")
  })

  it("renders exportStyle=named preference", () => {
    const style: CodeStylePreferences = {
      paradigm: null,
      exportStyle: "named",
      typeStyle: null,
      maxLineLength: null,
    }
    const prompt = buildPreferencePrompt("normal", style, [])
    expect(prompt).toContain("Use named exports, not default exports")
  })

  it("renders exportStyle=default preference", () => {
    const style: CodeStylePreferences = {
      paradigm: null,
      exportStyle: "default",
      typeStyle: null,
      maxLineLength: null,
    }
    const prompt = buildPreferencePrompt("normal", style, [])
    expect(prompt).toContain("Use default exports when appropriate")
  })

  it("renders typeStyle=inline preference", () => {
    const style: CodeStylePreferences = {
      paradigm: null,
      exportStyle: null,
      typeStyle: "inline",
      maxLineLength: null,
    }
    const prompt = buildPreferencePrompt("normal", style, [])
    expect(prompt).toContain("Prefer inline types over separate interface")
  })

  it("renders typeStyle=separate preference", () => {
    const style: CodeStylePreferences = {
      paradigm: null,
      exportStyle: null,
      typeStyle: "separate",
      maxLineLength: null,
    }
    const prompt = buildPreferencePrompt("normal", style, [])
    expect(prompt).toContain("Prefer separate interface declarations")
  })

  it("renders maxLineLength", () => {
    const style: CodeStylePreferences = {
      paradigm: null,
      exportStyle: null,
      typeStyle: null,
      maxLineLength: 100,
    }
    const prompt = buildPreferencePrompt("normal", style, [])
    expect(prompt).toContain("Maximum line length: 100")
  })

  it("renders all preferences together", () => {
    const style: CodeStylePreferences = {
      paradigm: "functional",
      exportStyle: "named",
      typeStyle: "separate",
      maxLineLength: 120,
    }
    const prompt = buildPreferencePrompt("normal", style, [])
    expect(prompt).toContain("## Code style preferences")
    expect(prompt).toContain("functional")
    expect(prompt).toContain("named exports")
    expect(prompt).toContain("separate interface")
    expect(prompt).toContain("120")
  })

  it("all null: no code style section", () => {
    const prompt = buildPreferencePrompt("normal", allNullCodeStyle(), [])
    expect(prompt).toBe("")
    expect(prompt).not.toContain("Code style")
  })
})

// ---------------------------------------------------------------------------
// buildPreferencePrompt — persistent notes
// ---------------------------------------------------------------------------

describe("buildPreferencePrompt — persistent notes", () => {
  it("renders notes as bulleted list", () => {
    const notes = ["Always use pnpm", "Project uses Convex"]
    const prompt = buildPreferencePrompt("normal", allNullCodeStyle(), notes)
    expect(prompt).toContain("## User notes")
    expect(prompt).toContain("- Always use pnpm")
    expect(prompt).toContain("- Project uses Convex")
  })

  it("empty notes array: no notes section", () => {
    const prompt = buildPreferencePrompt("normal", allNullCodeStyle(), [])
    expect(prompt).not.toContain("User notes")
  })

  it("filters out blank notes", () => {
    const notes = ["Real note", "", "   ", "Another note"]
    const prompt = buildPreferencePrompt("normal", allNullCodeStyle(), notes)
    expect(prompt).toContain("- Real note")
    expect(prompt).toContain("- Another note")
    // Should only have the two valid notes
    const noteLines = prompt.split("\n").filter((l) => l.startsWith("- "))
    expect(noteLines).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// buildPreferencePrompt — empty output
// ---------------------------------------------------------------------------

describe("buildPreferencePrompt — empty output", () => {
  it("returns empty string when nothing to add", () => {
    const prompt = buildPreferencePrompt("normal", allNullCodeStyle(), [])
    expect(prompt).toBe("")
  })
})

// ---------------------------------------------------------------------------
// buildPreferencePrompt — combined sections
// ---------------------------------------------------------------------------

describe("buildPreferencePrompt — combined", () => {
  it("combines verbosity + code style + notes", () => {
    const style: CodeStylePreferences = {
      paradigm: "functional",
      exportStyle: null,
      typeStyle: null,
      maxLineLength: 80,
    }
    const notes = ["Use vitest for testing"]
    const prompt = buildPreferencePrompt("minimal", style, notes)
    expect(prompt).toContain("Be concise")
    expect(prompt).toContain("## Code style preferences")
    expect(prompt).toContain("functional")
    expect(prompt).toContain("80")
    expect(prompt).toContain("## User notes")
    expect(prompt).toContain("- Use vitest for testing")
  })
})

// ---------------------------------------------------------------------------
// injectPreferences — full profile
// ---------------------------------------------------------------------------

describe("injectPreferences — full profile", () => {
  it("produces prompt addendum and runtime config from a rich profile", () => {
    const profile = makeProfile({
      verbosity: "detailed",
      codeStyle: {
        paradigm: "functional",
        exportStyle: "named",
        typeStyle: "separate",
        maxLineLength: 100,
      },
      persistentNotes: ["Always use pnpm"],
      overrides: {
        "healing.goodEnoughThreshold": 0.9,
        "healing.maxAttempts": 5,
        "budget.maxIterations": 100,
        "budget.maxTokens": 200_000,
        "streamMonitor.maxAlerts": 20,
      },
    })

    const result = injectPreferences(profile)

    // Prompt addendum
    expect(result.promptAddendum).toContain("Explain your reasoning")
    expect(result.promptAddendum).toContain("functional")
    expect(result.promptAddendum).toContain("Always use pnpm")

    // Runtime config — healing
    expect(result.runtimeConfig.healing).toBeDefined()
    expect(result.runtimeConfig.healing!.goodEnoughThreshold).toBe(0.9)
    expect(result.runtimeConfig.healing!.maxAttempts).toBe(5)

    // Runtime config — budget
    expect(result.runtimeConfig.budgetOverrides).toBeDefined()
    expect(result.runtimeConfig.budgetOverrides!["budget.maxIterations"]).toBe(100)
    expect(result.runtimeConfig.budgetOverrides!["budget.maxTokens"]).toBe(200_000)

    // Runtime config — stream monitor
    expect(result.runtimeConfig.streamMonitor).toBeDefined()
    expect(result.runtimeConfig.streamMonitor!.maxAlerts).toBe(20)
  })
})

// ---------------------------------------------------------------------------
// injectPreferences — minimal profile
// ---------------------------------------------------------------------------

describe("injectPreferences — minimal profile", () => {
  it("returns empty addendum and empty runtime config for default profile", () => {
    const profile = createUserProfile("bare-user")
    const result = injectPreferences(profile)

    expect(result.promptAddendum).toBe("")
    expect(result.runtimeConfig.healing).toBeUndefined()
    expect(result.runtimeConfig.budgetOverrides).toBeUndefined()
    expect(result.runtimeConfig.streamMonitor).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// injectPreferences — runtime config extraction
// ---------------------------------------------------------------------------

describe("injectPreferences — runtime config extraction", () => {
  it("extracts only healing overrides", () => {
    const profile = makeProfile({
      overrides: {
        "healing.minImprovement": 0.03,
        "healing.hopelessThreshold": 0.15,
      },
    })
    const result = injectPreferences(profile)
    expect(result.runtimeConfig.healing).toEqual({
      minImprovement: 0.03,
      hopelessThreshold: 0.15,
    })
    expect(result.runtimeConfig.budgetOverrides).toBeUndefined()
    expect(result.runtimeConfig.streamMonitor).toBeUndefined()
  })

  it("extracts only budget overrides", () => {
    const profile = makeProfile({
      overrides: {
        "budget.maxDurationMs": 600_000,
      },
    })
    const result = injectPreferences(profile)
    expect(result.runtimeConfig.budgetOverrides).toEqual({
      "budget.maxDurationMs": 600_000,
    })
    expect(result.runtimeConfig.healing).toBeUndefined()
  })

  it("ignores non-numeric boolean overrides for healing/budget", () => {
    const profile = makeProfile({
      overrides: {
        "verifier.enabled": true,
        "budget.maxIterations": 75,
      },
    })
    const result = injectPreferences(profile)
    // verifier.enabled is boolean, not under healing/budget/streamMonitor
    expect(result.runtimeConfig.budgetOverrides).toEqual({
      "budget.maxIterations": 75,
    })
    expect(result.runtimeConfig.healing).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// injectPreferences — edge cases
// ---------------------------------------------------------------------------

describe("injectPreferences — edge cases", () => {
  it("empty overrides produce no runtime config entries", () => {
    const profile = makeProfile({ overrides: {} })
    const result = injectPreferences(profile)
    expect(result.runtimeConfig).toEqual({})
  })

  it("profile with no notes produces no notes section", () => {
    const profile = makeProfile({
      verbosity: "minimal",
      persistentNotes: [],
    })
    const result = injectPreferences(profile)
    expect(result.promptAddendum).not.toContain("User notes")
    expect(result.promptAddendum).toContain("Be concise")
  })

  it("boolean override in healing namespace is ignored", () => {
    // healing fields should be numbers; a boolean override should be skipped.
    const profile = makeProfile({
      overrides: {
        "healing.goodEnoughThreshold": true as unknown as number,
      } as Record<string, number | boolean>,
    })
    const result = injectPreferences(profile)
    // The healing extraction checks typeof === "number", so true is skipped
    expect(result.runtimeConfig.healing).toBeUndefined()
  })
})
