/**
 * Phase 6 — Prompt Enrichment Scorer.
 *
 * Inngest function triggered by `"prompt-enrichment/score"` events. For each
 * event it:
 *   1. Loads the enrichment session from Convex.
 *   2. Calls the Anthropic API (claude-3-5-haiku-20241022) with the current
 *      prompt + any prior Q&A rounds.
 *   3. Parses the LLM's JSON scoring result.
 *   4. Writes the updated score and next-round questions back to Convex.
 *
 * Design notes:
 *   - All external I/O is wrapped in `step.run` for idempotent retries.
 *   - A missing / already-terminal session short-circuits immediately.
 *   - Invalid LLM JSON is handled gracefully: score=0, questions=[] so the
 *     session is never left stuck in "scoring" state.
 *   - Questions are suppressed when `overallScore >= PROCEED_THRESHOLD` even
 *     if the LLM erroneously returned some — keeps the state machine clean.
 */

import Anthropic from "@anthropic-ai/sdk"
import { ConvexHttpClient } from "convex/browser"
import { NonRetriableError } from "inngest"

import { inngest } from "@/inngest/client"
import {
  buildScoringSystemPrompt,
  buildScoringUserPrompt,
  PROCEED_THRESHOLD,
} from "@/lib/agent-kit/core/prompt-enrichment"
import type { EnrichmentQuestion } from "@/lib/agent-kit/core/prompt-enrichment"

import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw shape returned by the LLM (before `options: null → undefined` fixup). */
interface ScoringResult {
  overallScore: number
  dimensions: Array<{
    id: string
    label: string
    score: number
    gap: string | null
  }>
  questions: Array<{
    id: string
    text: string
    type: "radio" | "multiselect" | "freetext"
    options: string[] | null
    dimensionId: string
  }>
}

/** Event payload shape for `"prompt-enrichment/score"`. */
interface PromptEnrichmentScoreEvent {
  sessionId: string
  conversationId: string
  projectId: string
  userId: string
}

// ---------------------------------------------------------------------------
// Inngest function
// ---------------------------------------------------------------------------

export const promptEnrichmentScorer = inngest.createFunction(
  {
    id: "prompt-enrichment-scorer",
    name: "Prompt Enrichment Scorer",
    retries: 2,
  },
  { event: "prompt-enrichment/score" },
  async ({ event, step }) => {
    const data = event.data as PromptEnrichmentScoreEvent

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY
    if (!convexUrl || !internalKey) {
      throw new NonRetriableError(
        "NEXT_PUBLIC_CONVEX_URL + POLARIS_CONVEX_INTERNAL_KEY are required.",
      )
    }

    const convex = new ConvexHttpClient(convexUrl)

    // ── Step 1: load the enrichment session ──────────────────────────────────

    const session = await step.run("load-session", async () => {
      return await convex.query(api.prompt_enrichment.getForSessionInternal, {
        internalKey,
        sessionId: data.sessionId as Id<"prompt_enrichment_sessions">,
      })
    })

    if (!session) {
      throw new NonRetriableError(
        `Enrichment session not found: ${data.sessionId}`,
      )
    }

    // Idempotency guard — already reached a terminal state.
    if (session.status === "ready" || session.status === "skipped") {
      return { skipped: true, status: session.status }
    }

    // ── Step 2: call Anthropic and parse scoring JSON ─────────────────────────

    const scoringResult = await step.run("score-prompt", async () => {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

      const response = await client.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1024,
        system: buildScoringSystemPrompt(),
        messages: [
          {
            role: "user",
            content: buildScoringUserPrompt(session.rawPrompt, session.rounds),
          },
        ],
      })

      // Extract text content from the response.
      const firstBlock = response.content[0]
      const rawText =
        firstBlock?.type === "text" ? firstBlock.text.trim() : ""

      // Parse JSON — fall back to a safe default on error so the session
      // is never left permanently stuck in "scoring" state.
      try {
        return JSON.parse(rawText) as ScoringResult
      } catch (err) {
        console.warn(
          "[prompt-enrichment-scorer] Failed to parse LLM JSON response — using fallback (score=0, questions=[])",
          {
            sessionId: data.sessionId,
            rawText: rawText.slice(0, 200),
            err: err instanceof Error ? err.message : String(err),
          },
        )
        // Return a safe fallback so step 3 can still write a terminal state.
        return {
          overallScore: 0,
          dimensions: [],
          questions: [],
        } satisfies ScoringResult
      }
    })

    // ── Step 3: write score + questions back to Convex ───────────────────────

    await step.run("update-session", async () => {
      // Convert `options: null → undefined` to match EnrichmentQuestion type.
      // Also suppress questions entirely when the score already meets the
      // threshold (guards against the LLM ignoring the "empty array" rule).
      const questionsForUpdate: EnrichmentQuestion[] =
        scoringResult.overallScore >= PROCEED_THRESHOLD
          ? []
          : scoringResult.questions.map((q) => ({
              id: q.id,
              text: q.text,
              type: q.type,
              options: q.options ?? undefined,
              dimensionId: q.dimensionId,
            }))

      await convex.mutation(api.prompt_enrichment.updateWithScoreResult, {
        internalKey,
        sessionId: data.sessionId as Id<"prompt_enrichment_sessions">,
        score: scoringResult.overallScore,
        questions: questionsForUpdate,
      })
    })

    return {
      sessionId: data.sessionId,
      score: scoringResult.overallScore,
      questionsGenerated: scoringResult.questions.length,
      proceedToPlanning: scoringResult.overallScore >= PROCEED_THRESHOLD,
    }
  },
)
