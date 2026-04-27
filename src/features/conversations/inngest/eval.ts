/**
 * D-028 — `eval/run` Inngest function.
 *
 * Triggered when the Generator finishes a sprint (all features in that
 * sprint are marked `done`). Runs the Evaluator agent and persists the
 * verdict + scores to convex/specs. If verdict is RETURN-FOR-FIX, fires
 * a follow-up `agent/run` event with the eval issues prepended to the
 * conversation so the Generator addresses them.
 *
 * Tier-gated: free tier skips the Evaluator entirely (no event emitted).
 * Pro/Team gets it. Plan check happens at the call site that emits the
 * `eval/run` event, not inside this function.
 *
 * Hard cap: max 3 eval rounds per sprint. After that, surface to user
 * for manual review.
 */

import { ConvexHttpClient } from "convex/browser"
import { NonRetriableError } from "inngest"

import { inngest } from "@/inngest/client"
import { Evaluator } from "@/lib/agents/evaluator"
import { runLints } from "@/lib/scaffold/lints/types"
import { nextJsLints } from "@/lib/scaffold/lints/nextjs"

import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"

interface EvalRunEvent {
  projectId: string
  conversationId: string
  sprint: number
  /** How many eval rounds have already happened for this sprint (0 → first run). */
  roundIndex: number
  userId: string
}

const MAX_EVAL_ROUNDS_PER_SPRINT = 3

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

    if (data.roundIndex >= MAX_EVAL_ROUNDS_PER_SPRINT) {
      // Don't loop forever; flag for human.
      return {
        verdict: "ESCALATE_TO_HUMAN",
        reason: `Sprint ${data.sprint} hit the ${MAX_EVAL_ROUNDS_PER_SPRINT}-round eval cap.`,
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
      // Use the standard createMessage path — there's no special "evaluator" role.
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

    // Step 4 — RETURN-FOR-FIX → re-fire agent/run with the issues.
    if (report.verdict === "RETURN-FOR-FIX" && report.issues.length > 0) {
      await step.run("dispatch-fix-round", async () => {
        await inngest.send({
          name: "agent/run",
          data: {
            messageId: `eval_round_${data.roundIndex + 1}_${data.sprint}`,
            conversationId: data.conversationId,
            projectId: data.projectId,
            userId: data.userId,
            evalIssues: report.issues,
            sprint: data.sprint,
            evalRoundIndex: data.roundIndex + 1,
          },
        })
      })
    }

    return { verdict: report.verdict, scores: report.scores }
  },
)
