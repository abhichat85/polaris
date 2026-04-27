# Polaris

> **The spec-driven AI coding agent for India & SEA.** Powered by Praxiom — [www.praxiomai.xyz](https://www.praxiomai.xyz). Shipping at **[build.praxiomai.xyz](https://build.praxiomai.xyz)**.

Polaris turns prompts (and Praxiom specs) into running, testable, deployable
applications. The agent operates inside a per-project E2B sandbox: it writes
code, runs `npm install`, sees TypeScript errors, iterates on its own
runtime feedback, and ships.

## What makes Polaris different

| Capability | v0/Bolt/Lovable | Polaris |
|---|---|---|
| Generates code | ✅ | ✅ |
| Sees its own runtime errors | ❌ | ✅ (E2B sandbox + `run_command`) |
| Multi-tenant workspaces | ❌ | ✅ |
| Spec-driven (Praxiom integration) | ❌ | ✅ (contract live; integration in flight) |
| Browser-side preview (instant) | varies | ✅ (WebContainer) |
| Server-side execution (real Linux) | ❌ | ✅ (E2B) |
| Live tool-output streaming in chat | ❌ | ✅ |

## Quick start

```bash
git clone https://github.com/abhichat85/polaris
cd polaris
pnpm install
cp .env.example .env.local                # fill in keys (see RUNBOOK.md)

# Two terminals:
pnpm convex:dev                           # Convex schema + functions watcher
pnpm dev                                  # Next.js

# One-time admin:
npx convex run plans:seedDefaults
npx convex run migrations/create_personal_workspaces:run
npx convex run migrations/verify_workspace_backfill:run   # confirm zero unscoped
```

Open `http://localhost:3000`. See [`docs/RUNBOOK.md`](docs/RUNBOOK.md) for env
vars and common operational scenarios.

## Architecture (one paragraph)

The browser runs **WebContainer** for instant preview + xterm. The agent
runs server-side in Inngest jobs against the **E2B** sandbox singleton
(`getSandboxProvider()`); it has 8 tools (read, write, edit, create,
delete, list, search, run_command). Every project owns one sandbox,
persisted in `sandboxes` Convex table, reprovisioned on
`SandboxDeadError`. Code lives in Convex (source of truth); files sync
to the sandbox before each run. **Quota** gates fire at 3 entry points
(`/api/messages`, agent-loop, github-export) consulting `plans` table
joined with `customers.plan`. **Stripe** webhook idempotently activates
subscriptions via `webhook_events`. **Workspaces** multi-tenancy:
`projects.workspaceId` resolves via cookie (`polaris_active_workspace`)
or falls back to the user's first workspace.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full diagram.

## Tech stack

- **Frontend** — Next.js 16 (App Router), React 19, Tailwind v4, Praxiom Design System
- **Backend** — Convex (DB + functions + reactive queries)
- **Auth** — Clerk
- **Background jobs** — Inngest
- **Sandboxes** — WebContainer (browser) + E2B (server)
- **LLM** — raw `@anthropic-ai/sdk` (Vercel AI SDK stripped per D-007)
- **Billing** — Stripe (Checkout + Portal + idempotent webhooks)
- **Rate limiting** — Upstash Ratelimit (Redis)
- **Observability** — Sentry (performance spans + alert runbook)
- **Tests** — Vitest (unit) + Playwright (E2E)

## Documentation

- [`docs/CONSTITUTION.md`](docs/CONSTITUTION.md) — 21 articles, ~16k words. Architectural law.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — agent loop sequence + sandbox lifecycle + data flow.
- [`docs/RUNBOOK.md`](docs/RUNBOOK.md) — common scenarios + their fixes.
- [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md) — Praxiom design system v2.0.
- [`docs/runbooks/sentry-alerts.md`](docs/runbooks/sentry-alerts.md) — Sentry alert rule recipes.
- [`docs/superpowers/plans/`](docs/superpowers/plans/) — executed implementation plans.

## Status

- **Constitution:** D-001 through D-022 (sandbox lifecycle, plans seeding, workspaces, Stripe webhook idempotency, internal-quota pattern).
- **Audit compliance:** 100% per [`docs/superpowers/plans/2026-04-27-final-completion-plan.md`](docs/superpowers/plans/2026-04-27-final-completion-plan.md).
- **License:** MIT.

## Contributing

The Constitution governs. Read it before opening a PR. Amendments
require a new D-NNN entry per Article XXI.

— Authors, 2026-04
