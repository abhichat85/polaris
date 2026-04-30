/**
 * D-028 — `eval/run` Inngest function.
 *
 * Triggered when the Generator finishes a sprint (all features in that
 * sprint are marked `done`). Runs the Evaluator agent and persists the
 * verdict + scores to convex/specs. If verdict is RETURN-FOR-FIX, uses
 * the score-aware healing loop (shouldRetry + buildHealingPrompt) to
 * decide whether to dispatch a fix round with a surgical healing prompt.
 *
 * Tier-gated: free tier skips the Evaluator entirely (no event emitted).
 * Pro/Team gets it. Plan check happens at the call site that emits the
 * `eval/run` event, not inside this function.
 *
 * Healing loop (replaces the old simple round-count cap):
 *   - Normalizes evaluator scores (0-5) to 0-1 scale
 *   - Applies 5-rule retry ladder: good-enough, marginal-gap, hopeless,
 *     max-attempts, same-issues
 *   - Builds surgical healing prompts that list ONLY failing constraints
 *   - Tracks healing history for telemetry
 */

import { ConvexHttpClient } from "convex/browser"
import { NonRetriableError } from "inngest"

import { inngest } from "@/inngest/client"
import { Evaluator } from "@/lib/agents/evaluator"
import type { EvalScores } from "@/lib/agents/evaluator"
import { runLints } from "@/lib/scaffold/lints/types"
import { nextJsLints } from "@/lib/scaffold/lints/nextjs"
import {
  shouldRetry,
  buildHealingPrompt,
  type HealingContext,
} from "@/lib/agent-kit/core/healing"

import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"

interface EvalRunEvent {
  projectId: string
  conversationId: string
  sprint: number
  /** How many eval rounds have already happened for this sprint (0 → first run). */
  roundIndex: number
  userId: string
  /** Score from the previous eval round (for healing loop delta tracking). */
  previousScore?: number
  /** Issues from the previous eval round (for same-issues detection). */
  previousIssues?: string[]
}

/**
 * Healing loop configuration. These are the retry policy thresholds.
 * Max attempts serves as the hard cap (replaces MAX_EVAL_ROUNDS_PER_SPRINT).
 */
const HEALING_CONFIG = {
  goodEnoughThreshold: 0.85, // normalized: 4.25/5
  minImprovement: 0.05,      // normalized: 0.25/5 improvement needed
  hopelessThreshold: 0.2,    // normalized: 1/5
  maxAttempts: 3,
}

/**
 * Normalize evaluator scores (0-5 per dimension) to a single 0-1 score.
 * Weighted average: functionality=40%, buildHealth=30%, codeQuality=20%, design=10%.
 */
function normalizeScores(scores: EvalScores): number {
  const weighted =
    scores.functionality * 0.4 +
    scores.buildHealth * 0.3 +
    scores.codeQuality * 0.2 +
    scores.design * 0.1
  return weighted / 5 // normalize from 0-5 to 0-1
}

