#!/usr/bin/env tsx
/**
 * Real-eval v2 entrypoint — D-048 plan H.4.
 *
 * Run via `pnpm test:eval:real`. Reads scenarios from
 * `tests/eval/v2/scenarios/index.ts`, drives each through the runner
 * (real ClaudeAdapter, real Playwright), and writes a JSON report to
 * `tests/eval/v2/output/report.json`.
 *
 * Filtering:
 *   - EVAL_SCENARIO_IDS=01-foo,02-bar  → only run those ids
 *   - EVAL_UPDATE_BASELINES=true       → overwrite baselines
 *   - EVAL_BUDGET_USD_LIMIT=N          → soft cap; logged when exceeded
 *
 * NOTE: the agent-loop integration here is a placeholder skeleton —
 * provisioning a per-scenario Convex project + sandbox is out of scope
 * for this commit. The full driver lands in a follow-up that wires:
 *   - LocalDiskFileService for the workspace
 *   - InMemoryAgentSink so the eval doesn't hit Convex
 *   - ClaudeAdapter with the real ANTHROPIC_API_KEY
 *   - LocalSandboxProvider executing `npm run build && npm run start`
 *
 * What this script DOES today:
 *   - Loads scenarios + filters by env
 *   - Constructs the runner deps shape (with NotImplementedError stubs)
 *   - Iterates scenarios, captures errors, writes the report
 *
 * Result: in CI the script runs end-to-end against the report shape,
 * surfacing every scenario as `errored: not implemented` with a clear
 * message until the driver lands. This is intentional — the report
 * format + CI plumbing land separately from the live driver so each
 * piece can be reviewed independently.
 */

import { mkdir, writeFile } from "fs/promises"
import { join } from "path"
import type { Browser } from "playwright"
import {
  ALL_SCENARIOS,
  getScenario,
} from "../tests/eval/v2/scenarios/index"
import { runScenario } from "../tests/eval/v2/runner"
import type { EvalRunReport, ScenarioResult, RealEvalScenario } from "../tests/eval/v2/types"

const OUTPUT_DIR = "tests/eval/v2/output"

function selectScenarios(): RealEvalScenario[] {
  const ids = (process.env.EVAL_SCENARIO_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  if (ids.length === 0) return ALL_SCENARIOS
  const picked: RealEvalScenario[] = []
  for (const id of ids) {
    const s = getScenario(id)
    if (!s) {
      console.warn(`[eval-real] Unknown scenario id: ${id} — skipping`)
      continue
    }
    picked.push(s)
  }
  return picked
}

async function main() {
  const startedAt = Date.now()
  const scenarios = selectScenarios()
  console.log(`[eval-real] running ${scenarios.length} scenario(s)`)
  await mkdir(OUTPUT_DIR, { recursive: true })

  // Lazy-load Playwright so the script can fail-soft when chromium
  // isn't installed (CI sets it up via `playwright install`).
  let browser: Browser | undefined
  try {
    const { chromium } = await import("playwright")
    browser = await chromium.launch({ headless: true })
  } catch (err) {
    console.error("[eval-real] Failed to launch chromium:", err)
  }

  const scenarioResults: ScenarioResult[] = []

  for (const scenario of scenarios) {
    const t0 = Date.now()
    console.log(`[eval-real] >> ${scenario.id}: ${scenario.title}`)
    try {
      if (!browser) throw new Error("Chromium browser not available")

      const result = await runScenario(scenario, {
        browser,
        screenshotsDir: join(OUTPUT_DIR, "screenshots"),
        runAgent: async () => {
          // Driver stub. The full agent-loop integration is gated
          // behind a follow-up commit that wires the local driver.
          throw new Error(
            "Agent driver not wired in this commit. Wire LocalDiskFileService + ClaudeAdapter + LocalSandboxProvider before running real-eval.",
          )
        },
        runApp: async () => {
          throw new Error("App boot driver not wired in this commit.")
        },
      })
      scenarioResults.push(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      scenarioResults.push({
        scenarioId: scenario.id,
        status: "error",
        durationMs: Date.now() - t0,
        iterationCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        agentDoneStatus: "error",
        agentErrorMessage: message,
        assertions: [],
      })
    }
  }

  if (browser) await browser.close().catch(() => undefined)

  const passed = scenarioResults.filter((r) => r.status === "pass").length
  const failed = scenarioResults.filter((r) => r.status === "fail").length
  const errored = scenarioResults.filter((r) => r.status === "error").length

  const report: EvalRunReport = {
    startedAt,
    finishedAt: Date.now(),
    passed,
    failed,
    errored,
    scenarios: scenarioResults,
  }

  const reportPath = join(OUTPUT_DIR, "report.json")
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8")
  console.log(`[eval-real] report → ${reportPath}`)
  console.log(
    `[eval-real] ${passed} passed / ${failed} failed / ${errored} errored`,
  )

  // Exit non-zero if anything failed or errored so CI surfaces it.
  process.exit(failed + errored === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error("[eval-real] fatal:", err)
  process.exit(2)
})
