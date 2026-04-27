# Sentry Alert Rules — Polaris

> Authority: CONSTITUTION §14 (performance budgets) + §15 (observability).
> Configure these in the Sentry dashboard under Alerts → Create Alert Rule.

The `withSpan(op, name, fn)` helper at `src/lib/observability/spans.ts` tags
each span with `polaris.budget_p50_ms` and `polaris.budget_p95_ms`. Configure
these alert rules to page on-call when budgets are violated.

## P95 of `prompt.to.preview` > 120s

- **Condition:** `event.span.op == "prompt.to.preview"` AND `p95(span.duration) > 120000`
- **Time window:** 5 minutes
- **Severity:** page on-call (`#oncall` Slack)
- **Why:** §14 budget. P95 is the most important — P50 is informational.

## P95 of `agent.iteration` > 8s

- **Condition:** `event.span.op == "agent.iteration"` AND `p95(span.duration) > 8000`
- **Time window:** 10 minutes
- **Severity:** page on-call
- **Why:** §14 budget. Slow iteration = the agent feels broken.

## Error rate on `/api/messages` > 1%

- **Condition:** `event.transaction == "POST /api/messages"` AND `error_rate > 1%`
- **Time window:** 5 minutes
- **Severity:** page on-call
- **Why:** /api/messages is the primary user-facing endpoint.

## Stripe webhook handler error rate > 0% over 1 hour

- **Condition:** `event.transaction == "POST /api/billing/webhook"` AND `error_count > 0`
- **Time window:** 1 hour
- **Severity:** page billing-on-call
- **Why:** Stripe retries on 500, but a sustained pattern means we're missing
  events — money on the floor.

## Sandbox boot duration P95 > 15s

- **Condition:** `event.span.op == "sandbox.boot"` AND `p95(span.duration) > 15000`
- **Time window:** 15 minutes
- **Severity:** notify-only (no page)
- **Why:** §14 budget. Slow boots are an E2B-side issue first; alert so we
  can correlate with E2B status page.

## run_command timeout rate

- **Condition:** `event.span.op == "tool.run_command"` AND `count where span.duration > 60000`
- **Time window:** 1 hour
- **Severity:** notify-only
- **Why:** Spike of timeouts = either a flaky sandbox or a model that's
  generating runaway commands.

## Setup checklist

- [ ] Sentry project exists with `SENTRY_DSN` set in production env
- [ ] `sentry.server.config.ts` and `sentry.edge.config.ts` import the SDK
      and call `Sentry.init({...})`
- [ ] `tracesSampleRate` set to at least 0.1 in production
- [ ] PagerDuty / Opsgenie integration connected to `#oncall`
- [ ] On-call rotation defined for the next 4 weeks
