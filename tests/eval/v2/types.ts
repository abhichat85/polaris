/**
 * Real-Eval v2 — D-048.
 *
 * Plan H.1 of `docs/superpowers/plans/2026-04-28-10x-output-quality.md`.
 *
 * The v1 eval suite (`tests/eval/quality-scenarios.test.ts`) measures
 * *process* — did the agent use edit_file vs write_file, did it read
 * before editing. Useful for fast pre-commit signal but says nothing
 * about whether the OUTPUT actually works.
 *
 * v2 boots the generated app, drives it with Playwright, and asserts
 * visual + behavioral correctness. This file is the contract; the
 * runner (./runner.ts) and scenarios (./scenarios/*.ts) implement
 * against it.
 */

import type { Page } from "playwright"

/**
 * A single end-to-end scenario. The runner provisions a fresh project,
 * sends the prompt through the real agent loop, waits for completion,
 * boots the generated app (`npm run start` over `npm run build`), opens
 * it in headless Chromium, and runs each `postBuild` assertion.
 */
export interface RealEvalScenario {
  /** Stable kebab-case id, e.g. "01-static-marketing-page". Used in
   * baseline filenames + CI report. */
  id: string
  /** One-sentence description shown in eval report. */
  title: string
  /** The exact user prompt sent to the agent. */
  prompt: string
  /** Optional image attachments (Phase D — pasted screenshots). */
  attachments?: { kind: "image"; pngPath: string }[]
  /** Per-scenario budget. Hard caps; the runner aborts on exceed. */
  budget: {
    maxIterations: number
    maxTokens: number
    maxWallClockMs: number
  }
  /** Assertions run after the agent claims completion + the app boots. */
  postBuild: PlaywrightAssertion[]
  /** Optional pre-set scaffold contents the runner injects before the
   * agent starts. Used by 06-fix-runtime-bug to seed a known broken
   * state. Map of POSIX path → file content. */
  preSeed?: Record<string, string>
}

export interface PlaywrightAssertion {
  /** Stable kebab-case id, used in the report. */
  id: string
  /** What the assertion checks, in plain English. */
  description: string
  /** Throws on failure. The runner catches, records, and moves on to
   * the next assertion so a single broken assertion doesn't fail the
   * whole scenario. */
  run: (page: Page, helpers: AssertionHelpers) => Promise<void>
  /** Maximum time the assertion's `run` can take. Default 15s. */
  timeoutMs?: number
}

export interface AssertionHelpers {
  /** Capture a screenshot at the named slot for visual-diff baselines. */
  screenshot: (slot: string, opts?: { fullPage?: boolean }) => Promise<void>
  /** Resolve a path relative to the running preview app. */
  url: (path?: string) => string
  /** Console messages captured during assertion. */
  consoleMessages: () => readonly string[]
}

export interface ScenarioResult {
  scenarioId: string
  status: "pass" | "fail" | "error"
  durationMs: number
  iterationCount: number
  inputTokens: number
  outputTokens: number
  agentDoneStatus: "completed" | "error" | "cancelled"
  agentErrorMessage?: string
  assertions: AssertionResult[]
}

export interface AssertionResult {
  id: string
  description: string
  status: "pass" | "fail" | "error"
  durationMs: number
  errorMessage?: string
  /** Console messages observed during the assertion run. */
  consoleMessages: string[]
  /** Screenshot slots captured during this assertion. */
  screenshotSlots: string[]
}

export interface EvalRunReport {
  startedAt: number
  finishedAt: number
  passed: number
  failed: number
  errored: number
  scenarios: ScenarioResult[]
}
