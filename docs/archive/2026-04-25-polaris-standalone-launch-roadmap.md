# Polaris Standalone Launch — Master Roadmap

> **Status:** Master plan. This document locks architecture, sequences subsystems, and defines interfaces. Detailed TDD-grade sub-plans live alongside this file (one per subsystem) and are written just-in-time before each phase starts.
>
> **For agentic workers:** Do not execute from this document. Execute from the per-subsystem plans linked in §5. Use `superpowers:subagent-driven-development` per sub-plan.

**Goal:** Ship Polaris — an AI app builder competitive with Base44 / Rocket.new — as a standalone production product at `build.praxiomai.xyz` in 14 working days. Generated apps are full-stack Next.js + Supabase, portable, with one-click GitHub sync and Vercel deploy.

**Architecture:** Polaris itself is the existing Next.js 16 + Convex + Clerk + Inngest codebase. AI agent loop runs in Inngest, calls Claude Sonnet 4.6 with file-tool use, mutates Convex. E2B cloud sandbox runs the user's generated app and provides the live preview URL. Convex is the source of truth; sandbox is rehydrated from Convex on each session. Generated apps target Next.js 15 + Supabase (provisioned per-project via Supabase Management API) with Tailwind 4 + shadcn/ui.

**Tech Stack:**
- **Polaris IDE:** Next.js 16, React 19, TypeScript, Tailwind 4, shadcn/ui, CodeMirror 6, Convex 1.31, Clerk, Inngest 3.48, Sentry
- **AI:** Raw SDKs (`@anthropic-ai/sdk`, `openai`, `@google/generative-ai`) behind custom `ModelAdapter` interface. Day 1: Claude Sonnet 4.6 only. Multi-model capability exists in the layer, not exposed in UI until v1.1.
- **Sandbox:** E2B (`@e2b/code-interpreter`) behind custom `SandboxProvider` interface. Swap to Northflank/custom at 5K users without touching agent code.
- **Generated apps:** Next.js 15, Supabase (Postgres + Auth + Storage), Tailwind 4, shadcn/ui
- **Integrations:** Octokit (GitHub), Vercel REST API, Supabase Management API, Stripe (billing)
- **Tests:** Vitest (unit), Playwright (e2e — happy paths only)

---

## 1. Goals and Non-Goals

### Goals (v1 standalone, 14 days)
1. User signs up, describes app, sees a running app in <90 seconds.
2. AI chat modifies multi-file projects with streaming progress.
3. Live preview iframe stays in sync as files change.
4. Code editor (CodeMirror) with existing inline AI (ghost text, Cmd+K) preserved.
5. Manual spec panel — features, acceptance criteria, status — persisted per project.
6. GitHub: import existing repo, push commits, create new repo.
7. Deploy: one-click to Vercel, with Supabase project auto-provisioned.
8. Billing: Stripe subscription with metered E2B/Anthropic usage.
9. Production hosting at `build.praxiomai.xyz` with SSL, monitoring, error tracking.
10. Public signup flow with onboarding and legal pages.

### Non-Goals (explicitly deferred)
- Praxiom integration (separate plan, 4-6 weeks after launch)
- AI-inferred spec coverage (manual only in v1)
- Multi-model routing (Claude only)
- Mobile / Flutter generation
- Real-time collaboration on a single project (single-user editing)
- Enterprise compliance (SOC 2, SAML, audit logs)
- Self-hosted option for generated apps (Vercel-only deploy)
- Templates library (users always start from prompt)

---

## 2. Locked Architecture Decisions

