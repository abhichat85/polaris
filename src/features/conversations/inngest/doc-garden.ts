/**
 * Wave 4.2 — Doc-gardener (D-027 + D-030 maintenance loop).
 *
 * Two Inngest functions:
 *   1. `docGardenScheduler` — cron, fires once every 24h. Reserved for
 *      future per-tenant fan-out (TODO once the workspace + recent-
 *      activity Convex query lands). For now it runs but does not
 *      enqueue any per-project garden runs — it's the wiring stub.
 *   2. `docGarden` — per-project run. Triggered by the
 *      `doc-garden/run` event with `{ projectId, conversationId, plan }`
 *      payload. Loads project state through Convex, runs the pure
 *      `detectDrift`, posts a single assistant message with findings.
 *
 * Tier-gated: paid plans only. The free tier doesn't get this signal —
 * it's a polish feature, not a correctness feature.
 *
 * Why split scheduler from worker:
 *   Inngest cron functions can't fan out events directly with retries
 *   and step-level checkpointing. Splitting lets each project be its
 *   own retried/observable run.
 */

import { ConvexHttpClient } from "convex/browser"
import { NonRetriableError } from "inngest"

import { inngest } from "@/inngest/client"

import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { detectDrift, renderDriftReport } from "./doc-garden-detect"

interface DocGardenEvent {
  projectId: string
  conversationId: string
  /** Used for tier-gating + tagging the surfaced message. */
  plan: "free" | "pro" | "team"
}

export const docGardenScheduler = inngest.createFunction(
  {
    id: "doc-garden-scheduler",
    name: "Doc-gardener daily scheduler",
    retries: 0,
  },
  // Every day at 09:00 UTC. Picked to land before the European workday
  // so users see notices when they sit down to code.
  { cron: "0 9 * * *" },
  async ({ step }) => {
    // v1 stub: emits a marker event. Per-tenant fan-out lands once the
    // `listGardenCandidates` Convex query is added (it needs schema-level
    // workspace + activity tracking that's already in `workspaces` and
    // `messages.createdAt` but not yet stitched into a single query).
    await step.run("scheduler-tick", async () => {
      // Intentionally empty. The shape is here so the cron is observable
      // in the Inngest dashboard immediately; the fan-out is a follow-up.
      return { tickedAt: Date.now() }
    })
    return { tickedAt: Date.now() }
  },
)

export const docGarden = inngest.createFunction(
  {
    id: "doc-garden",
    name: "Polaris doc-gardener",
    retries: 1,
  },
  { event: "doc-garden/run" },
  async ({ event, step }) => {
    const data = event.data as DocGardenEvent
    if (!data?.projectId || !data?.conversationId || !data?.plan) {
      throw new NonRetriableError(
        "doc-garden/run event missing projectId/conversationId/plan",
      )
    }

    if (data.plan === "free") {
      return { skipped: "free-tier" }
    }

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY
    if (!convexUrl || !internalKey) {
      throw new NonRetriableError(
        "NEXT_PUBLIC_CONVEX_URL + POLARIS_CONVEX_INTERNAL_KEY required.",
      )
    }
    const convex = new ConvexHttpClient(convexUrl)

    // Step 1 — pull project doc state.
    const state = await step.run("load-state", async () => {
      const [agentsMdFile, notesMdFile, plan] = await Promise.all([
        convex.query(api.system.findFileByPath, {
          internalKey,
          projectId: data.projectId as Id<"projects">,
          path: "AGENTS.md",
        }),
        convex.query(api.system.findFileByPath, {
          internalKey,
          projectId: data.projectId as Id<"projects">,
          path: ".polaris/notes.md",
        }),
        convex.query(api.specs.getPlan, {
          projectId: data.projectId as Id<"projects">,
        }),
      ])

      return {
        agentsMdContent: agentsMdFile?.content ?? null,
        notesMdContent: notesMdFile?.content ?? null,
        features: plan?.features ?? [],
        lastActivityAt: plan?.updatedAt ?? Date.now(),
      }
    })

    // Step 2 — pure detection.
    const findings = detectDrift({
      agentsMdContent: state.agentsMdContent,
      notesMdContent: state.notesMdContent,
      features: state.features.map((f: {
        id: string
        status: "todo" | "in_progress" | "done" | "blocked"
        updatedAt?: number
      }) => ({
        id: f.id,
        status: f.status,
        updatedAt: f.updatedAt,
      })),
      lastActivityAt: state.lastActivityAt,
      now: Date.now(),
    })

    // Step 3 — surface, but only when there's something to say. Suppress
    // the clean-bill-of-health post for paid users; it would just be noise.
    if (findings.clean) {
      return { findings: [], posted: false }
    }

    await step.run("surface-message", async () => {
      const conv = await convex.query(api.system.getConversationById, {
        internalKey,
        conversationId: data.conversationId as Id<"conversations">,
      })
      if (!conv) return
      await convex.mutation(api.system.createMessage, {
        internalKey,
        conversationId: data.conversationId as Id<"conversations">,
        projectId: conv.projectId,
        role: "assistant",
        content: renderDriftReport(findings),
        status: "completed",
      })
    })

    return {
      findings: findings.notices.map((n) => n.id),
      posted: true,
    }
  },
)
