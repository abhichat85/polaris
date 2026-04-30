/**
 * PromptEnrichmentPanel — inline enrichment UI shown in the conversation
 * before the agent begins planning.
 *
 * State machine:
 *   "scoring"    → loading state ("Analyzing your prompt…")
 *   "collecting" → show clarifying questions from the current round
 *   "ready"      → session complete; parent should hide this panel
 *   "skipped"    → session skipped; parent should hide this panel
 *
 * The panel uses `api.prompt_enrichment.skip` for the skip action.
 * Answer submission is delegated to `onAnswersSubmitted` so the parent can
 * call `api.prompt_enrichment.saveAnswers` and trigger the next scoring run.
 */

"use client"

import { useState, useEffect } from "react"
import { useMutation } from "convex/react"
import { Loader2, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  scoreToColor,
  PROCEED_THRESHOLD,
  type EnrichmentSession,
  type EnrichmentQuestion,
} from "@/lib/agent-kit/core/prompt-enrichment"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"

import { EnrichmentScoreBadge } from "./enrichment-score-badge"
import { EnrichmentQuestionCard } from "./enrichment-question-card"

export interface PromptEnrichmentPanelProps {
  session: EnrichmentSession & { _id: string }
  onSkip: () => void
  onAnswersSubmitted: (
    answers: { questionId: string; answer: string }[],
  ) => Promise<void>
}

function getExplanatoryText(score: number): string {
  if (score < 0.55) {
    return "I need a bit more information before I can plan this effectively."
  }
  if (score < PROCEED_THRESHOLD) {
    return "This is a good start. A few quick answers will help me build something much closer to what you want."
  }
  return "This looks great! One more question to nail the details."
}

/**
 * Initialise answer state for a new set of questions.
 * Radio questions default to their first option; others default to "".
 */
function initAnswers(questions: EnrichmentQuestion[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const q of questions) {
    if (q.type === "radio" && q.options && q.options.length > 0) {
      map[q.id] = q.options[0]
    } else {
      map[q.id] = ""
    }
  }
  return map
}

export function PromptEnrichmentPanel({
  session,
  onSkip,
  onAnswersSubmitted,
}: PromptEnrichmentPanelProps) {
  const skipMutation = useMutation(api.prompt_enrichment.skip)

  // Current round is the last element of rounds
  const currentRound = session.rounds[session.rounds.length - 1] ?? null
  const questions = currentRound?.questions ?? []

  // Local answer state — reset whenever the question set changes
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    initAnswers(questions),
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Re-initialise answers when the round changes (new question set arrived)
  const questionKey = questions.map((q) => q.id).join(",")
  useEffect(() => {
    setAnswers(initAnswers(questions))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionKey])

  function handleAnswerChange(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }

  // Submit is disabled if any radio/multiselect question has no answer
  const isSubmitDisabled =
    isSubmitting ||
    questions.some(
      (q) =>
        (q.type === "radio" || q.type === "multiselect") && !answers[q.id],
    )

  async function handleSubmit() {
    const collected = questions
      .map((q) => ({ questionId: q.id, answer: answers[q.id] ?? "" }))
      .filter((a) => a.answer.trim() !== "")

    setIsSubmitting(true)
    try {
      await onAnswersSubmitted(collected)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSkip() {
    await skipMutation({
      sessionId: session._id as Id<"prompt_enrichment_sessions">,
    })
    onSkip()
  }

  const score = session.currentScore
  const color = scoreToColor(score)

  const headerAccentClass = {
    red: "border-red-500/30",
    amber: "border-amber-500/30",
    green: "border-green-500/30",
  }[color]

  return (
    <div
      data-testid="prompt-enrichment-panel"
      className={cn(
        "rounded-lg border bg-surface-1",
        "animate-in fade-in-0 duration-300",
        headerAccentClass,
        "my-2",
      )}
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        {/* Polaris icon */}
        <span
          aria-hidden="true"
          className="flex-none flex items-center justify-center w-5 h-5 rounded-sm bg-primary/10"
        >
          <Sparkles className="w-3 h-3 text-primary" />
        </span>

        <span className="text-sm font-semibold text-foreground">Polaris</span>

        <EnrichmentScoreBadge score={score} className="ml-auto" />
      </div>

      {/* ── Explanatory text ──────────────────────────────────────────────── */}
      <p className="px-4 pb-3 text-xs text-muted-foreground leading-relaxed">
        {getExplanatoryText(score)}
      </p>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      {session.status === "scoring" && (
        <div className="flex items-center gap-2 px-4 pb-4 text-sm text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Analyzing your prompt…</span>
        </div>
      )}

      {session.status === "collecting" && questions.length > 0 && (
        <>
          {/* Questions inner card */}
          <div className="mx-3 mb-3 rounded-md bg-surface-2 border border-surface-4 divide-y divide-surface-4">
            {questions.map((question, idx) => (
              <div key={question.id} className={cn("px-3 py-3", idx === 0 && "")}>
                <EnrichmentQuestionCard
                  question={question}
                  value={answers[question.id] ?? ""}
                  onChange={(val) => handleAnswerChange(question.id, val)}
                />
              </div>
            ))}
          </div>

          {/* ── Footer ──────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 px-3 pb-3">
            <Button
              size="sm"
              variant="default"
              disabled={isSubmitDisabled}
              onClick={handleSubmit}
              className="h-8 gap-1.5"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Submit
            </Button>

            <button
              type="button"
              onClick={handleSkip}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
            >
              I don&apos;t want to improve my prompt further
            </button>
          </div>
        </>
      )}
    </div>
  )
}