| Decision | Choice | Why |
|---|---|---|
| Sandbox runtime | E2B cloud sandboxes | 1-day integration vs 2-week WebContainer fight; survives browser refresh; standard server-side debugging |
| Generated app stack | Next.js 15 + Supabase | Portable, matches Rocket.new, users own their stack post-export, Supabase has good free tier |
| Generated app auth | Supabase Auth (email + Google OAuth pre-wired) | Zero-config for end-users, no extra service to provision |
| Polaris file storage | Convex (existing) | Already wired, real-time subscriptions, no migration |
| Sandbox file sync direction | Convex → E2B (one-way, on save) | Convex is source of truth; sandbox is ephemeral. Re-sync on session start. |
| AI agent execution | Inngest function (server-side, long-running) | Existing scaffold, retry/cancel built-in, isolates from Next.js request lifecycle |
| AI model | Claude Sonnet 4.6 (`claude-sonnet-4-6-20251015`) | Best tool-use model; direct `@anthropic-ai/sdk` — no Vercel AI SDK abstraction |
| Multi-model SDK | Custom `ModelAdapter` interface, raw SDKs per provider | Maximum flexibility, no abstraction leakage, per-model feature access. ClaudeAdapter Day 1. GPT/Gemini adapters wired but not exposed in v1 UI. |
| AI keys | Proxied through Polaris (we eat cost, meter usage) | Required for "user types prompt and it works" UX; meter via Stripe usage records |
| Streaming | Server-Sent Events (SSE) via Next.js Route Handler, `ReadableStream` | Built on web standards, not tied to Vercel AI SDK |
| Consistency | Convex first (source of truth), E2B second (execution copy) | Convex always authoritative; sandbox rehydrated from Convex on restart; no silent divergence |
| Error recovery | All 4 layers from Day 1: (1) API retry/backoff, (2) tool-failure→model feedback, (3) checkpoint+resume, (4) hard loop limits | Agent runs cost real money; a 5-min run that silently restarts from zero is a trust-killer |
| Deploy target | Vercel REST API | Documented, fast, supports preview deployments |
| Polaris hosting | Vercel, custom domain `build.praxiomai.xyz` | Same provider as deploy target, easy DNS |
| Test framework | Vitest + Playwright (smoke only) | Vitest matches Vite/Next.js conventions, Playwright for critical paths |
| Branding (v1) | "Polaris by Praxiom" — wordmark in header, "by Praxiom" subtle | Establishes parent brand for fundraising narrative without diluting Polaris |

---

## 3. System Architecture

### 3.1 The Agent Loop (`processMessage`)

```
User sends message
  ↓
POST /api/messages → creates user msg + placeholder assistant msg → triggers Inngest
  ↓
Inngest processMessage:
  ├─ Load conversation history + current spec + project file tree
  ├─ Call Claude Sonnet 4.6 with tool definitions: read_file, write_file, create_file, delete_file, list_files, run_command
  ├─ Tool execution loop:
  │    ├─ Claude makes tool call → execute via Convex mutation → return result
  │    ├─ Stream partial text + tool calls to assistant message
  │    └─ Loop until Claude returns final text (or max iterations: 25)
  ├─ On every write_file: enqueue E2B sync event
  └─ Mark message status: completed | error | cancelled
```

### 3.2 E2B Sandbox Lifecycle

```
Project opened
  ↓
Check Convex: existing sandbox_id + still alive?
  ├─ Yes: getHost(3000), iframe preview
  └─ No:
       ├─ Sandbox.create('node-22'), get sandbox_id
       ├─ Bulk write all Convex files → sandbox via files.write
       ├─ Run npm install (background)
       ├─ Run npm run dev (background, detached)
       ├─ Save sandbox_id to Convex projects table
       └─ Iframe to https://${sandbox.getHost(3000)}

On Convex file mutation:
  ↓ Inngest event "file/changed"
  ↓ Sandbox.files.write(path, content)
  ↓ Next.js dev server hot-reloads automatically

On sandbox expiry (E2B 24h limit):
  ↓ Re-create on next user action, re-sync from Convex
```

### 3.3 Data Flow Diagram

```
Browser (Next.js + Convex client)
  │
  ├─ Mutation: createMessage → Convex → Inngest event
  │                              ↓
  │                           processMessage (Inngest)
  │                              ↓
  │                           Claude Sonnet 4.6 (tool use)
  │                              ↓
  │                           Convex mutations (writeFile, etc.)
  │                              ↓
  │                           Real-time subscription updates browser
  │                              ↓
  │                           E2B sync (parallel)
  │                              ↓
  │                           E2B sandbox writes file → hot reload
  │
  └─ Iframe → E2B preview URL → live app
```