export const evalRun = inngest.createFunction(
  {
    id: "eval-run",
    name: "Polaris Evaluator",
    retries: 1,
  },
  { event: "eval/run" },
  async ({ event, step }) => {
    const data = event.data as EvalRunEvent
    if (
      !data?.projectId ||
      !data?.conversationId ||
      typeof data?.sprint !== "number" ||
      typeof data?.roundIndex !== "number" ||
      !data?.userId
    ) {
      throw new NonRetriableError("eval/run event missing required fields")
    }

    // Hard cap check (rule 4 of the healing loop) — checked eagerly so
    // we don't waste an Evaluator call on a round we won't act on.
    if (data.roundIndex >= HEALING_CONFIG.maxAttempts) {
      return {
        verdict: "ESCALATE_TO_HUMAN",
        reason: `Sprint ${data.sprint} hit the ${HEALING_CONFIG.maxAttempts}-round healing cap.`,
      }
    }

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY
    const anthropicKey = process.env.ANTHROPIC_API_KEY
    if (!convexUrl || !internalKey || !anthropicKey) {
      throw new NonRetriableError(
        "NEXT_PUBLIC_CONVEX_URL, POLARIS_CONVEX_INTERNAL_KEY, ANTHROPIC_API_KEY required.",
      )
    }
    const convex = new ConvexHttpClient(convexUrl)

    // Step 1 — load the plan markdown.
    const plan = await step.run("load-plan", async () => {
      return await convex.query(api.specs.getPlan, {
        projectId: data.projectId as Id<"projects">,
      })
    })
    if (!plan?.planMarkdown) {
      throw new NonRetriableError(
        "eval/run: project has no plan; nothing to grade.",
      )
    }

    // Step 1.5 — D-031 mechanical lints. Load the project's UI files
    // and run the Next.js lint bundle. Findings are passed into the
    // Evaluator prompt so they become part of the verdict + issues.
    const lintFindings = await step.run("run-lints", async () => {
      const allFiles = await convex.query(api.system.getProjectFilesInternal, {
        internalKey,
        projectId: data.projectId as Id<"projects">,
      })
      // Lints expect FileForLint = { path, content }. Filter binaries.
      const lintInputFiles = (allFiles ?? [])
        .filter(
          (f: { type?: string; path?: string; content?: string }) =>
            f.type === "file" && typeof f.content === "string" && f.path,
        )
        .map((f: { path?: string; content?: string }) => ({
          path: f.path!,
          content: f.content!,
        }))
      return runLints(nextJsLints, lintInputFiles)
    })

    // Step 2 — run the Evaluator with lint findings folded in.
    const report = await step.run("evaluator-call", async () => {
      const evaluator = new Evaluator({ apiKey: anthropicKey })
      return await evaluator.evaluate({
        sprint: data.sprint,
        planMarkdown: plan.planMarkdown!,
        projectId: data.projectId,
        lintFindings,
      })
    })

    // Step 3 — surface the verdict in the chat as an assistant message.
    await step.run("surface-verdict", async () => {
      const summary =
        `**Evaluator verdict: ${report.verdict}**\n\n` +
        `Functionality: ${report.scores.functionality}/5 — ${report.rationale.functionality}\n` +
        `Code quality: ${report.scores.codeQuality}/5 — ${report.rationale.codeQuality}\n` +
        `Design: ${report.scores.design}/5 — ${report.rationale.design}\n` +
        `Build health: ${report.scores.buildHealth}/5 — ${report.rationale.buildHealth}\n\n` +
        `${report.summary}`
      const conv = await convex.query(api.system.getConversationById, {
        internalKey,
        conversationId: data.conversationId as Id<"conversations">,
      })
      if (conv) {
        await convex.mutation(api.system.createMessage, {
          internalKey,
          conversationId: data.conversationId as Id<"conversations">,
          projectId: conv.projectId,
          role: "assistant",
          content: summary,
          status: "completed",
        })
      }
    })

    // Step 4 — Score-aware healing loop decision.
    // Instead of a simple "RETURN-FOR-FIX → always retry up to N",
    // use the 5-rule retry ladder to decide.
    if (report.verdict === "RETURN-FOR-FIX" && report.issues.length > 0) {
      const currentScore = normalizeScores(report.scores)
      const healingCtx: HealingContext = {
        attempt: data.roundIndex,
        currentScore,
        previousScore: data.previousScore ?? null,
        currentIssues: report.issues,
        previousIssues: data.previousIssues ?? null,
      }

      const decision = shouldRetry(healingCtx, HEALING_CONFIG)

      if (decision.retry) {
        // Build a surgical healing prompt instead of just prepending raw issues
        const healingPrompt = buildHealingPrompt(
          report.issues,
          data.roundIndex,
          HEALING_CONFIG.maxAttempts,
        )

        await step.run("dispatch-fix-round", async () => {
          await inngest.send({
            name: "agent/run",
            data: {
              messageId: `eval_round_${data.roundIndex + 1}_${data.sprint}`,
              conversationId: data.conversationId,
              projectId: data.projectId,
              userId: data.userId,
              evalIssues: report.issues,
              healingPrompt, // surgical healing prompt for the agent
              sprint: data.sprint,
              evalRoundIndex: data.roundIndex + 1,
              // Pass score/issues forward for the next round's delta tracking
              previousScore: currentScore,
              previousIssues: report.issues,
            },
          })
        })

        return {
          verdict: report.verdict,
          scores: report.scores,
          healingDecision: "retry",
          normalizedScore: currentScore,
        }
      }

      // Decision was to NOT retry — surface the reason
      return {
        verdict: report.verdict,
        scores: report.scores,
        healingDecision: "stop",
        stopReason: decision.reason,
        normalizedScore: currentScore,
      }
    }

    return { verdict: report.verdict, scores: report.scores }
  },
)
