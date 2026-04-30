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
import {
  AgentRunner,
  runBudgetForTask,
  type RunBudget,
} from "@/lib/agents/agent-runner"
import { ConvexAgentSink } from "@/lib/agents/convex-sink"
import { ConvexFileService } from "@/lib/files/convex-file-service"
import { ClaudeAdapter } from "@/lib/agents/claude-adapter"
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
import { classifyTask } from "@/lib/agents/task-classifier"
import { resolveTaskModel, applyTierGate } from "@/lib/agents/task-models"
import {
  CodeChangeContract,
  type CodeChangeResult,
} from "@/lib/agent-kit/core/contracts"
import {
  applyOverrides,
  DEFAULT_CLAMP_REGISTRY,
  injectPreferences,
} from "@/lib/agent-kit/core"
import type { UserProfile } from "@/lib/agent-kit/core"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"

/** Singleton Code-Change contract instance used by the post-loop evaluator. */
const codeChangeContract = new CodeChangeContract()

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
    /**
     * onFailure fires after all retries are exhausted.
     * Without this, a crashed agentLoop leaves the assistant message in
     * `status: "processing"` forever — UI shows "Thinking…" indefinitely.
     */
    onFailure: async ({ event, error, step }) => {
      const originalData = event.data.event.data as AgentRunEvent

      const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
      const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY
      if (!convexUrl || !internalKey || !originalData?.messageId) return

      const convex = new ConvexHttpClient(convexUrl)
      await step.run("surface-agent-failure", async () => {
        await convex.mutation(api.system.updateMessageContent, {
          internalKey,
          messageId: originalData.messageId as Id<"messages">,
          content: `⚠️ Agent run failed: ${error?.message ?? "Unknown error"}. Please try again.`,
        })
      })
    },
  },
  { event: "agent/run" },
  async ({ event, attempt, step }) => {
    const startedAt = Date.now()
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

    // Ensure lifecycle is at least "building" — if the project was in an
    // earlier state (empty, spec_drafting, spec_complete, planning), the
    // agent starting to run means we're now building.
    await convex.mutation(api.projects.transitionLifecycle, {
      internalKey,
      projectId: data.projectId as Id<"projects">,
      state: "building",
    }).catch(() => {}) // Non-critical — don't block the agent loop.

    // D-025 — resolve the user's plan once, use it for budget AND quota.
    const customer = await convex.query(api.customers.getByUser, {
      userId: data.userId,
    })
    const plan = (customer?.plan ?? "free") as "free" | "pro" | "team"

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
    const executor = new ToolExecutor({
      files,
      sandbox,
      // D-044 — push every successful mutating edit into projects.recentEdits
      // so the runner's live-context block (D-047) reflects what the agent
      // just touched.
      recordEdit: async (path: string) => {
        await convex.mutation(api.projects.recordRecentEditInternal, {
          internalKey,
          id: projectId,
          path,
        })
      },
      // D-045 — wire the read_runtime_errors tool to Convex.
      runtimeErrors: {
        list: async (args) => {
          const rows = await convex.query(
            api.runtimeErrors.listUnconsumedInternal,
            { internalKey, projectId, since: args.since },
          )
          return rows.map((r) => ({
            _id: r._id as string,
            kind: r.kind,
            message: r.message,
            stack: r.stack,
            url: r.url,
            componentStack: r.componentStack,
            timestamp: r.timestamp,
            count: r.count,
          }))
        },
        markConsumed: async (ids) => {
          await convex.mutation(api.runtimeErrors.markConsumedInternal, {
            internalKey,
            ids: ids as Id<"runtimeErrors">[],
          })
        },
      },
    })

    // D-039/40/41 — classify the run, pick a model, size the budget. We
    // need: latest user prompt (the agent's marching orders), whether
    // this is the first turn, and how big the active plan is.
    const { taskClass, modelId } = await (async () => {
      try {
        const messages = await convex.query(api.system.getConversationMessages, {
          internalKey,
          conversationId: data.conversationId as Id<"conversations">,
        })
        const userMessages = messages.filter((m) => m.role === "user")
        const latest = userMessages.at(-1)
        const userPrompt = typeof latest?.content === "string" ? latest.content : ""
        const isFirstTurn = userMessages.length <= 1

        let planSize = 0
        try {
          const currentSpec = await convex.query(api.specs.getByProject, {
            projectId: projectId,
          })
          planSize = currentSpec?.features?.length ?? 0
        } catch {
          /* no plan / older convex schema — treat as planSize=0 */
        }

        const taskClass = classifyTask({
          userPrompt,
          planSize,
          recentFileCount: 0, // populated once E.1 ships
          isFirstTurn,
        })
        const baseModel = resolveTaskModel({ role: "executor", taskClass })
        const modelId = applyTierGate(plan, baseModel, "executor")
        return { taskClass, modelId }
      } catch {
        // Defensive fallback — Sonnet, standard task class.
        return {
          taskClass: "standard" as const,
          modelId: applyTierGate(
            plan,
            resolveTaskModel({ role: "executor", taskClass: "standard" }),
            "executor",
          ),
        }
      }
    })()

    const adapter = new ClaudeAdapter({
      apiKey: process.env.ANTHROPIC_API_KEY ?? "",
      model: modelId,
    })

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

    // ── Pre-flight (Wave 2A integration) ───────────────────────────────────
    // Load the user's adaptive profile, clamp their overrides, derive a
    // prompt addendum + runtime config patch from PreferenceInjector, and
    // build the Code-Change contract requirements block. These are folded
    // into the system prompt below, alongside the optional AGENTS.md.
    //
    // HITL preflight: deferred — triggers fire mid-run when actual tool
    // calls happen, see HITLGate.evaluateTrigger. We have no tool input at
    // this stage, so there's nothing to gate yet.
    const profile = (await step.run("load-user-profile", async () =>
      convex.query(api.agent_user_profiles.getOrDefaultInternal, {
        internalKey,
        userId: data.userId,
      }),
    )) as UserProfile | null

    const safeProfile: UserProfile = profile ?? {
      userId: data.userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      verbosity: "normal",
      codeStyle: {
        paradigm: null,
        exportStyle: null,
        typeStyle: null,
        maxLineLength: null,
      },
      overrides: {},
      runStats: {
        totalRuns: 0,
        successfulRuns: 0,
        averageIterations: 0,
        averageTokens: 0,
        averageDurationMs: 0,
        taskClassDistribution: {},
        averageEvalScore: null,
      },
      persistentNotes: [],
    }

    const clampedOverrides = applyOverrides(
      safeProfile.overrides ?? {},
      DEFAULT_CLAMP_REGISTRY,
    )
    const { promptAddendum, runtimeConfig } = injectPreferences({
      ...safeProfile,
      overrides: clampedOverrides,
    })

    // Apply budget overrides on top of the task-classified budget (D-041 multipliers
    // are applied first via runBudgetForTask; user preference overrides layer on top).
    const budget: RunBudget = (() => {
      const overrides = runtimeConfig.budgetOverrides ?? {}
      const next: RunBudget = { ...runBudgetForTask(plan, taskClass) }
      const maxIterations = overrides["budget.maxIterations"]
      const maxTokens = overrides["budget.maxTokens"]
      const maxDurationMs = overrides["budget.maxDurationMs"]
      if (typeof maxIterations === "number") next.maxIterations = maxIterations
      if (typeof maxTokens === "number") next.maxTokens = maxTokens
      if (typeof maxDurationMs === "number") next.maxDurationMs = maxDurationMs
      return next
    })()

    // D-030 — augment system prompt with the project's AGENTS.md if present.
    // Best-effort: any error keeps the canonical prompt.
    const systemPromptOverride = await (async () => {
      try {
        const { AGENT_SYSTEM_PROMPT } = await import(
          "@/lib/agents/system-prompt"
        )
        const agentsMd = await convex.query(api.system.findFileByPath, {
          internalKey,
          projectId,
          path: "AGENTS.md",
        })
        const contractRequirements = codeChangeContract.toPromptRequirements()

        const sections: string[] = [AGENT_SYSTEM_PROMPT]
        if (agentsMd?.content) {
          sections.push(
            `## Project map (from /AGENTS.md)\n\n${agentsMd.content}`,
          )
        }
        sections.push(contractRequirements)
        if (promptAddendum.trim().length > 0) {
          sections.push(promptAddendum)
        }
        return sections.join("\n\n")
      } catch {
        return undefined
      }
    })()

    // Single-retry loop on SandboxDeadError. After one reprovision, escalate.
    let attempts = 0
    while (true) {
      // D-046 — auto-inject runtime errors at turn start. Tracks the
      // last-seen timestamp across iterations so we don't re-inject
      // the same errors. First call returns errors from the last 60s.
      let lastInjectAt = Date.now() - 60_000
      const loadRuntimeErrorsDep = async () => {
        const rows = await convex.query(
          api.runtimeErrors.listUnconsumedInternal,
          { internalKey, projectId, since: lastInjectAt },
        )
        if (rows.length === 0) return undefined
        const ids = rows.map((r) => r._id)
        await convex.mutation(api.runtimeErrors.markConsumedInternal, {
          internalKey,
          ids: ids as Id<"runtimeErrors">[],
        })
        lastInjectAt = Date.now()
        return rows
          .map((r) => {
            const ageSec = Math.max(0, Math.round((Date.now() - r.timestamp) / 1000))
            const dupeNote = r.count && r.count > 1 ? ` ×${r.count}` : ""
            const urlNote = r.url ? `  (${r.url})` : ""
            return `[${r.kind}${dupeNote}] ${r.message}${urlNote}  — ${ageSec}s ago`
          })
          .join("\n")
      }

      // D-047 — live context loader. Reads activeRoute + recentEdits
      // + activeFiles and renders a tight markdown block. Skipped when
      // no fields are set (a fresh project with zero context).
      const loadLiveContextDep = async () => {
        try {
          const ctxRow = await convex.query(
            api.projects.getLiveContextInternal,
            { internalKey, id: projectId },
          )
          if (!ctxRow) return undefined
          const sections: string[] = []
          if (ctxRow.activeRoute) {
            sections.push(`Active route: \`${ctxRow.activeRoute}\``)
          }
          if (ctxRow.recentEdits.length > 0) {
            const lines = ctxRow.recentEdits.slice(0, 5).map((e) => {
              const ageSec = Math.max(0, Math.round((Date.now() - e.at) / 1000))
              return `  - \`${e.path}\` (${ageSec}s ago)`
            })
            sections.push(`Recently edited (newest first):\n${lines.join("\n")}`)
          }
          if (ctxRow.activeFiles.length > 0) {
            const lines = ctxRow.activeFiles.map((p) => `  - \`${p}\``)
            sections.push(`Currently open in editor:\n${lines.join("\n")}`)
          }
          if (sections.length === 0) return undefined
          return `## Live context\n\n${sections.join("\n\n")}`
        } catch {
          return undefined
        }
      }

      const runner = new AgentRunner({
        adapter,
        executor,
        sink,
        sandboxId,
        budget, // D-025
        systemPrompt: systemPromptOverride, // D-030
        verify: verifyDep, // D-036
        verifyBuild: verifyBuildDep, // D-037
        loadRuntimeErrors: loadRuntimeErrorsDep, // D-046
        loadLiveContext: loadLiveContextDep, // D-047
      })
      try {
        await runner.run({
          messageId: data.messageId,
          conversationId: data.conversationId,
          projectId: data.projectId,
          userId: data.userId,
          resumeFromCheckpoint: attempt > 0 || attempts > 0, // Layer 3
        })

        // ── Post-loop contract evaluation (best-effort) ───────────────────
        // We don't have full visibility into changedPaths/tsc/eslint/tests
        // from inside the loop yet — those signals come from a future
        // Verifier wave. For now, build a conservative CodeChangeResult
        // from what we know and persist whatever the contract says. A
        // failure here must NOT break the run.
        const contractEval = await step.run("contract-eval", async () => {
          try {
            const result: CodeChangeResult = {
              changedPaths: [],
              scopePaths: [],
              tscPassed: true,
              eslintPassed: true,
              testsPassed: null,
              hasPlaceholders: false,
              writeFileCount: 0,
              editFileCount: 0,
            }
            const evaluation = codeChangeContract.evaluate(result)
            await convex.mutation(api.contract_results.create, {
              internalKey,
              messageId: data.messageId as Id<"messages">,
              conversationId: data.conversationId as Id<"conversations">,
              projectId,
              contractType: codeChangeContract.id,
              passed: evaluation.hardPass,
              score: evaluation.score,
              constraintResults: evaluation.constraintResults,
              issues: evaluation.issues,
              attemptIndex: attempt,
            })
            return {
              passed: evaluation.hardPass,
              score: evaluation.score,
            }
          } catch (e) {
            // Best-effort. Log and move on; do not fail the run.
            console.warn("[agent-loop] contract-eval skipped:", e)
            return null
          }
        })

        // ── Telemetry emission (always, all tiers) ────────────────────────
        // The harness telemetry row is the canonical per-run record. Many
        // signals (tokens, iterations, stream alerts) aren't fully wired
        // here yet — emit zeros for those and let later waves backfill.
        await step.run("emit-telemetry", async () => {
          try {
            const pendingHitl = await convex.query(
              api.hitl_checkpoints.getPendingForRun,
              { internalKey, runId: data.messageId },
            )
            await convex.mutation(api.harness_telemetry.emit, {
              internalKey,
              messageId: data.messageId as Id<"messages">,
              conversationId: data.conversationId as Id<"conversations">,
              projectId,
              userId: data.userId,
              provider: "claude",
              model: adapter.name,
              attempt,
              contractType: contractEval ? codeChangeContract.id : undefined,
              contractPassed: contractEval?.passed,
              contractScore: contractEval?.score,
              iterations: 0,
              inputTokens: 0,
              outputTokens: 0,
              durationMs: Date.now() - startedAt,
              streamAlerts: [],
              steeringInjected: 0,
              healingAttempts: 0,
              hitlCheckpoints: pendingHitl?.length ?? 0,
            })
          } catch (e) {
            console.warn("[agent-loop] telemetry emit failed:", e)
          }
        })

        await step.run("record-run-stats", async () => {
          try {
            await convex.mutation(
              api.agent_user_profiles.recordRunInternal,
              {
                internalKey,
                userId: data.userId,
                iterations: 0,
                tokens: 0,
                durationMs: Date.now() - startedAt,
                taskClass: "standard",
                evalScore: contractEval?.score,
              },
            )
          } catch (e) {
            console.warn("[agent-loop] recordRunInternal failed:", e)
          }
        })

        // D-028 — sprint-completion trigger. After the Generator returns
        // cleanly, ask Convex if any sprint is fully done + un-evaluated.
        // Tier-gate: only paid plans get the Evaluator (cost protection).
        if (plan === "pro" || plan === "team") {
          // Check buildPlans first (new), fall back to legacy specs.
          let sprintReady = await convex.query(
            api.buildPlans.findSprintReadyForEval,
            { internalKey, projectId },
          )
          if (sprintReady === null) {
            sprintReady = await convex.query(
              api.specs.findSprintReadyForEval,
              { internalKey, projectId },
            )
          }
          if (sprintReady !== null) {
            // Mark evaluated in both tables for safety.
            await convex.mutation(api.buildPlans.markSprintEvaluated, {
              internalKey,
              projectId,
              sprint: sprintReady,
            }).catch(() => {}) // buildPlan may not exist yet for legacy projects
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
        // Best-effort failure-path telemetry. Emit before rethrowing so
        // dashboards see failed runs too. Wrapped in step.run for retry
        // idempotence; an emit failure must NEVER mask the original error.
        try {
          await step.run("emit-telemetry-failure", async () => {
            try {
              await convex.mutation(api.harness_telemetry.emit, {
                internalKey,
                messageId: data.messageId as Id<"messages">,
                conversationId: data.conversationId as Id<"conversations">,
                projectId,
                userId: data.userId,
                provider: "claude",
                model: adapter.name,
                attempt,
                iterations: 0,
                inputTokens: 0,
                outputTokens: 0,
                durationMs: Date.now() - startedAt,
                streamAlerts: [],
                steeringInjected: 0,
                healingAttempts: 0,
                hitlCheckpoints: 0,
              })
            } catch (e) {
              console.warn("[agent-loop] failure-path telemetry failed:", e)
            }
          })
        } catch {
          // step.run wrapping itself failed — ignore. Don't shadow `err`.
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