---

## 4. File Structure

### 4.1 New directories

```
src/features/
├── sandbox/                    # E2B integration
│   ├── components/
│   │   ├── preview-pane.tsx    # iframe + status indicator
│   │   └── sandbox-status.tsx  # boot/install/ready badge
│   ├── hooks/
│   │   └── use-sandbox.ts      # spawn, sync, get URL
│   ├── inngest/
│   │   └── sync-file.ts        # Convex change → E2B write
│   └── lib/
│       ├── e2b-client.ts       # SDK wrapper
│       └── sandbox-lifecycle.ts # boot/expire/recreate
│
├── spec/                       # Spec panel
│   ├── components/
│   │   ├── spec-panel.tsx      # right sidebar
│   │   ├── feature-card.tsx
│   │   └── feature-form.tsx    # add/edit
│   └── hooks/
│       └── use-spec.ts         # CRUD via Convex
│
├── scaffold/                   # Project generation
│   ├── api/
│   │   └── generate.ts         # POST /api/scaffold logic
│   ├── lib/
│   │   ├── nextjs-supabase-template.ts  # base files
│   │   └── prompt-to-scaffold.ts         # Claude → file tree
│   └── types.ts
│
├── github/                     # GitHub integration
│   ├── components/
│   │   ├── github-connect-button.tsx
│   │   ├── repo-import-dialog.tsx
│   │   └── push-button.tsx
│   ├── lib/
│   │   ├── octokit-client.ts
│   │   ├── import-repo.ts      # clone → Convex files
│   │   └── push-changes.ts
│   └── api/
│       ├── oauth-callback.ts
│       └── push.ts
│
├── deploy/                     # Vercel + Supabase provisioning
│   ├── components/
│   │   ├── deploy-button.tsx
│   │   ├── deploy-status.tsx
│   │   └── env-var-editor.tsx
│   ├── lib/
│   │   ├── vercel-client.ts
│   │   ├── supabase-provision.ts  # Management API
│   │   └── deploy-pipeline.ts
│   └── api/
│       └── deploy.ts
│
├── billing/                    # Stripe + quotas
│   ├── components/
│   │   ├── plan-picker.tsx
│   │   ├── usage-meter.tsx
│   │   └── upgrade-cta.tsx
│   ├── hooks/
│   │   └── use-quota.ts
│   └── api/
│       ├── stripe-webhook.ts
│       └── checkout.ts
│
└── onboarding/                 # First-run experience
    ├── components/
    │   ├── welcome-flow.tsx
    │   └── starter-prompts.tsx
    └── lib/
        └── seed-project.ts

convex/
├── sandboxes.ts        # sandbox_id, last_alive, project linkage
├── specs.ts            # features table CRUD
├── integrations.ts     # github_token, vercel_token (encrypted)
├── deployments.ts      # deploy history per project
├── usage.ts            # ai_tokens_used, sandbox_seconds_used per user/month
└── plans.ts            # plan tiers, quotas

src/inngest/
└── functions.ts        # register: processMessage, syncSandbox, generateScaffold, deployProject

src/app/api/
├── messages/route.ts          # exists; rewire to new processMessage
├── scaffold/route.ts          # NEW
├── github/oauth/route.ts      # NEW
├── github/push/route.ts       # NEW
├── deploy/route.ts            # NEW
├── stripe/webhook/route.ts    # NEW
└── stripe/checkout/route.ts   # NEW

src/lib/templates/
└── nextjs-supabase/           # base project template (~30 files)
    ├── package.json
    ├── next.config.ts
    ├── tsconfig.json
    ├── tailwind.config.ts
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx
    │   │   ├── page.tsx
    │   │   └── api/
    │   ├── components/ui/     # shadcn/ui pre-bundled
    │   └── lib/
    │       └── supabase.ts
    └── .env.example

tests/
├── unit/
│   ├── agent-loop.test.ts
│   ├── sandbox-sync.test.ts
│   └── scaffold.test.ts
└── e2e/
    ├── prompt-to-preview.spec.ts
    ├── github-import.spec.ts
    └── deploy.spec.ts

docs/superpowers/plans/         # this dir
├── 2026-04-25-polaris-standalone-launch-roadmap.md   # this file
├── 2026-04-25-sub01-agent-loop.md                    # written before Day 1
├── 2026-04-25-sub02-e2b-sandbox.md                   # written before Day 1
├── 2026-04-25-sub03-scaffolding.md                   # written before Day 2
├── 2026-04-25-sub04-streaming-ui.md                  # written before Day 1
├── 2026-04-25-sub05-spec-panel.md                    # written before Day 3
├── 2026-04-25-sub06-github.md                        # written before Day 4
├── 2026-04-25-sub07-deploy.md                        # written before Day 5
├── 2026-04-25-sub08-billing.md                       # written before Day 7
├── 2026-04-25-sub09-hardening.md                     # written before Day 8
└── 2026-04-25-sub10-launch-prep.md                   # written before Day 12
```

