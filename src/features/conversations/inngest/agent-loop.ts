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
import {
  getSandboxProvider,
  SandboxDeadError,
} from "@/lib/sandbox"
import { ToolExecutor } from "@/lib/tools/executor"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"

const SANDBOX_TTL_MS = 24 * 60 * 60 * 1000

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

    // D-018 — sandbox provider singleton. Selection is env-driven inside
    // `getSandboxProvider()` (mock when no E2B_API_KEY, else E2B).
    const sandbox = getSandboxProvider()

    // Resolve the per-project sandbox: reuse if alive + within TTL,
    // otherwise provision and persist.
    const projectId = data.projectId as Id<"projects">
    const ensureSandbox = async (): Promise<string> => {
      const existing = await convex.query(api.sandboxes.getByProject, {
        internalKey,
        projectId,
      })
      const now = Date.now()
      if (existing && existing.alive && existing.expiresAt > now) {
        return existing.sandboxId
      }
      const handle = await sandbox.create("nextjs", { timeoutMs: SANDBOX_TTL_MS })
      await convex.mutation(api.sandboxes.setForProject, {
        internalKey,
        projectId,
        sandboxId: handle.id,
        expiresAt: now + SANDBOX_TTL_MS,
      })
      return handle.id
    }

    let sandboxId = await ensureSandbox()

    const sink = new ConvexAgentSink({ convex, internalKey })
    const files = new ConvexFileService({ convex })
    const executor = new ToolExecutor({ files, sandbox })
    const adapter = getAdapter("claude")

    // Single-retry loop on SandboxDeadError. After one reprovision, escalate.
    let attempts = 0
    while (true) {
      const runner = new AgentRunner({
        adapter,
        executor,
        sink,
        sandboxId,
      })
      try {
        await runner.run({
          messageId: data.messageId,
          conversationId: data.conversationId,
          projectId: data.projectId,
          userId: data.userId,
          resumeFromCheckpoint: attempt > 0 || attempts > 0, // Layer 3
        })
        return
      } catch (err) {
        if (err instanceof SandboxDeadError && attempts === 0) {
          attempts += 1
          await convex.mutation(api.sandboxes.markDead, {
            internalKey,
            sandboxId,
          })
          sandboxId = await ensureSandbox()
          continue
        }
        if (err instanceof SandboxDeadError) {
          throw new NonRetriableError(
            "Sandbox died twice in one run; aborting to avoid retry storm.",
          )
        }
        throw err
      }
    }
  },
)
