/**
 * prompt-enrichment — pure helpers for the intent-alignment loop.
 */

import { describe, it, expect } from "vitest"
import {
  shouldProceed,
  compileEnrichedPrompt,
  scoreToColor,
  scoreToPercent,
  buildScoringSystemPrompt,
  buildScoringUserPrompt,
  PROCEED_THRESHOLD,
  MAX_ROUNDS,
  QUESTIONS_PER_ROUND,
  DIMENSION_IDS,
  type EnrichmentRound,
} from "@/lib/agent-kit/core/prompt-enrichment"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("constants", () => {
  it("PROCEED_THRESHOLD is 0.82", () => {
    expect(PROCEED_THRESHOLD).toBe(0.82)
  })

  it("MAX_ROUNDS is 3", () => {
    expect(MAX_ROUNDS).toBe(3)
  })

  it("QUESTIONS_PER_ROUND is 3", () => {
    expect(QUESTIONS_PER_ROUND).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// shouldProceed
// ---------------------------------------------------------------------------

describe("shouldProceed", () => {
  it("returns true when score >= PROCEED_THRESHOLD", () => {
    expect(shouldProceed(PROCEED_THRESHOLD, 0)).toBe(true)
  })

  it("returns true when score is above threshold", () => {
    expect(shouldProceed(0.9, 0)).toBe(true)
  })

  it("returns true when score is 1.0", () => {
    expect(shouldProceed(1.0, 0)).toBe(true)
  })

  it("returns true when roundIndex >= MAX_ROUNDS regardless of low score", () => {
    expect(shouldProceed(0.1, MAX_ROUNDS)).toBe(true)
  })

  it("returns true when roundIndex exceeds MAX_ROUNDS", () => {
    expect(shouldProceed(0.0, MAX_ROUNDS + 1)).toBe(true)
  })

  it("returns false when score is below threshold and roundIndex is below MAX_ROUNDS", () => {
    expect(shouldProceed(0.5, 0)).toBe(false)
  })

  it("returns false when score is just below threshold and rounds remain", () => {
    expect(shouldProceed(0.81, 1)).toBe(false)
  })

  it("edge — roundIndex = MAX_ROUNDS - 1 with low score → false", () => {
    expect(shouldProceed(0.4, MAX_ROUNDS - 1)).toBe(false)
  })

  it("edge — score exactly one step below threshold stays false", () => {
    // 0.819 rounds to less than 0.82 — still below threshold
    expect(shouldProceed(0.819, 0)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// compileEnrichedPrompt
// ---------------------------------------------------------------------------

describe("compileEnrichedPrompt", () => {
  const RAW = "Build me a SaaS dashboard"

  const makeRound = (
    questionId: string,
    questionText: string,
    answer: string,
  ): EnrichmentRound => ({
    questions: [{ id: questionId, text: questionText, type: "freetext", dimensionId: "goal_clarity" }],
    answers: [{ questionId, answer }],
  })

  it("returns rawPrompt unchanged when there are no answered rounds", () => {
    expect(compileEnrichedPrompt(RAW, [])).toBe(RAW)
  })

  it("returns rawPrompt unchanged when all rounds lack answers", () => {
    const round: EnrichmentRound = {
      questions: [{ id: "q1", text: "Who is the audience?", type: "freetext", dimensionId: "audience" }],
    }
    expect(compileEnrichedPrompt(RAW, [round])).toBe(RAW)
  })

  it("returns rawPrompt unchanged when rounds have empty answers arrays", () => {
    const round: EnrichmentRound = {
      questions: [{ id: "q1", text: "Who is the audience?", type: "freetext", dimensionId: "audience" }],
      answers: [],
    }
    expect(compileEnrichedPrompt(RAW, [round])).toBe(RAW)
  })

  it("includes rawPrompt and clarifications section with one answered round", () => {
    const round = makeRound("q1", "Who is your target audience?", "Small business owners")
    const result = compileEnrichedPrompt(RAW, [round])
    expect(result).toContain(RAW)
    expect(result).toContain("## Clarifications provided by the user:")
    expect(result).toContain("Who is your target audience?")
    expect(result).toContain("Small business owners")
  })

  it("formats answered question as bold question followed by indented answer", () => {
    const round = makeRound("q1", "What is the visual style?", "Dark mode minimal")
    const result = compileEnrichedPrompt(RAW, [round])
    expect(result).toContain("- **What is the visual style?**")
    expect(result).toContain("  Dark mode minimal")
  })

  it("skips answers with empty answer string", () => {
    const round: EnrichmentRound = {
      questions: [{ id: "q1", text: "Some question", type: "freetext", dimensionId: "goal_clarity" }],
      answers: [{ questionId: "q1", answer: "" }],
    }
    const result = compileEnrichedPrompt(RAW, [round])
    // With only empty answers, no clarifications section is meaningful —
    // but the raw prompt is still the start; the section header is present but
    // no Q&A lines follow. The raw prompt itself must still appear.
    expect(result).toContain(RAW)
    expect(result).not.toContain("Some question")
  })

  it("skips whitespace-only answers (trim check)", () => {
    const round: EnrichmentRound = {
      questions: [{ id: "q1", text: "Any preferences?", type: "freetext", dimensionId: "tech_preferences" }],
      answers: [{ questionId: "q1", answer: "   \t  " }],
    }
    const result = compileEnrichedPrompt(RAW, [round])
    expect(result).not.toContain("Any preferences?")
  })

  it("skips answers where questionId does not match any question", () => {
    const round: EnrichmentRound = {
      questions: [{ id: "q1", text: "Real question", type: "freetext", dimensionId: "goal_clarity" }],
      answers: [{ questionId: "missing-id", answer: "Some answer" }],
    }
    const result = compileEnrichedPrompt(RAW, [round])
    expect(result).not.toContain("Real question")
    expect(result).not.toContain("Some answer")
  })

  it("includes answers from multiple rounds in order", () => {
    const round1 = makeRound("q1", "Question A", "Answer A")
    const round2 = makeRound("q2", "Question B", "Answer B")
    const result = compileEnrichedPrompt(RAW, [round1, round2])
    const posA = result.indexOf("Answer A")
    const posB = result.indexOf("Answer B")
    expect(posA).toBeGreaterThan(-1)
    expect(posB).toBeGreaterThan(-1)
    expect(posA).toBeLessThan(posB)
  })

  it("includes all non-empty answers from a round with mixed empty/non-empty answers", () => {
    const round: EnrichmentRound = {
      questions: [
        { id: "q1", text: "Q1", type: "freetext", dimensionId: "goal_clarity" },
        { id: "q2", text: "Q2", type: "freetext", dimensionId: "audience" },
      ],
      answers: [
        { questionId: "q1", answer: "" },
        { questionId: "q2", answer: "My answer" },
      ],
    }
    const result = compileEnrichedPrompt(RAW, [round])
    expect(result).not.toContain("Q1")
    expect(result).toContain("Q2")
    expect(result).toContain("My answer")
  })
})

// ---------------------------------------------------------------------------
// scoreToColor
// ---------------------------------------------------------------------------

describe("scoreToColor", () => {
  it("returns 'red' when score < 0.55", () => {
    expect(scoreToColor(0.0)).toBe("red")
    expect(scoreToColor(0.3)).toBe("red")
    expect(scoreToColor(0.54)).toBe("red")
  })

  it("edge — score exactly 0.55 → 'amber'", () => {
    expect(scoreToColor(0.55)).toBe("amber")
  })

  it("returns 'amber' for scores between 0.55 and below PROCEED_THRESHOLD", () => {
    expect(scoreToColor(0.6)).toBe("amber")
    expect(scoreToColor(0.7)).toBe("amber")
    expect(scoreToColor(0.81)).toBe("amber")
  })

  it("edge — PROCEED_THRESHOLD (0.82) → 'green'", () => {
    expect(scoreToColor(PROCEED_THRESHOLD)).toBe("green")
  })

  it("returns 'green' for scores above PROCEED_THRESHOLD", () => {
    expect(scoreToColor(0.9)).toBe("green")
    expect(scoreToColor(1.0)).toBe("green")
  })
})

// ---------------------------------------------------------------------------
// scoreToPercent
// ---------------------------------------------------------------------------

describe("scoreToPercent", () => {
  it("returns '62%' for 0.62", () => {
    expect(scoreToPercent(0.62)).toBe("62%")
  })

  it("rounds 0.825 to '83%'", () => {
    expect(scoreToPercent(0.825)).toBe("83%")
  })

  it("returns '0%' for 0.0", () => {
    expect(scoreToPercent(0.0)).toBe("0%")
  })

  it("returns '100%' for 1.0", () => {
    expect(scoreToPercent(1.0)).toBe("100%")
  })

  it("rounds 0.505 to '51%' (standard rounding)", () => {
    expect(scoreToPercent(0.505)).toBe("51%")
  })
})

// ---------------------------------------------------------------------------
// buildScoringSystemPrompt
// ---------------------------------------------------------------------------

describe("buildScoringSystemPrompt", () => {
  it("returns a non-empty string", () => {
    const prompt = buildScoringSystemPrompt()
    expect(typeof prompt).toBe("string")
    expect(prompt.length).toBeGreaterThan(0)
  })

  it("contains 'overallScore'", () => {
    expect(buildScoringSystemPrompt()).toContain("overallScore")
  })

  it("contains all dimension IDs", () => {
    const prompt = buildScoringSystemPrompt()
    for (const id of DIMENSION_IDS) {
      expect(prompt).toContain(id)
    }
  })

  it("contains QUESTIONS_PER_ROUND value", () => {
    expect(buildScoringSystemPrompt()).toContain(String(QUESTIONS_PER_ROUND))
  })

  it("contains PROCEED_THRESHOLD value", () => {
    expect(buildScoringSystemPrompt()).toContain(String(PROCEED_THRESHOLD))
  })

  it("instructs LLM to return valid JSON only", () => {
    const prompt = buildScoringSystemPrompt()
    expect(prompt).toContain("valid JSON")
  })

  it("describes dimension scoring range 0.00 to 1.00", () => {
    const prompt = buildScoringSystemPrompt()
    expect(prompt).toContain("0.00")
    expect(prompt).toContain("1.00")
  })
})

// ---------------------------------------------------------------------------
// buildScoringUserPrompt
// ---------------------------------------------------------------------------

describe("buildScoringUserPrompt", () => {
  const RAW = "Build a recipe app for home cooks"

  it("contains the raw prompt", () => {
    const result = buildScoringUserPrompt(RAW, [])
    expect(result).toContain(RAW)
  })

  it("has no 'Clarifications' section when there are no previous rounds", () => {
    const result = buildScoringUserPrompt(RAW, [])
    expect(result).not.toContain("Clarifications")
  })

  it("includes instruction to score completeness", () => {
    const result = buildScoringUserPrompt(RAW, [])
    expect(result).toContain("Score completeness")
  })

  it("includes Q&A context when rounds have answers", () => {
    const round: EnrichmentRound = {
      questions: [{ id: "q1", text: "Who is the audience?", type: "freetext", dimensionId: "audience" }],
      answers: [{ questionId: "q1", answer: "Home cooks aged 25–45" }],
    }
    const result = buildScoringUserPrompt(RAW, [round])
    expect(result).toContain("Clarifications already provided by the user:")
    expect(result).toContain("Who is the audience?")
    expect(result).toContain("Home cooks aged 25–45")
  })

  it("formats answered Q&A as Q:/A: lines", () => {
    const round: EnrichmentRound = {
      questions: [{ id: "q1", text: "Dark or light mode?", type: "radio", dimensionId: "visual_style", options: ["dark", "light"] }],
      answers: [{ questionId: "q1", answer: "dark" }],
    }
    const result = buildScoringUserPrompt(RAW, [round])
    expect(result).toContain("Q: Dark or light mode?")
    expect(result).toContain("A: dark")
  })

  it("excludes rounds with no answers from the context", () => {
    const unanswered: EnrichmentRound = {
      questions: [{ id: "q1", text: "Unanswered question", type: "freetext", dimensionId: "goal_clarity" }],
    }
    const result = buildScoringUserPrompt(RAW, [unanswered])
    expect(result).not.toContain("Clarifications")
    expect(result).not.toContain("Unanswered question")
  })

  it("excludes rounds with empty answers array from the context", () => {
    const emptyAnswers: EnrichmentRound = {
      questions: [{ id: "q1", text: "Empty answers round", type: "freetext", dimensionId: "goal_clarity" }],
      answers: [],
    }
    const result = buildScoringUserPrompt(RAW, [emptyAnswers])
    expect(result).not.toContain("Clarifications")
  })

  it("includes Q&A from multiple answered rounds", () => {
    const round1: EnrichmentRound = {
      questions: [{ id: "q1", text: "Q round 1", type: "freetext", dimensionId: "goal_clarity" }],
      answers: [{ questionId: "q1", answer: "A round 1" }],
    }
    const round2: EnrichmentRound = {
      questions: [{ id: "q2", text: "Q round 2", type: "freetext", dimensionId: "audience" }],
      answers: [{ questionId: "q2", answer: "A round 2" }],
    }
    const result = buildScoringUserPrompt(RAW, [round1, round2])
    expect(result).toContain("A round 1")
    expect(result).toContain("A round 2")
  })
})