### 4.2 Modified files (existing)

| File | Change | Reason |
|---|---|---|
| `src/features/conversations/inngest/process-message.ts` | Replace stub with real agent loop | Core of v1 |
| `src/features/conversations/components/conversation-sidebar.tsx` | Wire up cancel, optimistic mutations, streaming render | TODOs + UX |
| `src/features/projects/hooks/use-files.ts` | Add optimistic mutations (4 TODOs) | UX |
| `src/features/projects/components/project-id-layout.tsx` | Add 3rd pane: spec panel + preview | New layout |
| `src/features/editor/components/editor-view.tsx` | Implement binary preview, integrate with sandbox | TODO |
| `src/app/api/suggestion/route.ts` | Upgrade Claude 3.7 → 4.6 | Model bump |
| `src/app/api/quick-edit/route.ts` | Upgrade Claude 3.7 → 4.6 | Model bump |
| `convex/schema.ts` | Add: sandboxes, specs, integrations, deployments, usage, plans | Data model |
| `src/inngest/functions.ts` | Register new functions, remove demo* | Cleanup |
| `package.json` | Add: @e2b/code-interpreter, @octokit/rest, stripe, @supabase/supabase-js, vitest, @playwright/test | Deps |

---

## 5. Subsystem Decomposition (10 sub-plans)

Each sub-plan is a self-contained, testable, executable plan. Written **just-in-time** before its phase starts so we incorporate learnings from prior phases.

| # | Sub-plan | Phase | Days | Blocks | Description |
|---|---|---|---|---|---|
| 01 | **Agent Loop** | 1 | 1-2 | All AI work | `processMessage` with Claude tool use, 6 tools, error recovery, max iterations |
| 02 | **E2B Sandbox** | 1 | 1-3 | Preview, deploy | Sandbox lifecycle, file sync, preview iframe, status surface |
| 03 | **Scaffolding** | 1 | 2 | First user value | `/api/scaffold` — prompt to Next.js+Supabase file tree, bulk-write to Convex |
| 04 | **Streaming UI** | 1 | 1 | Perceived speed | SSE messages, progressive render, tool-call visibility |
| 05 | **Spec Panel** | 1 | 3 | Differentiation | Convex `specs` table, panel UI, feature CRUD, status enum |
| 06 | **GitHub** | 2 | 4-5 | Code ownership | OAuth, encrypted token storage, import + push, conflict-free merge |
| 07 | **Deploy** | 2 | 5-6 | "Ship it" beat | Vercel API, Supabase Management API auto-provision, env vars, status polling |
| 08 | **Billing** | 2 | 7 | Public signups | Stripe checkout, metered usage (Anthropic tokens, E2B seconds), quota enforcement |
| 09 | **Hardening** | 3 | 8-11 | Reliability | Sentry, rate limits, abuse prevention, retry policies, sandbox cost ceilings, secret scanning |
| 10 | **Launch Prep** | 4 | 12-14 | Go-public | Onboarding flow, ToS/Privacy/DPA, marketing site at `build.praxiomai.xyz`, status page, support email |

