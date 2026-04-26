/**
 * Deploy pipeline. Authority: sub-plan 07 §pipeline.
 *
 * Provisions a Supabase project, runs SQL migrations, then ships the project's
 * files to Vercel as a Next.js app. Each of the 9 steps is a separate
 * `step.run` so Inngest can retry them independently. Polling steps use
 * `step.sleep` between status checks so we don't burn function time.
 *
 * Env vars required:
 *   - VERCEL_TOKEN
 *   - SUPABASE_MANAGEMENT_API_KEY
 *   - SUPABASE_ORG_ID
 *   - POLARIS_CONVEX_INTERNAL_KEY
 *   - NEXT_PUBLIC_CONVEX_URL
 */

import { ConvexHttpClient } from "convex/browser"
import { NonRetriableError } from "inngest"
import { inngest } from "@/inngest/client"
import { ConvexFileService } from "@/lib/files/convex-file-service"
import { api } from "@/../convex/_generated/api"
import type { Id } from "@/../convex/_generated/dataModel"
import type { FileService } from "@/lib/files/types"
import {
  SupabaseManagementClient,
  type SupabaseProjectStatus,
} from "../lib/supabase-client"
import { VercelClient, type VercelReadyState } from "../lib/vercel-client"
import { PIPELINE_STEPS, type PipelineStep } from "../lib/pipeline-steps"

export { PIPELINE_STEPS, type PipelineStep }

export interface DeployStartEvent {
  projectId: string
  userId: string
  deploymentId: string
  /** App name used for both Supabase + Vercel project. */
  appName: string
  /** Supabase region; defaults to us-east-1. */
  region?: string
  /** Generated db password. */
  dbPassword: string
}

interface ConvexLike {
  mutation: (ref: any, args: any) => Promise<any>
}

export interface PipelineDeps {
  convex: ConvexLike
  internalKey: string
  files: FileService
  supabase: SupabaseManagementClient
  vercel: VercelClient
  /** Override clock for tests. */
  now?: () => number
  /** Override sleep for tests. */
  sleep?: (ms: number) => Promise<void>
  /** Override polling intervals/timeouts for tests. */
  supabasePollIntervalMs?: number
  supabaseTimeoutMs?: number
  vercelPollIntervalMs?: number
  vercelTimeoutMs?: number
}

const SUPABASE_POLL_MS = 5_000
const SUPABASE_TIMEOUT_MS = 90_000
const VERCEL_POLL_MS = 5_000
const VERCEL_TIMEOUT_MS = 5 * 60_000

interface StepRunner {
  run<T>(name: string, fn: () => Promise<T>): Promise<T>
  sleep(name: string, ms: number): Promise<void>
}

/**
 * Pure orchestrator — exported for unit tests. The Inngest function (below)
 * adapts `step` to the StepRunner interface and calls this.
 */
