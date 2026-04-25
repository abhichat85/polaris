# Polaris Master Roadmap

> **Status:** Living tactical plan. Derives authority from `CONSTITUTION.md`. If this document conflicts with the Constitution, the Constitution wins.
>
> **Read:** This document tells you WHEN things happen and in WHAT ORDER. Read `CONSTITUTION.md` first for HOW and WHY. Read individual sub-plans in `plans/` for the line-by-line WHAT.

**Mission:** Ship Polaris — an AI-powered cloud IDE — as a standalone production product at `build.praxiomai.xyz` in 17 working days. Generated apps are full-stack Next.js + Supabase, portable, with one-click GitHub sync and Vercel deploy.

**Last updated:** 2026-04-26
**Constitution version:** 2026-04-26

---

## Table of Contents

- [1. Goals and Non-Goals](#1-goals-and-non-goals)
- [2. Architectural Decisions Reference](#2-architectural-decisions-reference)
- [3. Subsystem Decomposition (10 Sub-Plans)](#3-subsystem-decomposition-10-sub-plans)
- [4. 17-Day Phase Plan](#4-17-day-phase-plan)
- [5. Day 0 Prerequisites](#5-day-0-prerequisites)
- [6. Risk Register](#6-risk-register)
- [7. Definition of Done — Per Phase](#7-definition-of-done--per-phase)
- [8. Parallel Execution Strategy](#8-parallel-execution-strategy)
- [9. Open Decisions (Parking Lot)](#9-open-decisions-parking-lot)
- [10. Self-Review](#10-self-review)

---

## 1. Goals and Non-Goals

### 1.1 Goals (v1 standalone, 17 days)

1. User signs up, describes app, sees a running app in <90 seconds.
2. AI chat modifies multi-file projects with streaming progress and visible tool calls.
3. Live preview iframe stays in sync as files change (Convex → E2B sync, hot reload).
4. Code editor (CodeMirror) with existing inline AI (ghost text, Cmd+K) preserved and migrated to raw SDKs.
5. Manual spec panel — features, acceptance criteria, status — persisted per project.
6. GitHub: import existing repo, push commits, create new repo. Pre-push secret scanning.
7. Deploy: one-click to Vercel, with Supabase project auto-provisioned via Management API.
8. Billing: Stripe subscription + quota enforcement. Free / Pro / Team tiers.
9. Production hosting at `build.praxiomai.xyz` with SSL, monitoring, error tracking, status page.
10. Public signup flow with onboarding and legal pages (ToS, Privacy, DPA).
11. Resilient agent loop with all 4 error recovery layers (API retry, tool feedback, checkpoint+resume, hard limits).
12. Multi-model SDK abstraction (`ModelAdapter`) and sandbox abstraction (`SandboxProvider`) — wired but only Claude + E2B exposed in v1.

### 1.2 Non-Goals (Constitutional, see CONSTITUTION.md §1.3)

Explicitly deferred:
- Praxiomai integration (separate plan, post-launch)
- AI-inferred spec coverage (manual only in v1)
- Multi-model UI (Claude only; GPT/Gemini wired but hidden)
- Mobile / Flutter generation
- Real-time collaboration on a single project
- Enterprise compliance (SOC 2, SAML, audit logs)
- Self-hosted option for generated apps
- Templates library

---

## 2. Architectural Decisions Reference

All locked in `CONSTITUTION.md` Article XX (Decision Log). Quick reference:

| ID | Decision | Locked |
|---|---|---|
| D-001 | Sandbox = E2B behind `SandboxProvider` interface | 2026-04-25 |
| D-002 | Database = Convex (source of truth) | 2026-04-25 |
| D-003 | AI Models behind custom `ModelAdapter` (raw SDKs) | 2026-04-26 |
| D-004 | Consistency = Convex first, E2B second | 2026-04-26 |
| D-005 | Error Recovery = All 4 layers from Day 1 | 2026-04-26 |
| D-006 | File Model = Flat path (migrate from tree) | 2026-04-26 |
| D-007 | Vercel AI SDK = Stripped from existing routes | 2026-04-26 |
| D-008 | Schema Migration = Adapt to existing names | 2026-04-26 |
| D-009 | Generated Apps = Next.js 15 + Supabase | 2026-04-25 |
| D-010 | Branding = "Polaris by Praxiom" | 2026-04-25 |
| D-011 | Domain = build.praxiomai.xyz | 2026-04-25 |
| D-012 | Six Tools, no more *(superseded by D-017)* | 2026-04-26 |
| D-017 | Add `edit_file` as 7th tool | 2026-04-26 |
| D-013 | Loop Hard Limits = 50 iter / 150K tokens / 5 min | 2026-04-26 |
| D-014 | Free Tier = 50K tokens / 30 min E2B / 1 deploy | 2026-04-26 |
| D-015 | 17-Day Timeline | 2026-04-26 |

**Read full rationale in `CONSTITUTION.md` Article XX.**

---

## 3. Subsystem Decomposition (10 Sub-Plans)

Each sub-plan is a self-contained, testable, executable plan. Lives in `docs/plans/NN-name.md`. Written **just-in-time** before its phase starts so we incorporate learnings.

| # | Sub-plan | Phase | Days | Depends On | Description |
|---|---|---|---|---|---|
| 01 | **Agent Loop** | 1 | 1-3 | — | `processMessage` rewrite. ModelAdapter, ClaudeAdapter, AgentRunner, ToolExecutor, FilePermissionPolicy, all 4 error recovery layers, checkpoint persistence, hard limits |
| 02 | **E2B Sandbox** | 1 | 1-3 | Convex schema | SandboxProvider interface, E2BProvider impl, lifecycle (create/sync/preview/expire), file write hooks |
| 03 | **Scaffolding** | 1 | 2-3 | 01 | `/api/scaffold` — prompt → Next.js+Supabase file tree, FilePermissionPolicy validation, bulk-write to Convex, trigger sandbox boot |
| 04 | **Streaming UI** | 1 | 2-3 | 01 | Tool call card rendering, error states, cancel button wiring, optimistic mutations, message status visualization |
| 05 | **Spec Panel** | 1 | 3-4 | Convex schema | `specs` table CRUD, panel UI, feature card, acceptance criteria editor, status enum |
| 06 | **GitHub** | 2 | 5-6 | 01, 02 | OAuth (already partially wired), encrypted token storage, repo import (tree + content), push (commit creation), pre-push secret scanning (gitleaks) |
| 07 | **Deploy** | 2 | 6-8 | 06 | Vercel REST API client, Supabase Management API client, env var injection, deploy pipeline (provision DB → deploy → wait), status polling |
| 08 | **Billing** | 2 | 8-9 | — | Stripe checkout, webhook idempotency, quota enforcement middleware, plan tier checks, usage dashboard |
| 09 | **Hardening** | 3 | 10-13 | All | Sentry server+client+Inngest, structured logging + redaction, rate limits (Upstash Redis), abuse signals, retry policies + circuit breakers, sandbox cost ceilings, Vitest + Playwright suite, CI workflow |
| 10 | **Launch Prep** | 4 | 14-17 | All | Onboarding flow, marketing site at build.praxiomai.xyz, ToS/Privacy/DPA, status page, support inbox, DNS cutover, soft launch with first 50 beta users |

---

## 4. 17-Day Phase Plan

### Phase 0: Day 0 — Prerequisites (before any code)

**Definition of Done:** All accounts provisioned, all env vars documented, sub-plans 01-05 written.

See [Section 5](#5-day-0-prerequisites) for the checklist.

**Estimated time:** 3-4 hours (parallel work).

---

### Phase 1: Functional Core (Days 1-4)

**Definition of Done:** A user with seeded credentials can describe an app, see Claude generate it, see the live preview, edit it via chat, see streaming tool call cards, cancel an agent run, and see the spec panel populate manually.

| Day | Parallel agents (worktrees) | Sequential / coordination |
|---|---|---|
| **Day 1** | Two parallel tracks: <br>**A.** Migrate from current state (Constitution Article XIX, Steps 1-3): Inngest HTTP handler + new deps + strip Vercel AI SDK from /api/suggestion and /api/quick-edit. <br>**B.** Build foundations (Steps 4-5): ModelAdapter + ClaudeAdapter, SandboxProvider + E2BProvider | Morning: Final review of CONSTITUTION + sub-plans 01-02. Lock tool definitions and the 6 tool input/output schemas. Lock the AgentStep discriminated union. |
| **Day 2** | **A.** Sub-01 cont.: AgentRunner skeleton + tool executor + FilePermissionPolicy. **B.** Sub-02 cont.: Sandbox lifecycle (create, isAlive, full sync from Convex, expire+rebuild). **C.** Schema migration (Step 6) + flat-path Convex functions (Step 7). | Mid-day: Schema migration runs in dev. Verify file count matches. Sub-plan 03 (scaffolding) gets written. |
| **Day 3** | **A.** Sub-01 cont.: All 4 error recovery layers wired. Checkpoint save/restore. Hard limits. End-to-end test (real Claude, real E2B). **B.** Sub-03 (Scaffolding): /api/scaffold + prompt-to-scaffold + bulk-write. **C.** Sub-04 (Streaming UI): tool call cards, cancel button, error states. | First end-to-end run of full agent loop. Expected: 5-8 bugs to debug. Sub-plan 05 (spec panel) gets written. |
| **Day 4** | **A.** Sub-04 cont.: optimistic mutations, animation polish. **B.** Sub-05 (Spec Panel): Convex specs table + panel UI + feature CRUD. **C.** Cleanup: delete demoGenerate/demoError, write .env.example, add CONSTITUTION reference comments to key files. | End-to-end smoke test of Phase 1 DoD. Fix all blockers. Phase 1 demo. |

---

### Phase 2: Integrations (Days 5-9)

**Definition of Done:** A user can sign up with a credit card, import an existing GitHub repo, build on it, push back, deploy to Vercel with auto-provisioned Supabase, and see quota enforcement when they exceed free tier.

| Day | Parallel | Sequential |
|---|---|---|
| **Day 5** | **A.** Sub-06 (GitHub): OAuth flow (token encryption, callback, state), Octokit client wrapper. **B.** Sub-06: Repo import (tree fetch → Convex bulk-write). | Sub-plan 06 gets written morning of Day 5. Test repo import on 5 real repos (small, medium, monorepo with subdirs, repo with binary files, repo with .git submodules). |
| **Day 6** | **A.** Sub-06: Repo push (diff Convex against last commit, create commit via Octokit, secret scanning with gitleaks). **B.** Sub-07 (Deploy): Vercel REST client, deployment creation, status polling. | Sub-plan 07 gets written. Test push on 3 different repos. Verify gitleaks blocks an .env containing a fake AWS key. |
| **Day 7** | **A.** Sub-07: Supabase Management API client, project provisioning, env var capture. **B.** Sub-07: Deploy pipeline orchestration (Inngest function: provision DB → wait → deploy → wait → save). | Smoke test: scaffold new app → deploy → click URL → see live working app with auth/DB. |
| **Day 8** | **A.** Sub-08 (Billing): Stripe checkout flow, plan picker UI, customer creation, subscription status webhooks. **B.** Sub-08: Quota enforcement middleware (intercepts every model call + every sandbox spawn). | Sub-plan 08 gets written. Stripe test mode end-to-end. Verify free user hits 50K token limit and sees upgrade modal. |
| **Day 9** | **A.** Sub-08: Usage dashboard UI, usage tracking on every Claude call (server-side), every E2B session (Inngest scheduled). **B.** Buffer day for Phase 2 cleanup. | Phase 2 DoD verification. Demo. |

---

### Phase 3: Production Readiness (Days 10-13)

**Definition of Done:** Sentry catching all errors with PII redacted. Rate limits prevent abuse. Sandbox costs capped per user/day. Secrets never logged. Retry policies on every external API. Vitest + Playwright suite green. CI workflow on PRs.

| Day | Work |
|---|---|
| **Day 10** | Sub-plan 09 (Hardening) gets written morning. Sentry hardening (server + client + Inngest function instrumentation), structured logging with redaction (no API keys, no message content, no tool inputs). Sentry breadcrumbs for agent loop iterations + tool calls. |
| **Day 11** | Rate limiting via Upstash Redis (per-user buckets: 100 req/min for HTTP, 10 agent runs/hr, 50 file ops/min). Abuse signals: rapid project creation, repeated suspicious prompts, identical message repeats. CAPTCHA on signup (Clerk feature). |
| **Day 12** | Retry policies + circuit breakers on Anthropic, E2B, Vercel, Supabase, GitHub APIs. Sandbox cost ceiling per user/day ($20 Pro, $100 Team). Vitest unit tests written for: agent runner, tool executor, file permission policy, claude adapter, e2b provider, scaffolding, token encryption. |
| **Day 13** | Playwright e2e suite for 5 critical paths (prompt-to-preview, chat-modify, github-import, deploy, quota-blocks-free-user). GitHub Actions CI workflow: typecheck, lint, unit tests, e2e against preview deployment. Manual security pass: AI surfaces, secret handling, auth boundaries, prompt injection defenses. |

---

### Phase 4: Launch Prep (Days 14-17)

**Definition of Done:** Public URL live. Onboarding converts. Legal pages exist. Status page works. Support inbox monitored. First 50 invited beta users onboarded.

| Day | Work |
|---|---|
| **Day 14** | Sub-plan 10 (Launch Prep) gets written morning. Onboarding flow: post-signup welcome, 3 starter prompts, first-project guidance, tooltip tour. Marketing site at `build.praxiomai.xyz/` (landing, pricing, "by Praxiom" footer linking back to praxiomai.xyz). |
| **Day 15** | Legal pages: ToS, Privacy Policy, DPA — based on Vercel/Stripe templates, customized for Polaris specifics (data handling for AI processing, sandbox execution, GitHub access). Cookie consent banner. GDPR data export endpoint (`/api/account/export`). |
| **Day 16** | Status page (BetterStack or Instatus) at `status.praxiomai.xyz` — probes for Anthropic, E2B, Convex, Vercel API, Supabase Management API. Support inbox `support@praxiomai.xyz` configured (Gmail or Help Scout). DNS for build.praxiomai.xyz cutover to Vercel. SSL verification. |
| **Day 17** | Final smoke test of entire product end-to-end. Sentry alerts cleared. Beta invitations sent (50 users, hand-curated). **Soft launch.** Monitor for first day, address P0 issues. |

---

## 5. Day 0 Prerequisites

These must be done before Day 1 starts. Most can be parallelized.

### Account Provisioning

- [ ] **E2B account** — sign up, billing card, generate API key, set spending alert at $50/day
- [ ] **Anthropic API access** — verify model access to `claude-sonnet-4-6-20251015`, request rate limit increase to 1000 RPM minimum
- [ ] **OpenAI account** — for GPT adapter (Phase 1 wiring; not exposed in v1 but adapter must work)
- [ ] **Google AI Studio** — Gemini API key for adapter (same: wired, not exposed)
- [ ] **Vercel account / team** — for Polaris hosting + Vercel REST API token (full scope, project-creation permissions)
- [ ] **GitHub OAuth App** — callback URL `https://build.praxiomai.xyz/api/github/oauth/callback`, scopes `repo` + `user:email`
- [ ] **Stripe account** — test mode + production mode webhook endpoints, products created (free=$0, pro=$29, team=$99)
- [ ] **Supabase Management API key** — org-level, generates per-project access tokens for deploys
- [ ] **Convex production deployment** — separate from dev, configured for Polaris itself
- [ ] **Sentry project** — DSN added to env (already integrated, just needs production project)
- [ ] **Upstash Redis** — for rate limiting in Phase 3 (provision now to avoid Day 11 delay)
- [ ] **BetterStack or Instatus** — for status page (cheaper than PagerDuty for v1)
- [ ] **Encryption key generation** — `openssl rand -base64 32` → `POLARIS_ENCRYPTION_KEY` env var (rotated quarterly)

### Domain / DNS

- [ ] **Domain `praxiomai.xyz` confirmed under our control**
- [ ] **DNS for `build.praxiomai.xyz`** — CNAME to Vercel (cname.vercel-dns.com)
- [ ] **DNS for `status.praxiomai.xyz`** — CNAME to BetterStack/Instatus
- [ ] **Email DNS for `support@praxiomai.xyz`** — MX records, SPF/DKIM/DMARC

### Email / Support

- [ ] **`support@praxiomai.xyz`** inbox configured (Gmail Workspace or Help Scout)
- [ ] **`abuse@praxiomai.xyz`** inbox (legal requirement)
- [ ] **`security@praxiomai.xyz`** inbox

### Documentation

- [ ] **`.env.example`** committed to repo (every env var with purpose)
- [ ] **CONSTITUTION.md** read and understood by all contributors
- [ ] **Sub-plans 01-02** written in TDD-grade detail (`docs/plans/01-agent-loop.md`, `docs/plans/02-e2b-sandbox.md`)
- [ ] **Sub-plans 03-05** drafted (can be polished Day 1 morning)

### Required Environment Variables

```bash
# AI Providers
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...        # for GPT adapter (wired, not exposed)
GOOGLE_API_KEY=...        # for Gemini adapter (wired, not exposed)

# Sandbox
E2B_API_KEY=...

# Database / Auth (existing)
NEXT_PUBLIC_CONVEX_URL=...
CONVEX_DEPLOY_KEY=...
CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
CLERK_JWT_ISSUER_DOMAIN=...

# Internal
POLARIS_CONVEX_INTERNAL_KEY=...   # for Inngest → Convex (already exists)
POLARIS_ENCRYPTION_KEY=...        # AES-256-GCM key for OAuth tokens (NEW)

# Inngest (existing)
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...

# GitHub OAuth (Phase 2)
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# Vercel (Phase 2)
VERCEL_TOKEN=...
VERCEL_TEAM_ID=...

# Supabase Management (Phase 2)
SUPABASE_MANAGEMENT_API_KEY=...
SUPABASE_ORG_ID=...

# Stripe (Phase 2)
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
STRIPE_PRICE_ID_PRO=...
STRIPE_PRICE_ID_TEAM=...

# Rate Limiting (Phase 3)
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...

# Observability (existing)
SENTRY_DSN=...
SENTRY_AUTH_TOKEN=...

# Misc
NEXT_PUBLIC_APP_URL=https://build.praxiomai.xyz
```

---

## 6. Risk Register

Risks tracked actively. Mitigations baked into the plan.

| # | Risk | Probability | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Agent loop debugging exceeds Day 3 budget | High | High | Constrained tool set Day 1 (start with read/write/list, add create/delete/run_command Day 2). Inngest step retries built in. Checkpoint+resume reduces blast radius of any single bug. |
| R2 | E2B Convex sync drifts on edge cases | High | Medium | "Re-sync from Convex" is a one-button operation always available. On every sandbox restart, full re-sync. Convex is source of truth (Article X). |
| R3 | Supabase Management API quota / rate limits | Medium | High | Use single org-level account. Plan B: Neon (Postgres-only, easier provisioning). API rate limit ~10 projects/min should be fine for early scale. |
| R4 | Cost overrun (E2B + Anthropic per user) | Medium | Critical | Hard quota enforcement Day 9. Daily kill-switch per user (Article XVII §17.4). Free tier intentionally tight. |
| R5 | Generated apps fail on first run (npm install issues, env missing) | High | Medium | Template tested daily in Phase 1. Boot script validates env before npm run dev, shows clear errors. |
| R6 | AI writes secrets to user repos / leaks tokens | Low | Critical | Pre-commit secret scanner (gitleaks) Day 6. System prompt explicit ban on secrets. Refuse push if scanner flags. |
| R7 | Praxiom team needs Polaris attention during Praxiom launch | High | Medium | Phase 4 (Day 17) is soft launch — not real launch. Real launch only when Praxiom is stable. Polaris can sit at private beta with 50 users. |
| R8 | React 19 / Next.js 16 / Tailwind 4 framework bugs | Medium | Medium | Pin all versions. Track Next.js 16 issues. Have downgrade plan to React 18 / Next 15 if blockers found. Generated apps target Next.js 15 (deliberate version skew, see CONSTITUTION §5.4). |
| R9 | Clerk + Supabase Auth dual-auth confusion | Medium | Low | Polaris uses Clerk (existing). Generated apps use Supabase Auth (template default). Documentation makes this distinction clear. Never mix. |
| R10 | DNS / SSL / Vercel domain verification delays | Low | Medium | Day 0 task. Don't wait for Day 17. Vercel domain verification usually <1 hour but can be 24 hours. |
| R11 | Inngest cold starts cause P95 latency spikes | Medium | Medium | Accept in v1. Sub-plan 09 introduces warm-up keep-alive if observed P95 > 8s consistently (Article XIV §14.2). |
| R12 | Schema migration (tree → flat path) corrupts existing project files | Low | High | Migration script runs in dev first. Verify file count matches before deploy. Backup of existing files table. Migration is reversible (tree fields kept until v1.1). |
| R13 | OpenAI / Google API keys leak via crash logs | Low | Critical | Sentry beforeSend hook redacts known patterns. CONSTITUTION §15.2 forbids logging secrets. Reviewed in Day 13 manual security pass. |
| R14 | Stripe webhook race conditions cause double-billing | Medium | High | Idempotency keys on every event. Convex transactional updates. Tested with Stripe CLI fixture replays. |
| R15 | E2B 24h sandbox expiry surprises a user mid-session | High | Low | UI shows sandbox status. Auto-resync on next action. User loses zero work (Convex has everything). |

---

## 7. Definition of Done — Per Phase

### Phase 1 (Day 4)

- [ ] Seeded user prompts → sees app running in <90s (P50)
- [ ] Chat-modify changes reflect in preview within 5s (P95)
- [ ] Tool call cards visible in conversation UI as agent works
- [ ] Cancel button works mid-run; partial work preserved
- [ ] Cmd+K and ghost text still work in editor (after Vercel AI SDK strip)
- [ ] Spec panel persists across page reloads
- [ ] No crashes on documented happy path
- [ ] Inngest dashboard shows clean function runs (no orphan failures)
- [ ] Agent checkpoint table populated; manual job-kill test resumes correctly
- [ ] Hard limits respected: 50-iter test, 150K-token test, 5-min timeout test
- [ ] End-to-end run of constitution-compliance review (one PR pass)

### Phase 2 (Day 9)

- [ ] New user signs up with Stripe credit card; sub created
- [ ] GitHub repo import populates Convex correctly for 5 test repos (1 small, 1 medium, 1 monorepo, 1 with binary files, 1 with submodules)
- [ ] Push to GitHub creates clean commits with project history
- [ ] Pre-push secret scanner blocks push when fake AWS key in .env
- [ ] Vercel deploy returns working live URL with Supabase backend
- [ ] Generated app's auth (Supabase) works on deployed URL
- [ ] Free-tier user blocked at quota with clear upgrade CTA
- [ ] All quotas tracked in Convex `usage` table
- [ ] Stripe webhook idempotency tested via CLI replay

### Phase 3 (Day 13)

- [ ] Sentry capturing all server + client + Inngest errors with PII redacted
- [ ] Rate limit returns 429 with `Retry-After` header
- [ ] Vitest unit suite >70% coverage on agent loop, scaffold, sandbox, tools, policy, crypto
- [ ] Playwright e2e green on 5 critical paths
- [ ] Manual security review documented (AI surfaces, secret handling, auth boundaries, prompt injection)
- [ ] CI workflow green on PRs (typecheck + lint + unit + e2e)
- [ ] Sandbox cost ceiling tested (intentional $20 burn → block)
- [ ] Daily kill-switch tested

### Phase 4 (Day 17)

- [ ] `https://build.praxiomai.xyz` resolves with valid SSL
- [ ] Public signup → onboarding completes for a fresh user in <3 min
- [ ] ToS / Privacy / DPA published; cookie consent banner shown
- [ ] GDPR data export endpoint works (returns user's projects + messages JSON)
- [ ] Status page live, monitoring real probes
- [ ] Support inbox monitored, SLA documented
- [ ] First 50 invited beta users onboarded
- [ ] Sentry alerts triaged (no P0 open)

---

## 8. Parallel Execution Strategy

We use parallel git worktrees + subagents for non-overlapping work. Coordination happens at:

- **Morning standups** (10 min): what's locked, what's blocked, what shipped overnight.
- **Midday integration** (20 min): merge ready branches, smoke test integrated state.
- **End-of-day review** (30 min): code review of completed sub-plans against CONSTITUTION.

### Parallelization Map

| Day | Track A | Track B | Track C | Coordination |
|---|---|---|---|---|
| 1 | Inngest handler + deps + Vercel AI SDK strip | ModelAdapter + ClaudeAdapter | SandboxProvider + E2BProvider | Lock tool schemas, AgentStep type |
| 2 | AgentRunner skeleton + ToolExecutor + Policy | Sandbox lifecycle | Schema migration + flat-path Convex fns | Run migration in dev |
| 3 | All 4 error layers + checkpoints | Scaffolding (Sub-03) | Streaming UI (Sub-04) | First end-to-end agent run |
| 4 | Sub-04 polish + Cancel | Spec Panel (Sub-05) | Cleanup + .env.example | Phase 1 demo |
| 5 | GitHub OAuth + Octokit | GitHub Import | (buffer) | Test imports on 5 repos |
| 6 | GitHub Push + secret scan | Deploy: Vercel client | (buffer) | Test push + scan |
| 7 | Deploy: Supabase Management | Deploy: pipeline orchestration | (buffer) | First successful deploy |
| 8 | Stripe checkout + plan picker | Quota enforcement middleware | (buffer) | Free user quota test |
| 9 | Usage dashboard + tracking | Phase 2 cleanup | Buffer | Phase 2 demo |
| 10-13 | Sub-09 (Hardening) — single-track, sequential | | | |
| 14-17 | Sub-10 (Launch Prep) — single-track, sequential | | | |

### Sub-Agent Dispatch Pattern

For each sub-plan, the dispatch is:
1. Sub-plan author (you + Claude) writes the plan to `docs/plans/NN-name.md`.
2. Plan is reviewed against CONSTITUTION (one pass).
3. Fresh subagent dispatched with the plan as input + relevant codebase context.
4. Subagent implements, runs tests, opens PR.
5. Reviewer (you + code-reviewer agent) reviews against plan + CONSTITUTION.
6. Merge.

Per `superpowers:subagent-driven-development`.

---

## 9. Open Decisions (Parking Lot)

These are deferred — not blockers. Revisit per the schedule.

| # | Decision | Defer until | Why deferred |
|---|---|---|---|
| O-001 | Multi-model UI (let users pick Claude/GPT/Gemini) | v1.1 (post-launch) | Day 1 ships Claude-only; avoid choice paralysis for early users; gather data on which models perform best |
| O-002 | Templates library (vs prompt-only) | v1.2 | Prompt-only forces clearer thinking; templates can be added later as starting points |
| O-003 | AI-inferred spec coverage (auto-update spec from code) | Post-Praxiom integration | Manual spec editing is enough for v1; auto-inference is a differentiator for the Praxiom story |
| O-004 | Self-hosted deploy option (Docker, fly.io) | When users ask | Vercel covers 95% of cases; complexity not justified for v1 |
| O-005 | Mobile / Flutter generation | Post-fundraise | Requires entire generation pipeline; v2.0 territory |
| O-006 | Real-time collaboration on a single project | When usage shows demand | Operational transforms / CRDTs are a 6-week project; not in v1 scope |
| O-007 | Slash-command palette ("Precision Mode") | v1.1 | Rocket.new has it; nice UX but not core |
| O-008 | Native Praxiom integration (`/api/praxiom/import`) | Praxiom integration plan | Contract defined in CONSTITUTION §18; implementation is post-launch |
| O-009 | Northflank / Modal / custom sandbox | Month 6+ or 5K users | E2B is fine until then; abstraction layer makes swap cheap |
| O-010 | Multi-region (low-latency for non-US users) | Post-launch when latency complaints arrive | US-East single-region is fine for v1 |
| O-011 | Code refactoring tools (rename, extract function) | v1.2 | Manual editing is enough; agent can do refactors via prompt |
| O-012 | Diff view between agent edits and previous state | v1.1 | Visual diff is nice; not critical for v1 |
| O-013 | Browser preview screenshots in chat history | v1.1 | Nice for context; v1 just shows live iframe |
| O-014 | Voice prompts | v2.0 | Whisper API integration; not differentiating |

---

## 10. Self-Review

**Spec coverage:** Each user-stated requirement maps to a sub-plan or article:
- Standalone product → entire roadmap
- Next.js + Supabase generated apps → Sub-03 + Sub-07 + CONSTITUTION §5.4
- Spec panel → Sub-05 + CONSTITUTION §2.2
- GitHub + Deploy → Sub-06 + Sub-07
- E2B sandbox → Sub-02 + CONSTITUTION §6.2
- Proxied AI keys → CONSTITUTION §13.2
- Claude only v1 → CONSTITUTION §1.3 + Article V
- "Polaris by Praxiom" branding → D-010 + Sub-10
- build.praxiomai.xyz → D-011 + Sub-10
- Continuously iterated → Phase 4 = soft launch, not freeze
- Multi-model SDK abstraction → CONSTITUTION §6.1 + D-003
- All 4 error recovery layers → CONSTITUTION Article XII + D-005
- Convex first consistency → CONSTITUTION Article X + D-004

**Placeholder scan:** No "TBD" or "implement later" patterns in this roadmap. Sub-plans will have TDD-grade detail.

**Type consistency:** Tool names referenced consistently (`read_file`, `write_file`, `edit_file`, `create_file`, `delete_file`, `list_files`, `run_command`). File paths consistent. Convex table names consistent. Cross-references to CONSTITUTION articles verified.

**Scope check:** This roadmap covers one cohesive product (Polaris IDE). Sub-systems are decomposed; no sub-system is itself multi-product.

---

## 11. Execution Handoff

This roadmap does **not** itself dispatch agents. The next action is:

**Step A — Day 0 (today/tomorrow):**
1. Provision all 13 prerequisites in §5 in parallel (~3-4 hours).
2. Read CONSTITUTION.md in full.
3. Write sub-plan 01 (`agent-loop`) and sub-plan 02 (`e2b-sandbox`) in TDD-grade detail using `superpowers:writing-plans`. These two are the most critical and hardest to parallelize against unwritten plans.
4. Sub-plans 03-05 can be drafted Day 0 evening or Day 1 morning.

**Step B — Day 1 onward:**
For each sub-plan, dispatch a fresh subagent via `superpowers:subagent-driven-development`. Two-stage review: subagent self-checks against plan, then human + code-reviewer agent reviews diff before merge.

**Step C — Phase boundaries:**
At end of each phase, run §7 "Definition of Done" checklist against actual product. Any failed item blocks phase advancement.

**Step D — Constitutional review:**
At end of each phase, scan touched files for Constitutional violations. Amend or fix.

---

**Status:** Roadmap finalized. Next action: write sub-plans 01-10 in `docs/plans/`.