---

## 6. 14-Day Phase Plan

### Phase 1: Functional Core (Days 1-3)

**Definition of done:** A user with seeded credentials can describe an app, see Claude generate it, see the live preview, edit it via chat, see the spec panel populate manually. Crashes on edge cases acceptable; happy path works end-to-end.

| Day | Parallel agents (worktrees) | Sequential work (you + me) |
|---|---|---|
| **Day 0 (prep)** | — | Provision: E2B account, Vercel account, GitHub OAuth app, Stripe account, Supabase Management API key, DNS for `build.praxiomai.xyz`. Write sub-plans 01-05. |
| **Day 1** | feat/agent-loop, feat/e2b-sandbox, feat/streaming, feat/scaffold, feat/ux-debt | First 2h: lock tool definitions + sync contract + scaffold JSON format. Then merge as agents complete. |
| **Day 2** | feat/spec-panel, feat/integration-fixes | Debug agent loop failures (5-8 expected). Wire sandbox sync to Inngest events. Validate scaffold templates. |
| **Day 3** | feat/spec-panel cont., feat/preview-polish | End-to-end run: prompt → scaffold → preview → chat-modify → preview updates. Fix every break. Spec panel persistence. |

### Phase 2: Integration & Persistence (Days 4-7)

**Definition of done:** A user can sign up with a credit card, import an existing GitHub repo, build on it, push back, deploy to Vercel with auto-provisioned Supabase. Quotas enforced.

| Day | Parallel | Sequential |
|---|---|---|
| **Day 4** | feat/github-oauth, feat/github-import | Encrypt tokens at rest. Test repo import on 5 real repos (small, medium, monorepo). |
| **Day 5** | feat/github-push, feat/deploy-vercel | Vercel API integration, env var injection, status polling. |
| **Day 6** | feat/supabase-provision, feat/deploy-pipeline | Supabase Management API, project per deploy, env wiring back to Vercel. |
| **Day 7** | feat/stripe-checkout, feat/usage-metering, feat/quota-enforcement | Stripe webhook idempotency, usage records on Anthropic + E2B, plan-tier checks before each AI call. |

### Phase 3: Production Readiness (Days 8-11)

**Definition of done:** Sentry catching errors. Rate limits prevent abuse. Sandbox costs capped per user. Secrets never logged. Retry policies on every external API. Smoke tests pass in CI.

| Day | Work |
|---|---|
| **Day 8** | Sentry hardening (server + client + Inngest), structured logging, secret redaction. Vitest unit tests for agent loop, sandbox sync, scaffold. |
| **Day 9** | Rate limiting (Upstash Redis), abuse signals (suspicious prompt patterns, rapid project creation), CAPTCHA on signup. |
| **Day 10** | Retry policies + circuit breakers on E2B, Anthropic, Vercel, Supabase, GitHub. Sandbox cost ceiling per user per day. |
| **Day 11** | Playwright e2e suite (3 critical paths). GitHub Actions CI: typecheck + lint + tests on PR. Manual security pass on AI-writes-files surface. |

### Phase 4: Launch Prep (Days 12-14)

**Definition of done:** Public URL live. Onboarding converts. Legal pages exist. Status page works. Support inbox monitored.

| Day | Work |
|---|---|
| **Day 12** | Onboarding flow: post-signup welcome, 3 starter prompts, first-project guidance. Marketing site at `build.praxiomai.xyz/` (landing, pricing, "by Praxiom" footer). |
| **Day 13** | Legal: ToS, Privacy, DPA (lawyer-reviewed templates from Vercel/Stripe playbooks, customized). Cookie consent. GDPR data export endpoint. |
| **Day 14** | Status page (BetterStack or Instatus). Support inbox (`support@praxiomai.xyz`). DNS cutover. SSL verify. Final smoke. **Soft launch.** |

