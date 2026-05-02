/**
 * Plan clarification dispatcher — Phase 3.3.
 *
 * The executor agent fires `plan/clarification` events when it calls
 * the `request_planner_input` tool. This Inngest function picks up
 * the event, asks Haiku-Sonnet for a focused answer (acting as the
 * planner subagent), and writes the answer back to Convex so the
 * executor's polling loop sees it.
 *
 * Lightweight implementation: a single Haiku call with the question
 * + plan context. A future iteration can route to a heavier planner
 * agent that re-reads the codebase before answering.
 */

import { ConvexHttpClient } from "convex/browser"
import { NonRetriableError } from "inngest"
import Anthropic from "@anthropic-ai/sdk"
import { inngest } from "@/inngest/client"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { CLAUDE_HAIKU_4_5 } from "@/lib/agents/task-models"

const PLANNER_SYSTEM_PROMPT = `You are the planner subagent for Polaris, an AI engineer that builds web apps.

The execution agent is asking you a clarifying question mid-run. Answer in 1-3 short paragraphs. Be DECISIVE — they need a clear direction so they can keep building. If the question is ambiguous, ask back: "I'd answer X, but I need to know Y first." Don't write code; describe the decision.

Output plain text. No JSON, no markdown headings.`

interface PlanClarificationEvent {
  data: {
    clarificationId: string
    question: string
    planSummary?: string
  }
}

export const planClarificationDispatcher = inngest.createFunction(
  {
    id: "plan-clarification-dispatcher",
    name: "Planner Subagent — Clarification Dispatcher",
    retries: 1,
  },
  { event: "plan/clarification" },
  async ({ event, step }) => {
    const data = (event as unknown as PlanClarificationEvent).data
    if (!data?.clarificationId || !data?.question) {
      throw new NonRetriableError(
        "plan/clarification event missing required fields",
      )
    }

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY
    const anthropicKey = process.env.ANTHROPIC_API_KEY
    if (!convexUrl || !internalKey || !anthropicKey) {
      throw new NonRetriableError(
        "NEXT_PUBLIC_CONVEX_URL + POLARIS_CONVEX_INTERNAL_KEY + ANTHROPIC_API_KEY required.",
      )
    }
    const convex = new ConvexHttpClient(convexUrl)

    // Confirm the row is still pending (executor may have given up + timed out).
    const row = await step.run("load-clarification", async () =>
      convex.query(api.agent_plans.getClarificationInternal, {
        internalKey,
        id: data.clarificationId as Id<"plan_clarifications">,
      }),
    )
    if (!row || row.status !== "pending") {
      return { skipped: row ? `status=${row.status}` : "row-missing" }
    }

    // Ask Haiku for an answer.
    const answer = await step.run("call-haiku", async () => {
      const client = new Anthropic({ apiKey: anthropicKey })
      const userContent = data.planSummary
        ? `Plan context:\n${data.planSummary}\n\nQuestion: ${data.question}`
        : `Question: ${data.question}`
      const resp = await client.messages.create({
        model: CLAUDE_HAIKU_4_5,
        max_tokens: 600,
        system: [
          {
            type: "text",
            text: PLANNER_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userContent }],
      })
      const block = resp.content.find((b) => b.type === "text")
      return block && block.type === "text" ? block.text.trim() : ""
    })

    if (!answer) {
      return { skipped: "haiku-empty-response" }
    }

    await step.run("write-answer", async () =>
      convex.mutation(api.agent_plans.answerClarificationInternal, {
        internalKey,
        id: data.clarificationId as Id<"plan_clarifications">,
        answer,
      }),
    )

    return { answered: true, answerLength: answer.length }
  },
)
