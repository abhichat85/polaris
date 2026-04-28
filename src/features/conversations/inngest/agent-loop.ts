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
import { AgentRunner, runBudget } from "@/lib/agents/agent-runner"
import { ConvexAgentSink } from "@/lib/agents/convex-sink"
import { ConvexFileService } from "@/lib/files/convex-file-service"
import { getAdapter } from "@/lib/agents/registry"
import {
  getSandboxProvider,
  SandboxDeadError,
} from "@/lib/sandbox"
import { ToolExecutor } from "@/lib/tools/executor"
import { withSpan } from "@/lib/observability/spans"
import { verify, verifyBuild } from "@/lib/agents/verifier"
import {
  resolveVerificationPolicy,
  shouldWireVerify,
  shouldWireVerifyBuild,
} from "@/lib/agents/verification-policy"
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

    // D-025 — resolve the user's plan once, use it for budget AND quota.
    const customer = await convex.query(api.customers.getByUser, {
      userId: data.userId,
    })
    const plan = (customer?.plan ?? "free") as "free" | "pro" | "team"
    const budget = runBudget(plan)

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
      const handle = await withSpan(
        "sandbox.boot",
        `provision sandbox for ${projectId}`,
        () => sandbox.create("nextjs", { timeoutMs: SANDBOX_TTL_MS }),
        { projectId, provider: sandbox.name },
      )
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

    // D-038 — resolve per-project verification policy. Project may have a
    // sparse override of the tier defaults (free off, pro/team on).
    // Best-effort: any error keeps verification disabled.
    const verificationFlags = await (async () => {
      try {
        const project = await convex.query(api.projects.getById, {
          id: projectId,
        })
        return resolveVerificationPolicy(plan, project?.verification)
      } catch {
        return resolveVerificationPolicy(plan, undefined)
      }
    })()

    // D-036/D-037 — wire verifier deps when policy enables them. Both
    // pass deps.exec bound to this sandbox so the verifier doesn't need
    // its own sandbox handle.
    const verifyDep = shouldWireVerify(verificationFlags)
      ? (paths: ReadonlySet<string>) =>
          verify(paths, {
            exec: (cmd, opts) => sandbox.exec(sandboxId, cmd, opts ?? {}),
          })
      : undefined
    const verifyBuildDep = shouldWireVerifyBuild(verificationFlags)
      ? () =>
          verifyBuild({
            exec: (cmd, opts) => sandbox.exec(sandboxId, cmd, opts ?? {}),
          })
      : undefined

    // D-030 — augment system prompt with the project's AGENTS.md if present.
    // Best-effort: any error keeps the canonical prompt.
    const systemPromptOverride = await (async () => {
      try {
        const agentsMd = await convex.query(api.system.findFileByPath, {
          internalKey,
          projectId,
          path: "AGENTS.md",
        })
        if (!agentsMd?.content) return undefined
        const { AGENT_SYSTEM_PROMPT } = await import("@/lib/agents/system-prompt")
        return `${AGENT_SYSTEM_PROMPT}\n\n## Project map (from /AGENTS.md)\n\n${agentsMd.content}`
      } catch {
        return undefined
      }
    })()

    // Single-retry loop on SandboxDeadError. After one reprovision, escalate.
    let attempts = 0
    while (true) {
      const runner = new AgentRunner({
        adapter,
        executor,
        sink,
        sandboxId,
        budget, // D-025
        systemPrompt: systemPromptOverride, // D-030
        verify: verifyDep, // D-036
        verifyBuild: verifyBuildDep, // D-037
      })
      try {
        await runner.run({
          messageId: data.messageId,
          conversationId: data.conversationId,
          projectId: data.projectId,
          userId: data.userId,
          resumeFromCheckpoint: attempt > 0 || attempts > 0, // Layer 3
        })
        // D-028 — sprint-completion trigger. After the Generator returns
        // cleanly, ask Convex if any sprint is fully done + un-evaluated.
        // Tier-gate: only paid plans get the Evaluator (cost protection).
        if (plan === "pro" || plan === "team") {
          const sprintReady = await convex.query(
            api.specs.findSprintReadyForEval,
            { internalKey, projectId },
          )
          if (sprintReady !== null) {
            await convex.mutation(api.specs.markSprintEvaluated, {
              internalKey,
              projectId,
              sprint: sprintReady,
            })
            await inngest.send({
              name: "eval/run",
              data: {
                projectId: data.projectId,
                conversationId: data.conversationId,
                sprint: sprintReady,
                roundIndex: 0,
                userId: data.userId,
              },
            })
          }
        }
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