---

## 7. Risk Register

| # | Risk | Probability | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Agent loop debugging exceeds Day 2 budget | High | High | Constrained tool set day 1 (3 tools: read/write/list). Add create/delete day 2 once stable. Inngest step retries. |
| R2 | E2B sandbox-Convex sync drifts on edge cases | High | Medium | "Re-sync all from Convex" button always visible. On sandbox boot, full re-sync from Convex source of truth. |
| R3 | Supabase Management API quota / rate limits | Medium | High | Use single org account, project-per-deploy at first. Plan B: Neon (Postgres-only, easier provisioning). |
| R4 | Cost overrun (E2B + Anthropic per user) | Medium | Critical | Hard quota enforcement Day 7. Free tier: 50K tokens, 30 sandbox-min. Paid: metered above plan. Daily kill-switch per user. |
| R5 | Generated apps fail on first run (npm install issues, env missing) | High | Medium | Template tested daily in Phase 1. Boot script validates env, shows clear errors. |
| R6 | AI writes secrets to user repos / leaks tokens | Low | Critical | Pre-commit secret scanner (gitleaks via Inngest). System prompt explicit ban. Refuse to push if scanner flags. |
| R7 | Praxiom team needs Polaris attention during Praxiom launch | High | Medium | Phase 4 (Day 14) is soft launch. Real launch only when Praxiom is stable. Polaris can sit at private beta with 50 users. |
| R8 | React 19 / Next.js 16 / Tailwind 4 framework bugs | Medium | Medium | Pin all versions. Track issue trackers. Have downgrade plan to React 18 / Next 15. |
| R9 | Clerk + Supabase Auth dual-auth confusion | Medium | Low | Polaris uses Clerk (existing). Generated apps use Supabase Auth (template default). Never mix. |
| R10 | DNS / SSL / Vercel domain verification delays | Low | Medium | Day 0 task. Don't wait for Day 14. |

---

## 8. Day 0 Prerequisites (do before any code)

- [ ] E2B account, API key, billing card on file
- [ ] Vercel team for Polaris hosting + API token (full scope)
- [ ] GitHub OAuth App (callback: `https://build.praxiomai.xyz/api/github/oauth`)
- [ ] Stripe account, test mode webhook endpoint, prod mode webhook endpoint
- [ ] Supabase Management API key (org-level)
- [ ] Anthropic API key with model access to `claude-sonnet-4-6-20251015` and rate limit increase requested
- [ ] Domain: configure `build.praxiomai.xyz` CNAME to Vercel
- [ ] Sentry project for Polaris itself + DSN added to env
- [ ] Upstash Redis instance for rate limiting (Phase 3, but provision now)
- [ ] BetterStack/Instatus account for status page
- [ ] Support inbox `support@praxiomai.xyz` configured
- [ ] Convex production deployment (separate from dev)
- [ ] Encrypted env vars secret store (Vercel env or Doppler)
- [ ] Sub-plans 01–05 written (TDD-grade, executable)

---

## 9. Definition of Done — Per Phase

### Phase 1 (Day 3)
- [ ] Seeded user can prompt → see app running in <90s
- [ ] Chat-modify changes reflect in preview within 5s
- [ ] Cmd+K and ghost text still work in editor
- [ ] Spec panel persists across page reloads
- [ ] No crashes on the documented happy path
- [ ] Inngest dashboard shows clean function runs

### Phase 2 (Day 7)
- [ ] New user signs up with credit card via Stripe
- [ ] GitHub repo import populates Convex files correctly for at least 5 test repos
- [ ] Push to GitHub creates clean commits with project history
- [ ] Vercel deploy returns a working live URL with Supabase backend
- [ ] Free-tier user blocked at quota with clear upgrade path
- [ ] All quotas tracked in Convex `usage` table

