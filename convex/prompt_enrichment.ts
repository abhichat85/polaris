/**
 * prompt_enrichment — state machine for the intent-alignment loop that
 * runs before the first `plan/run` event is fired.
 *
 * Write paths:
 *   internal-key gated : `create`, `updateWithScoreResult`
 *   Clerk-auth gated   : `saveAnswers`, `skip`
 *
 * Read paths:
 *   Clerk-auth gated   : `getForConversation`
 *   internal-key gated : `getForSessionInternal`  (used by Inngest scorer)
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

// ── Local helpers (can't import from src/) ─────────────────────────────────

/**
 * Compile the enriched task brief from the raw prompt + all answered rounds.
 * Mirrors `compileEnrichedPrompt` in `src/lib/agent-kit/core/prompt-enrichment.ts`.
 */
function compileEnrichedPromptLocal(
  rawPrompt: string,
  rounds: Array<{
    questions: Array<{ id: string; text: string }>
    answers?: Array<{ questionId: string; answer: string }>
  }>,
): string {
  const answeredRounds = rounds.filter(
    (r) => r.answers && r.answers.length > 0,
  )
  if (answeredRounds.length === 0) return rawPrompt

  const lines: string[] = [
    rawPrompt,
    "",
    "## Clarifications provided by the user:",
    "",
  ]

  for (const round of answeredRounds) {
    for (const answer of round.answers ?? []) {
      const question = round.questions.find((q) => q.id === answer.questionId)
      if (!question) continue
      const answerText = answer.answer.trim()
      if (!answerText) continue
      lines.push(`- **${question.text}**`)
      lines.push(`  ${answerText}`)
    }
  }

  return lines.join("\n")
}

// ── Internal write path ────────────────────────────────────────────────────

/**
 * Create a new enrichment session in "scoring" state.
 * Called by `POST /api/enrich` immediately after the user's first keystroke.
 */
export const create = mutation({
  args: {
    internalKey: v.string(),
    conversationId: v.id("conversations"),
    projectId: v.id("projects"),
    userId: v.string(),
    rawPrompt: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.internalKey !== process.env.POLARIS_CONVEX_INTERNAL_KEY) {
      throw new Error("Unauthorized")
    }
    const now = Date.now()
    return await ctx.db.insert("prompt_enrichment_sessions", {
      conversationId: args.conversationId,
      projectId: args.projectId,
      userId: args.userId,
      rawPrompt: args.rawPrompt,
      rounds: [],
      currentScore: 0,
      status: "scoring",
      createdAt: now,
      updatedAt: now,
    })
  },
})

/**
 * Persist the LLM's scoring result. Called by the Inngest scorer after
 * every Anthropic API call (both initial scoring and re-scoring).
 *
 * When questions are present → appends a new round and sets status to
 * "collecting". When questions are absent (score ≥ threshold) → sets
 * status to "ready" and compiles the enriched prompt.
 */
export const updateWithScoreResult = mutation({
  args: {
    internalKey: v.string(),
    sessionId: v.id("prompt_enrichment_sessions"),
    score: v.number(),
    questions: v.array(
      v.object({
        id: v.string(),
        text: v.string(),
        type: v.union(
          v.literal("radio"),
          v.literal("multiselect"),
          v.literal("freetext"),
        ),
        options: v.optional(v.array(v.string())),
        dimensionId: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    if (args.internalKey !== process.env.POLARIS_CONVEX_INTERNAL_KEY) {
      throw new Error("Unauthorized")
    }
    const session = await ctx.db.get(args.sessionId)
    if (!session) throw new Error("Session not found")

    const now = Date.now()

    if (args.questions.length > 0) {
      // More questions to ask — append a new round and keep collecting.
      const updatedRounds = [
        ...session.rounds,
        { questions: args.questions, answers: undefined, scoreAfter: undefined },
      ]
      await ctx.db.patch(args.sessionId, {
        rounds: updatedRounds,
        currentScore: args.score,
        status: "collecting",
        updatedAt: now,
      })
    } else {
      // No more questions — score is high enough (or no gaps found).
      const enrichedPrompt = compileEnrichedPromptLocal(
        session.rawPrompt,
        session.rounds,
      )
      await ctx.db.patch(args.sessionId, {
        currentScore: args.score,
        status: "ready",
        enrichedPrompt,
        updatedAt: now,
      })
    }
  },
})

// ── User-facing write path ─────────────────────────────────────────────────

/**
 * Persist the user's answers for the current (last) round, then transition
 * to "scoring" so the Inngest scorer runs again with the updated context.
 * Called by `POST /api/enrich/answer`.
 */
export const saveAnswers = mutation({
  args: {
    internalKey: v.string(),
    sessionId: v.id("prompt_enrichment_sessions"),
    answers: v.array(
      v.object({
        questionId: v.string(),
        answer: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    if (args.internalKey !== process.env.POLARIS_CONVEX_INTERNAL_KEY) {
      throw new Error("Unauthorized")
    }
    const session = await ctx.db.get(args.sessionId)
    if (!session) throw new Error("Session not found")
    if (session.rounds.length === 0) throw new Error("No rounds to answer")

    const rounds = [...session.rounds]
    const lastIndex = rounds.length - 1
    rounds[lastIndex] = {
      ...rounds[lastIndex],
      answers: args.answers,
    }

    await ctx.db.patch(args.sessionId, {
      rounds,
      status: "scoring",
      updatedAt: Date.now(),
    })
  },
})

/**
 * Mark the session as skipped. The enriched prompt falls back to the
 * raw prompt (plus any answers already collected).
 * Called directly by the UI via `useMutation`.
 */
export const skip = mutation({
  args: { sessionId: v.id("prompt_enrichment_sessions") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Unauthorized")

    const session = await ctx.db.get(args.sessionId)
    if (!session) throw new Error("Session not found")
    if (session.userId !== identity.subject) throw new Error("Forbidden")

    const enrichedPrompt = compileEnrichedPromptLocal(
      session.rawPrompt,
      session.rounds,
    )
    await ctx.db.patch(args.sessionId, {
      status: "skipped",
      enrichedPrompt,
      updatedAt: Date.now(),
    })
    return enrichedPrompt
  },
})

// ── Read path (UI) ─────────────────────────────────────────────────────────

/**
 * Get the enrichment session for a specific conversation.
 * Returns null if no session exists (i.e. enrichment was not triggered).
 */
export const getForConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    return await ctx.db
      .query("prompt_enrichment_sessions")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .first()
  },
})

// ── Read path (Inngest) ────────────────────────────────────────────────────

/**
 * Get the full session document for the Inngest scorer.
 * Internal-key gated — never called from the client.
 */
export const getForSessionInternal = query({
  args: {
    internalKey: v.string(),
    sessionId: v.id("prompt_enrichment_sessions"),
  },
  handler: async (ctx, args) => {
    if (args.internalKey !== process.env.POLARIS_CONVEX_INTERNAL_KEY) {
      throw new Error("Unauthorized")
    }
    return await ctx.db.get(args.sessionId)
  },
})