export async function runDeployPipeline(
  event: DeployStartEvent,
  step: StepRunner,
  deps: PipelineDeps,
): Promise<{ liveUrl: string }> {
  const { convex, internalKey, files, supabase, vercel } = deps
  const deploymentId = event.deploymentId as Id<"deployments">
  const region = event.region ?? "us-east-1"

  let currentStep: PipelineStep = PIPELINE_STEPS[0]

  async function patch(args: {
    status:
      | "provisioning_db"
      | "running_migrations"
      | "env_capture"
      | "deploying"
    currentStep: PipelineStep
    vercelDeploymentId?: string
    supabaseProjectRef?: string
  }) {
    await convex.mutation(api.deployments.updateStep, {
      internalKey,
      deploymentId,
      ...args,
    })
  }

  async function failHere(stepName: PipelineStep, err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    try {
      await convex.mutation(api.deployments.markFailed, {
        internalKey,
        deploymentId,
        currentStep: stepName,
        errorMessage: message,
      })
    } catch {
      // best-effort
    }
  }

  try {
    // ── 1. Create Supabase project ──────────────────────────────────────────
    currentStep = "Create Supabase project"
    const supabaseProject = await step.run("create-supabase-project", async () => {
      await patch({ status: "provisioning_db", currentStep })
      const project = await supabase.createProject(
        event.appName,
        region,
        event.dbPassword,
      )
      await patch({
        status: "provisioning_db",
        currentStep,
        supabaseProjectRef: project.id,
      })
      return project
    })

    // ── 2. Wait for Supabase ready ──────────────────────────────────────────
    currentStep = "Wait for Supabase ready"
    await step.run("wait-supabase-ready", async () => {
      await patch({ status: "provisioning_db", currentStep })
      const start = (deps.now ?? Date.now)()
      const timeout = deps.supabaseTimeoutMs ?? SUPABASE_TIMEOUT_MS
      const interval = deps.supabasePollIntervalMs ?? SUPABASE_POLL_MS
      while ((deps.now ?? Date.now)() - start < timeout) {
        const proj = await supabase.getProject(supabaseProject.id)
        const status: SupabaseProjectStatus = proj?.status ?? "UNKNOWN"
        if (status === "ACTIVE_HEALTHY") return
        if (deps.sleep) await deps.sleep(interval)
        else await new Promise((r) => setTimeout(r, interval))
      }
      throw new Error(
        `Supabase project did not become ACTIVE_HEALTHY within ${timeout}ms`,
      )
    })

    // ── 3. Capture API keys ─────────────────────────────────────────────────
    currentStep = "Capture API keys"
    const apiKeys = await step.run("capture-api-keys", async () => {
      await patch({ status: "env_capture", currentStep })
      return supabase.getApiKeys(supabaseProject.id)
    })

    // ── 4. Run migrations ───────────────────────────────────────────────────
    currentStep = "Run migrations"
    await step.run("run-migrations", async () => {
      await patch({ status: "running_migrations", currentStep })
      // FileService.listPath returns absolute project paths in `files`, so we
      // can pass them straight to readPath.
      const list = await files.listPath(event.projectId, "supabase/migrations")
      const sqlPaths = list.files.filter((p) => p.endsWith(".sql")).sort()
      for (const path of sqlPaths) {
        const rec = await files.readPath(event.projectId, path)
        if (!rec || !rec.content.trim()) continue
        await supabase.runSQL(supabaseProject.id, rec.content)
      }
    })

    // ── 5. Read project files ───────────────────────────────────────────────
    currentStep = "Read project files"
    const fileTree = await step.run("read-project-files", async () => {
      await patch({ status: "deploying", currentStep })
      return collectAllFiles(files, event.projectId)
    })

    // ── 6. Ensure Vercel project ────────────────────────────────────────────
    currentStep = "Ensure Vercel project"
    await step.run("ensure-vercel-project", async () => {
      const existing = await vercel.getProject(event.appName)
      if (!existing) await vercel.createProject(event.appName, "nextjs")
    })

    // ── 7. Create Vercel deployment ─────────────────────────────────────────
    currentStep = "Create Vercel deployment"
    const deployment = await step.run("create-vercel-deployment", async () => {
      const supabaseUrl = `https://${supabaseProject.id}.supabase.co`
      const dpl = await vercel.createDeployment(event.appName, fileTree, {
        NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: apiKeys.anon,
      })
      await patch({
        status: "deploying",
        currentStep,
        vercelDeploymentId: dpl.id,
      })
      return dpl
    })

    // ── 8. Wait for Vercel build ────────────────────────────────────────────
    currentStep = "Wait for Vercel build"
    const finalDeployment = await step.run("wait-vercel-ready", async () => {
      const start = (deps.now ?? Date.now)()
      const timeout = deps.vercelTimeoutMs ?? VERCEL_TIMEOUT_MS
      const interval = deps.vercelPollIntervalMs ?? VERCEL_POLL_MS
      let last = deployment
      while ((deps.now ?? Date.now)() - start < timeout) {
        last = await vercel.getDeploymentStatus(deployment.id)
        const state: VercelReadyState = last.readyState
        if (state === "READY") return last
        if (state === "ERROR" || state === "CANCELED") {
          throw new Error(`Vercel build ${state.toLowerCase()}`)
        }
        if (deps.sleep) await deps.sleep(interval)
        else await new Promise((r) => setTimeout(r, interval))
      }
      throw new Error(`Vercel build did not finish within ${timeout}ms`)
    })

    // ── 9. Save live URL ────────────────────────────────────────────────────
    currentStep = "Save live URL"
    const liveUrl = `https://${finalDeployment.url}`
    await step.run("save-live-url", async () => {
      await convex.mutation(api.deployments.markSucceeded, {
        internalKey,
        deploymentId,
        liveUrl,
      })
    })

    return { liveUrl }
  } catch (err) {
    await step.run("handle-failure", async () => {
      await failHere(currentStep, err)
    })
    throw err
  }
}

async function collectAllFiles(
  files: FileService,
  projectId: string,
): Promise<{ file: string; data: string }[]> {
  const out: { file: string; data: string }[] = []
  // listPath returns absolute project paths in both `files` and `folders`, so
  // we recurse using the values directly without re-prefixing.
  async function walk(dir: string) {
    const list = await files.listPath(projectId, dir)
    for (const path of list.files) {
      const rec = await files.readPath(projectId, path)
      if (rec) out.push({ file: path, data: rec.content })
    }
    for (const sub of list.folders) {
      await walk(sub)
    }
  }
  await walk("")
  return out
}

// ── Inngest wiring ─────────────────────────────────────────────────────────

export const deployPipeline = inngest.createFunction(
  {
    id: "deploy-pipeline",
    name: "Polaris Deploy Pipeline",
    retries: 2,
  },
  { event: "deploy/start" },
  async ({ event, step }) => {
    const data = event.data as DeployStartEvent
    if (
      !data?.projectId ||
      !data?.userId ||
      !data?.deploymentId ||
      !data?.appName ||
      !data?.dbPassword
    ) {
      throw new NonRetriableError("deploy/start event missing required fields")
    }

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY
    const vercelToken = process.env.VERCEL_TOKEN
    const supabaseToken = process.env.SUPABASE_MANAGEMENT_API_KEY
    const supabaseOrgId = process.env.SUPABASE_ORG_ID

    if (
      !convexUrl ||
      !internalKey ||
      !vercelToken ||
      !supabaseToken ||
      !supabaseOrgId
    ) {
      throw new NonRetriableError(
        "Deploy pipeline missing one of: NEXT_PUBLIC_CONVEX_URL, POLARIS_CONVEX_INTERNAL_KEY, VERCEL_TOKEN, SUPABASE_MANAGEMENT_API_KEY, SUPABASE_ORG_ID",
      )
    }

    const convex = new ConvexHttpClient(convexUrl)
    const files = new ConvexFileService({ convex })
    const supabase = new SupabaseManagementClient({
      token: supabaseToken,
      orgId: supabaseOrgId,
    })
    const vercel = new VercelClient({ token: vercelToken })

    const stepAdapter: StepRunner = {
      run: (name, fn) => step.run(name, fn) as Promise<any>,
      sleep: (ms) => step.sleep("poll-wait", ms) as unknown as Promise<void>,
    }

    return runDeployPipeline(data, stepAdapter, {
      convex,
      internalKey,
      files,
      supabase,
      vercel,
    })
  },
)
