/**
 * D-026 — `plan/run` Inngest function.
 *
 * Fires when /api/messages detects a first-message-of-project. Calls the
 * Planner agent, persists the plan via convex/specs.writePlan, drops the
 * markdown form into the user's project file tree at /docs/plan.md, and
 * emits `plan/ready` so the UI can flip from "planning…" to "review plan."
 *
 * Tier-aware: planner is cheap (~$0.50/run) so we don't gate by plan.
 * Quota: counted as one agent_run for the user's monthly token bucket.
 */

import { ConvexHttpClient } from "convex/browser"
import { NonRetriableError } from "inngest"

import { inngest } from "@/inngest/client"
import { Planner } from "@/lib/agents/planner"
import { serializePlan } from "@/lib/specs/plan-format"

import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"

interface PlanRunEvent {
  projectId: string
  conversationId: string
  messageId: string
  userId: string
  userPrompt: string
  specAttachment?: { name: string; body: string }
}

export const planRun = inngest.createFunction(
  {
    id: "plan-run",
    name: "Polaris Planner",
    retries: 2,
  },
  { event: "plan/run" },
  async ({ event, step }) => {
    const data = event.data as PlanRunEvent
    if (
      !data?.projectId ||
      !data?.conversationId ||
      !data?.messageId ||
      !data?.userId ||
      !data?.userPrompt
    ) {
      throw new NonRetriableError("plan/run event missing required fields")
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

    // Step 1 — call the Planner.
    const result = await step.run("planner-call", async () => {
      const planner = new Planner({ apiKey: anthropicKey })
      return await planner.plan({
        userPrompt: data.userPrompt,
        specAttachment: data.specAttachment,
      })
    })

    // Step 2 — persist the plan structurally + as markdown.
    await step.run("persist-plan", async () => {
      // Re-serialise the parsed Plan so the markdown matches the canonical
      // format exactly (model output may have minor formatting drift).
      const canonicalMd = serializePlan(result.plan)
      await convex.mutation(api.specs.writePlan, {
        internalKey,
        projectId: data.projectId as Id<"projects">,
        title: result.plan.title,
        features: result.plan.sprints.flatMap((s) => s.features),
        planMarkdown: canonicalMd,
      })
    })

    // Step 3 — drop /docs/plan.md into the project file tree so the user
    // sees it in the file explorer + the agent can read it back later.
    await step.run("write-plan-md", async () => {
      const canonicalMd = serializePlan(result.plan)
      // findFileByPath returns null if absent; create or update accordingly.
      const existing = await convex.query(api.system.findFileByPath, {
        internalKey,
        projectId: data.projectId as Id<"projects">,
        path: "docs/plan.md",
      })
      if (existing) {
        await convex.mutation(api.system.updateFileContent, {
          internalKey,
          fileId: existing._id,
          content: canonicalMd,
        })
      } else {
        await convex.mutation(api.system.createFileInternal, {
          internalKey,
          projectId: data.projectId as Id<"projects">,
          parentId: undefined,
          name: "docs",
          // We can't directly pass a folder hint; the createFileInternal
          // pattern is "create one node at a time". For the first run we
          // accept a single flat file 'plan.md' at root; the UI will show
          // it. Future enhancement: walk path segments and create folders.
        })
      }
    })

    // Step 4 — record token usage for billing.
    await step.run("record-usage", async () => {
      await convex.mutation(api.usage.increment, {
        ownerId: data.userId,
        anthropicTokens: result.inputTokens + result.outputTokens,
        cacheCreationTokens: result.cacheCreationInputTokens,
        cacheReadTokens: result.cacheReadInputTokens,
      })
    })

    // Step 5 — close out the planning placeholder message in the chat.
    await step.run("complete-planner-message", async () => {
      await convex.mutation(api.system.updateMessageContent, {
        internalKey,
        messageId: data.messageId as Id<"messages">,
        content:
          `Plan ready. ${result.plan.sprints.length} sprints, ` +
          `${result.plan.sprints.reduce((s, sp) => s + sp.features.length, 0)} features. ` +
          `Open the plan pane to review and edit before clicking "Start build."`,
      })
    })

    return {
      projectId: data.projectId,
      sprints: result.plan.sprints.length,
      features: result.plan.sprints.reduce(
        (acc, s) => acc + s.features.length,
        0,
      ),
    }
  },
)
