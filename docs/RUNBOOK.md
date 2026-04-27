# Polaris Runbook

> Operational guide for common scenarios. Keep this current — every paged
> incident that doesn't appear here is a runbook gap.

## Setup (first-time pull)

```bash
pnpm install
cp .env.example .env.local              # then fill in keys (see below)
pnpm convex:dev                          # leave running — pushes schema + functions
# In a separate terminal — one-time admin steps:
npx convex run plans:seedDefaults
npx convex run migrations/create_personal_workspaces:run
# Optional verification:
npx convex run migrations/verify_workspace_backfill:run
pnpm dev                                  # starts Next.js
```

## Required env vars

| Var | Where used | Notes |
|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | Frontend + server | from Convex dashboard |
| `CONVEX_DEPLOYMENT` | `pnpm convex:dev` | from Convex dashboard |
| `POLARIS_CONVEX_INTERNAL_KEY` | Server-only auth gate | base64 random |
| `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_*` | Auth | Clerk dashboard |
| `ANTHROPIC_API_KEY` | Agent LLM | Anthropic console |
| `STRIPE_SECRET_KEY` | `/api/billing/*` | Stripe dashboard |
| `STRIPE_WEBHOOK_SECRET` | `/api/billing/webhook` | from Stripe webhook config |
| `E2B_API_KEY` | Server-side sandbox | E2B dashboard. Falls back to mock when unset. |
| `UPSTASH_REDIS_REST_URL` + `_TOKEN` | Rate limiting | falls back to in-process limiter |
| `SENTRY_DSN` | Errors + perf | Sentry project |
| `INNGEST_EVENT_KEY` + `_SIGNING_KEY` | Background jobs | Inngest cloud |

## Common scenarios

### "Could not find public function for X" in the browser

The Convex deployment is missing the function. Run:

```bash
pnpm convex:dev   # leave it running
```

Hard-refresh the browser. If still broken, check `convex/_generated/api.d.ts`
for the function name; if missing there, your local `convex/X.ts` source has
a TypeScript error preventing push — see the dev-server output for the error.

### Settings page errors with `getCurrent`

Same root cause — `convex:dev` not running or hasn't pushed.

### WebContainer "Only a single instance can be booted"

The bundle in your browser is from before commit `61dd8ca` (the singleton
fix). Hard-refresh (Cmd+Shift+R) and restart `pnpm dev`. If still broken,
check `src/features/editor/context/webcontainer-context.tsx` for the
module-scoped `bootPromise` singleton.

### Agent runs are slow / timing out

1. Check Sentry: P95 of `agent.iteration` > 8s? P95 of `prompt.to.preview`
   > 120s? See `docs/runbooks/sentry-alerts.md`.
2. Check the sandbox: `convex.query` `sandboxes.getByProject` for the
   stuck project. If `alive=false`, the next agent run will reprovision.
3. Check Anthropic / E2B status pages.

### Quota limit hit unexpectedly

- Confirm the `plans` table is seeded: `npx convex run plans:seedDefaults`.
- Check the user's plan: `customers.getByUser` Convex query.
- Tier numbers live in `convex/plans.ts:SEED_ROWS`. Edit + re-run
  `seedDefaults` to update (idempotent).

### Stripe webhook 500s

1. Verify `STRIPE_WEBHOOK_SECRET` matches the webhook endpoint in Stripe.
2. Check `webhook_events` table: are duplicates being marked? If yes,
   idempotency is working — Stripe is just retrying due to a previous
   handler failure.
3. Check `customers.upsertFromWebhook` mutation logs in Convex dashboard.
4. Stripe → Developers → Webhooks → click endpoint → Send test event.

### "No Stripe price for tier X" on /api/billing/checkout

In Stripe dashboard, the products for Pro / Team must have a `lookup_key`
of `polaris_pro` and `polaris_team` respectively. Set via:

```
stripe prices create --product prod_XX --unit-amount 2000 --currency usd \
  --recurring interval=month --lookup-key polaris_pro
```

### Rate-limited unexpectedly (429)

- Check Upstash dashboard for the key prefix matching the bucket
  (`agent:free:USERID`, `http:pro:USERID`, etc.).
- Per-tier multipliers in `src/lib/rate-limit/middleware.ts:PLAN_MULTIPLIER`.
- If Upstash is unavailable, the in-process `TokenBucketLimiter` takes
  over per process — bucket state resets on each Vercel cold start.

### Workspace migration not run

Symptom: `Settings → Workspace` shows "you don't have a workspace yet".

```bash
npx convex run migrations/create_personal_workspaces:run
```

(Idempotent — re-running is a no-op.)

### Praxiom import returns 501

Expected. Per CONSTITUTION §18.5, the integration arrives after the
coding-agent core is verified. The route exists at
`src/app/api/praxiom/import/route.ts` so the UI can target it now and
stop returning 404; it returns 501 with `trackingIssue: "POL-18"`.

### CI: build fails on `from "ai"` not found

We dropped the Vercel AI SDK in commit `<phase-5>`. If a file imports from
`"ai"`, replace with `"./types"` (the local replacement at
`src/components/ai-elements/types.ts`).

## Disaster scenarios

### Convex deployment is frozen

- Read-only is acceptable for several minutes; agents will fail.
- If extended, page on-call. There is no automatic failover.

### Stripe webhook delivery is paused

- Subscriptions can't activate until webhooks resume.
- The customer sees "still on free" after paying — known UX gap.
- Once webhooks resume, the missed events replay from Stripe; idempotency
  prevents double-application.
