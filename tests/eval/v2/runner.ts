/**
 * Real-Eval v2 runner — D-048 (plan H.1 part 2).
 *
 * Drives a single scenario end-to-end:
 *   1. Provision an isolated workspace (fresh tmp dir for the generated
 *      app — for now uses an InMemoryFileService instead of a real
 *      Convex project; the v2 harness assumes the agent path is being
 *      tested against the SAME ToolExecutor / verifier / model wiring
 *      the production agent uses, but with a local sandbox).
 *   2. Apply preSeed files (used by "fix-runtime-bug" scenarios).
 *   3. Send the user prompt through the real agent loop using a
 *      ScriptedAdapter is NOT what we want here — we want the REAL
 *      ClaudeAdapter. So this runner accepts the adapter as a dep so
 *      tests can mock at the boundary they need.
 *   4. After agent.markDone, boot the generated app via runApp callback
 *      (the dep is responsible for `npm run build && npm run start`).
 *   5. Open the running URL in headless Chromium, run each assertion,
 *      capture screenshots, record results.
 *   6. Tear down: close browser, kill app process.
 *
 * Returns a `ScenarioResult` shaped per `./types.ts`.
 *
 * Design note: this runner does NOT depend on Convex/Inngest. The
 * production agent loop wires those; the eval harness wires fake/mock
 * sinks so the harness can run locally in CI without any cloud deps.
 * The point of v2 is to verify quality of the AGENT'S OUTPUT, not the
 * Convex/Inngest plumbing (which has its own integration tests).
 */

import { mkdtemp, rm, writeFile, mkdir } from "fs/promises"
import { tmpdir } from "os"
import { join, dirname } from "path"
import type { Browser, BrowserContext, Page } from "playwright"
import type {
  AssertionHelpers,
  AssertionResult,
  RealEvalScenario,
  ScenarioResult,
} from "./types"

export interface RunScenarioDeps {
  /** Drive the agent against the scaffolded workspace. Returns counters
   * for the report. The implementation owns ClaudeAdapter, ToolExecutor,
   * AgentSink — same shape as agent-loop.ts but with local-disk
   * FileService instead of Convex. */
  runAgent: (input: {
    workspaceDir: string
    prompt: string
    budget: RealEvalScenario["budget"]
  }) => Promise<{
    agentDoneStatus: "completed" | "error" | "cancelled"
    iterationCount: number
    inputTokens: number
    outputTokens: number
    errorMessage?: string
  }>
  /** Boot the generated app (e.g. `npm run build && npm run start`).
   * Returns the URL the app is serving on + a kill function. */
  runApp: (input: {
    workspaceDir: string
  }) => Promise<{ url: string; kill: () => Promise<void> }>
  /** Open headless Chromium. Caller passes in the browser so multiple
   * scenarios share one instance. */
  browser: Browser
  /** Where to write screenshots. */
  screenshotsDir: string
  /** Test seam — defaults to Date.now(). */
  now?: () => number
}

const DEFAULT_ASSERTION_TIMEOUT_MS = 15_000

export async function runScenario(
  scenario: RealEvalScenario,
  deps: RunScenarioDeps,
): Promise<ScenarioResult> {
  const now = deps.now ?? Date.now
  const startedAt = now()

  // 1. Workspace
  const workspaceDir = await mkdtemp(join(tmpdir(), `polaris-eval-${scenario.id}-`))

  // 2. Pre-seed files
  if (scenario.preSeed) {
    for (const [relPath, content] of Object.entries(scenario.preSeed)) {
      const abs = join(workspaceDir, relPath)
      await mkdir(dirname(abs), { recursive: true })
      await writeFile(abs, content, "utf8")
    }
  }

  let agentDoneStatus: "completed" | "error" | "cancelled" = "error"
  let iterationCount = 0
  let inputTokens = 0
  let outputTokens = 0
  let agentErrorMessage: string | undefined
  const assertions: AssertionResult[] = []

  let appHandle: { url: string; kill: () => Promise<void> } | undefined
  let context: BrowserContext | undefined
  let page: Page | undefined

  try {
    // 3. Run the agent
    const agentResult = await deps.runAgent({
      workspaceDir,
      prompt: scenario.prompt,
      budget: scenario.budget,
    })
    agentDoneStatus = agentResult.agentDoneStatus
    iterationCount = agentResult.iterationCount
    inputTokens = agentResult.inputTokens
    outputTokens = agentResult.outputTokens
    agentErrorMessage = agentResult.errorMessage

    // Short-circuit: if the agent didn't finish cleanly, skip the
    // build+drive step. The report still shows what happened.
    if (agentResult.agentDoneStatus !== "completed") {
      return {
        scenarioId: scenario.id,
        status: agentResult.agentDoneStatus === "error" ? "error" : "fail",
        durationMs: now() - startedAt,
        iterationCount,
        inputTokens,
        outputTokens,
        agentDoneStatus,
        agentErrorMessage,
        assertions: [],
      }
    }

    // 4. Boot the generated app
    appHandle = await deps.runApp({ workspaceDir })

    // 5. Open Chromium + run assertions
    context = await deps.browser.newContext({
      viewport: { width: 1280, height: 800 },
    })
    page = await context.newPage()
    const consoleMessages: string[] = []
    page.on("console", (msg) => {
      consoleMessages.push(`[${msg.type()}] ${msg.text()}`)
    })

    for (const assertion of scenario.postBuild) {
      const aStart = now()
      const slots: string[] = []
      const localConsole: string[] = []
      const consoleStartIdx = consoleMessages.length

      const helpers: AssertionHelpers = {
        screenshot: async (slot, opts) => {
          const file = join(deps.screenshotsDir, scenario.id, `${assertion.id}-${slot}.png`)
          await mkdir(dirname(file), { recursive: true })
          await page!.screenshot({ path: file, fullPage: opts?.fullPage ?? false })
          slots.push(slot)
        },
        url: (path = "/") => `${appHandle!.url}${path}`,
        consoleMessages: () => consoleMessages.slice(consoleStartIdx),
      }

      const timeout = assertion.timeoutMs ?? DEFAULT_ASSERTION_TIMEOUT_MS
      let aStatus: "pass" | "fail" | "error" = "pass"
      let errorMessage: string | undefined

      try {
        await withTimeout(assertion.run(page, helpers), timeout, assertion.id)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        aStatus = msg.startsWith("AssertionError") ? "fail" : "error"
        errorMessage = msg
      }

      // Snapshot console for THIS assertion's window.
      localConsole.push(...consoleMessages.slice(consoleStartIdx))

      assertions.push({
        id: assertion.id,
        description: assertion.description,
        status: aStatus,
        durationMs: now() - aStart,
        errorMessage,
        consoleMessages: localConsole,
        screenshotSlots: slots,
      })
    }
  } finally {
    if (page) await page.close().catch(() => undefined)
    if (context) await context.close().catch(() => undefined)
    if (appHandle) await appHandle.kill().catch(() => undefined)
    await rm(workspaceDir, { recursive: true, force: true }).catch(() => undefined)
  }

  const status =
    assertions.length === 0
      ? "fail"
      : assertions.every((a) => a.status === "pass")
        ? "pass"
        : assertions.some((a) => a.status === "error")
          ? "error"
          : "fail"

  return {
    scenarioId: scenario.id,
    status,
    durationMs: now() - startedAt,
    iterationCount,
    inputTokens,
    outputTokens,
    agentDoneStatus,
    agentErrorMessage,
    assertions,
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`Assertion '${label}' timed out after ${ms}ms`)),
      ms,
    )
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}
