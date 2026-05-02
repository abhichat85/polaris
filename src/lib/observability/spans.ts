/**
 * Sentry performance spans for Polaris's hot paths.
 *
 * Authority: CONSTITUTION §14 budgets:
 *   - prompt.to.preview     : <60s P50, <120s P95
 *   - agent.iteration       : <3s P50, <8s P95
 *   - sandbox.boot          : <8s P50, <15s P95
 *   - tool.run_command      : <60s
 *
 * Wrap a hot-path function with `withSpan(name, op, fn)` and Sentry
 * captures duration + automatically attaches it to the active trace.
 * Sentry is initialised by `sentry.{server,edge}.config.ts` at process
 * start; this helper is a no-op when Sentry isn't active.
 */

import * as Sentry from "@sentry/nextjs"

export type SpanOp =
  | "agent.iteration"
  | "prompt.to.preview"
  | "sandbox.boot"
  | "sandbox.claim_warm"
  | "tool.run_command"
  | "convex.query"
  | "convex.mutation"
  | "stripe.webhook"

/**
 * Wrap an async function in a Sentry span. The span name is `op` for
 * grouping in dashboards; `name` is the human-readable description.
 *
 * Errors propagate. Spans are tagged with the budget threshold so an
 * alert rule can fire when P95 trends past §14 numbers.
 */
export async function withSpan<T>(
  op: SpanOp,
  name: string,
  fn: () => Promise<T>,
  attributes?: Record<string, string | number | boolean>,
): Promise<T> {
  return Sentry.startSpan(
    {
      op,
      name,
      attributes: {
        ...attributes,
        "polaris.budget_p50_ms": BUDGET_P50_MS[op] ?? 0,
        "polaris.budget_p95_ms": BUDGET_P95_MS[op] ?? 0,
      },
    },
    fn,
  )
}

const BUDGET_P50_MS: Partial<Record<SpanOp, number>> = {
  "agent.iteration": 3_000,
  "prompt.to.preview": 60_000,
  "sandbox.boot": 8_000,
  "tool.run_command": 60_000,
}

const BUDGET_P95_MS: Partial<Record<SpanOp, number>> = {
  "agent.iteration": 8_000,
  "prompt.to.preview": 120_000,
  "sandbox.boot": 15_000,
  "tool.run_command": 60_000,
}
