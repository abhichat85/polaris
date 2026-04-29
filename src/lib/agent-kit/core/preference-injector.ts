/**
 * PreferenceInjector -- wires UserProfile preferences into agent config.
 *
 * Two outputs:
 *   1. System prompt addendum (text block appended to the system prompt)
 *   2. Runtime config patch (structured overrides for healing, budget, etc.)
 *
 * The injector does NOT make LLM calls. It's a pure transform:
 *   UserProfile -> { promptAddendum, runtimeConfig }
 */

import type {
  UserProfile,
  VerbosityLevel,
  CodeStylePreferences,
} from "./user-profile"
import type { RetryPolicyConfig } from "./healing"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Runtime config patch produced by the PreferenceInjector. */
export interface RuntimeConfigPatch {
  /** Healing loop overrides. */
  healing?: Partial<RetryPolicyConfig>
  /** Budget overrides (applied through OverrideClamps). */
  budgetOverrides?: Record<string, number>
  /** Stream monitor overrides. */
  streamMonitor?: { maxAlerts?: number }
}

/** Result of preference injection. */
export interface InjectionResult {
  /** Text to append to the system prompt. Empty string if no preferences. */
  promptAddendum: string
  /** Structured runtime config patch. */
  runtimeConfig: RuntimeConfigPatch
}

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

/**
 * Build just the prompt addendum text. Exposed separately for testing.
 *
 * Constructs a text block from:
 *   - Verbosity instruction (if not "normal")
 *   - Code style preferences (if any are set)
 *   - Persistent notes (if any)
 *
 * Returns empty string if there's nothing to add.
 */
export function buildPreferencePrompt(
  verbosity: VerbosityLevel,
  codeStyle: CodeStylePreferences,
  persistentNotes: string[],
): string {
  const sections: string[] = []

  // Verbosity instruction
  if (verbosity === "minimal") {
    sections.push("Be concise. Minimize explanations. Show code, not words.")
  } else if (verbosity === "detailed") {
    sections.push(
      "Explain your reasoning in detail. Show alternatives considered.",
    )
  }
  // "normal" -- add nothing

  // Code style preferences
  const styleLines: string[] = []
  if (codeStyle.paradigm != null) {
    styleLines.push(
      codeStyle.paradigm === "functional"
        ? "- Prefer functional patterns over OOP"
        : "- Prefer OOP patterns over functional",
    )
  }
  if (codeStyle.exportStyle != null) {
    styleLines.push(
      codeStyle.exportStyle === "named"
        ? "- Use named exports, not default exports"
        : "- Use default exports when appropriate",
    )
  }
  if (codeStyle.typeStyle != null) {
    styleLines.push(
      codeStyle.typeStyle === "inline"
        ? "- Prefer inline types over separate interface declarations"
        : "- Prefer separate interface declarations over inline types",
    )
  }
  if (codeStyle.maxLineLength != null) {
    styleLines.push(`- Maximum line length: ${codeStyle.maxLineLength}`)
  }

  if (styleLines.length > 0) {
    sections.push(`## Code style preferences\n\n${styleLines.join("\n")}`)
  }

  // Persistent notes
  const filteredNotes = persistentNotes.filter((n) => n.trim().length > 0)
  if (filteredNotes.length > 0) {
    const noteLines = filteredNotes.map((n) => `- ${n}`)
    sections.push(`## User notes\n\n${noteLines.join("\n")}`)
  }

  if (sections.length === 0) return ""

  return sections.join("\n\n")
}

// ---------------------------------------------------------------------------
// Runtime config extraction
// ---------------------------------------------------------------------------

/**
 * Extract healing.*, budget.*, and streamMonitor.* overrides from a
 * profile's override bag into a structured RuntimeConfigPatch.
 */
function extractRuntimeConfig(
  overrides: Record<string, number | boolean>,
): RuntimeConfigPatch {
  const patch: RuntimeConfigPatch = {}

  // Healing overrides
  const healing: Partial<RetryPolicyConfig> = {}
  let hasHealing = false
  for (const key of Object.keys(overrides)) {
    if (!key.startsWith("healing.")) continue
    const field = key.slice("healing.".length)
    const value = overrides[key]
    if (typeof value !== "number") continue

    switch (field) {
      case "goodEnoughThreshold":
        healing.goodEnoughThreshold = value
        hasHealing = true
        break
      case "minImprovement":
        healing.minImprovement = value
        hasHealing = true
        break
      case "hopelessThreshold":
        healing.hopelessThreshold = value
        hasHealing = true
        break
      case "maxAttempts":
        healing.maxAttempts = value
        hasHealing = true
        break
    }
  }
  if (hasHealing) patch.healing = healing

  // Budget overrides
  const budgetOverrides: Record<string, number> = {}
  let hasBudget = false
  for (const key of Object.keys(overrides)) {
    if (!key.startsWith("budget.")) continue
    const value = overrides[key]
    if (typeof value !== "number") continue
    budgetOverrides[key] = value
    hasBudget = true
  }
  if (hasBudget) patch.budgetOverrides = budgetOverrides

  // StreamMonitor overrides
  for (const key of Object.keys(overrides)) {
    if (key === "streamMonitor.maxAlerts") {
      const value = overrides[key]
      if (typeof value === "number") {
        patch.streamMonitor = { maxAlerts: value }
      }
    }
  }

  return patch
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Generate the system prompt addendum and runtime config from a UserProfile.
 *
 * Prompt addendum includes:
 *   - Verbosity instruction (if not "normal")
 *   - Code style preferences (if any are set)
 *   - Persistent notes (if any)
 *
 * Runtime config extracts:
 *   - healing.* overrides from profile.overrides
 *   - budget.* overrides from profile.overrides
 *   - streamMonitor.* overrides from profile.overrides
 */
export function injectPreferences(profile: UserProfile): InjectionResult {
  const promptAddendum = buildPreferencePrompt(
    profile.verbosity,
    profile.codeStyle,
    profile.persistentNotes,
  )

  const runtimeConfig = extractRuntimeConfig(profile.overrides)

  return { promptAddendum, runtimeConfig }
}