### Phase 3 (Day 11)
- [ ] Sentry capturing all server + client errors with PII redacted
- [ ] Rate limit returns 429 with Retry-After
- [ ] Vitest suite >70% coverage on agent loop, scaffold, sandbox sync
- [ ] Playwright e2e green on prompt-to-preview, GitHub import, deploy
- [ ] Manual security review documented (AI surfaces, secret handling, auth boundaries)
- [ ] CI green on PRs

### Phase 4 (Day 14)
- [ ] `https://build.praxiomai.xyz` resolves with valid SSL
- [ ] Public signup works, onboarding completes
- [ ] ToS / Privacy / DPA published, lawyer-approved
- [ ] Status page live, monitoring real probes
- [ ] Support inbox monitored, response SLA documented
- [ ] First 50 invited beta users onboarded

---

## 10. Open Decisions (parking lot)

These are deferred — not blockers — but should be revisited:

| # | Decision | Defer until |
|---|---|---|
| D1 | Multi-model routing (Claude vs Gemini vs GPT) | Post-launch v1.1 |
| D2 | Templates library (vs prompt-only) | Post-launch v1.2 |
| D3 | AI-inferred spec coverage | Post-Praxiom integration |
| D4 | Self-hosted deploy option (Docker, fly.io) | When users ask |
| D5 | Mobile/Flutter generation | Post-fundraise |
| D6 | Real-time collaboration on a single project | When usage shows demand |
| D7 | Slash-command palette (Rocket's "Precision Mode") | Phase 5 / v1.1 |
| D8 | Native Praxiom integration (`@research-task-X`) | Praxiom integration plan, separate timeline |

---

## 11. Self-Review

**Spec coverage:** Each user-answered requirement maps to a phase/sub-plan: complete product (Phases 1-4), Next.js+Supabase generated apps (sub-03, sub-07), spec panel (sub-05), GitHub+Deploy (sub-06, sub-07), E2B sandbox (sub-02), proxied keys (sub-08 metering), Claude-only (locked §2), "Polaris by Praxiom" branding (sub-10), `build.praxiomai.xyz` (Day 0 + sub-10), continuously iterated (Phase 4 = soft launch, not freeze).

**Placeholder scan:** No "TBD" or "implement later" patterns in this master plan. Sub-plans will have TDD-grade detail.

**Type consistency:** Tool names referenced consistently (`read_file`, `write_file`, `create_file`, `delete_file`, `list_files`, `run_command`). File paths consistent. Convex table names consistent (`sandboxes`, `specs`, `integrations`, `deployments`, `usage`, `plans`).

**Risk gaps fixed:** Added R7 (Praxiom team distraction), R9 (dual-auth confusion), R10 (DNS delays). Day 0 expanded to include all infra prerequisites.

---

## 12. Execution Handoff

This master plan does **not** itself dispatch agents. The next action is:

**Step A — Day 0 (today/tomorrow):**
1. Provision all 12 prerequisites in §8 in parallel (you + me, ~3 hours).
2. Write sub-plan 01 (`agent-loop`) and sub-plan 02 (`e2b-sandbox`) in TDD-grade detail using `superpowers:writing-plans` again, one per worktree.
3. Write sub-plan 03 (`scaffolding`), 04 (`streaming-ui`), 05 (`spec-panel`) — these can be drafted Day 0 or Day 1 morning.

**Step B — Day 1 onward:**
For each sub-plan, dispatch a fresh subagent via `superpowers:subagent-driven-development`. Two-stage review: subagent self-checks against plan, then you review the diff before merge.

**Step C — Phase boundaries:**
At end of each phase, run the §9 "Definition of Done" checklist against the actual product. If any item fails, the next phase does not start until it's green.

---

**Decision needed from you to proceed:**

1. Confirm Day 0 prerequisites in §8 — any I missed? Any you want to drop?
2. Do you want me to write **sub-plan 01 (Agent Loop)** next, in full TDD-grade detail (~30-50 pages of executable steps)? That's the highest-risk subsystem and the foundation for everything else.
3. Should I also write sub-plan 02 (E2B Sandbox) immediately after, so Day 1 has both critical-path agents ready to dispatch in parallel?

Once you confirm, I'll write sub-plan 01 next.
