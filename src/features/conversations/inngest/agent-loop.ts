/**
 * agentLoop — Inngest function that drives the new AgentRunner.
 * Authority: sub-plan 01 §19, CONSTITUTION §10 (Convex source of truth).
 *
 * Listens for `agent/run` events. Distinct from the legacy `processMessage`
 * (event "message/sent") so the two paths can coexist while sub-plan 04 ports
 * the UI to fire the new event. Once the UI is migrated, the legacy function
 * can be deleted (Article XIX migration).
 *
 * Event payload shape:
 *   {
 *     messageId: Id<"messages">,
 *     conversationId: Id<"conversations">,
 *     projectId: Id<"projects">,
 *     userId: string,
 *     sandboxId?: string | null,   // sub-plan 02 will populate
 *   }
 *
 * Inngest retry semantics (`attempt > 0`) trigger Layer 3 of error recovery
 * (resume from checkpoint).
 */

import { ConvexHttpClient } from "convex/browser"
import { NonRetriableError } from "inngest"
import { inngest } from "@/inngest/client"
import { AgentRunner } from "@/lib/agents/agent-runner"
import { ConvexAgentSink } from "@/lib/agents/convex-sink"
import { ConvexFileService } from "@/lib/files/convex-file-service"
import { getAdapter } from "@/lib/agents/registry"
import { MockSandboxProvider } from "@/lib/sandbox/mock-provider"
import { ToolExecutor } from "@/lib/tools/executor"
import { api } from "../../../../convex/_generated/api"

interface AgentRunEvent {
  messageId: string
  conversationId: string
  projectId: string
  userId: string
  sandboxId?: string | null
}

export const agentLoop = inngest.createFunction(
  {
    id: "agent-loop",
    name: "Polaris Agent Loop",
    retries: 3,
    cancelOn: [
      // Cancel an in-flight run when the client posts to /api/messages/cancel.
      { event: "agent/cancel", if: "event.data.messageId == async.data.messageId" },
    ],
  },
  { event: "agent/run" },
  async ({ event, attempt }) => {
    const data = event.data as AgentRunEvent
    if (!data?.messageId || !data?.conversationId || !data?.projectId || !data?.userId) {
      throw new NonRetriableError("agent/run event missing required fields")
    }

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY
    if (!convexUrl || !internalKey) {
      throw new NonRetriableError(
        "NEXT_PUBLIC_CONVEX_URL and POLARIS_CONVEX_INTERNAL_KEY must be set.",
      )
    }
    const convex = new ConvexHttpClient(convexUrl)

    // Constitution §17 — pre-loop quota check. NonRetriableError so Inngest
    // doesn't burn retries on a quota wall.
    const quota = await convex.query(api.plans.assertWithinQuotaInternal, {
      internalKey,
      userId: data.userId,
      op: "agent_run",
    })
    if (!quota.ok) {
      throw new NonRetriableError(
        `Quota exceeded (${quota.reason}: ${quota.current}/${quota.limit}). Upgrade at /pricing.`,
      )
    }

    // Sub-plan 02 will swap this for the real E2BSandboxProvider singleton.
    // Until then, scaffolds and edits run against an in-memory mock so the
    // pipeline is exercised end-to-end without an E2B account.
    const sandbox = new MockSandboxProvider()

    const sink = new ConvexAgentSink({ convex, internalKey })
    const files = new ConvexFileService({ convex })
    const executor = new ToolExecutor({ files, sandbox })
    const adapter = getAdapter("claude")
    const runner = new AgentRunner({
      adapter,
      executor,
      sink,
      sandboxId: data.sandboxId ?? null,
    })

    await runner.run({
      messageId: data.messageId,
      conversationId: data.conversationId,
      projectId: data.projectId,
      userId: data.userId,
      resumeFromCheckpoint: attempt > 0, // Layer 3 of error recovery
    })
  },
)
