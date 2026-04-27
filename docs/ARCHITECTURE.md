# Polaris Architecture

> Companion to `CONSTITUTION.md`. The Constitution states the *rules*;
> this document shows how the rules compose at runtime. Diagrams use
> ASCII so they survive `git diff` reviews.

## High-level data flow

```
                   ┌──────────────────────────────────────────────────────────────┐
                   │                          Browser                             │
                   │                                                              │
                   │   ┌────────────┐   ┌──────────────┐   ┌──────────────────┐  │
                   │   │ Next.js    │   │ WebContainer │   │ Convex live      │  │
                   │   │  routes    │   │  (in-tab)    │   │  query subscribe │  │
                   │   └─────┬──────┘   └──────┬───────┘   └────────┬─────────┘  │
                   │         │                 │                    │            │
                   └─────────┼─────────────────┼────────────────────┼────────────┘
                             │                 │                    │
                             │ HTTP            │ jsh / preview      │ WS
                             ▼                 ▼                    ▼
                   ┌──────────────────────────────────────────────────────────────┐
                   │                  Server / Convex Cloud                       │
                   │                                                              │
                   │  ┌─────────────┐   ┌────────────────┐   ┌──────────────────┐ │
                   │  │ /api/*       │  │ Inngest jobs   │   │ Convex DB         │ │
                   │  │  routes      │  │ (agent-loop,   │   │  (source of truth)│ │
                   │  │              │  │  process-msg,  │   │                   │ │
                   │  │              │  │  github-export │   │  - projects       │ │
                   │  │              │  │  deploy)       │   │  - files          │ │
                   │  │              │  │                │   │  - messages       │ │
                   │  │              │  │  AgentRunner   │   │  - sandboxes      │ │
                   │  │              │  │   ↓ uses       │   │  - workspaces     │ │
                   │  │              │  │  ToolExecutor  │   │  - plans / usage  │ │
                   │  │              │  │   ↓ uses       │   │  - webhook_events │ │
                   │  └──────┬───────┘  └────────┬───────┘   │  - clerk_user_*   │ │
                   │         │                   │           └──────────────────┘ │
                   │         │                   │                                │
                   │         │           ┌───────▼─────────┐                      │
                   │         │           │ getSandboxProv() │                     │
                   │         │           │   E2B prod      │                      │
                   │         │           │   Mock dev      │                      │
                   │         │           └───────┬─────────┘                      │
                   │         │                   │                                │
                   └─────────┼───────────────────┼────────────────────────────────┘
                             │                   │
                             ▼                   ▼
                       ┌──────────┐       ┌──────────────┐
                       │ Stripe   │       │ E2B sandbox  │
                       │ Clerk    │       │ (24h TTL)    │
                       │ Anthropic│       │              │
                       │ Sentry   │       │              │
                       └──────────┘       └──────────────┘
```

## Agent loop sequence

```
User types prompt → POST /api/messages
                         │
                         ▼
            rateLimitOr429({ bucket: "agentRun", plan })
                         │
                         ▼
            assertWithinQuotaInternal({ op: "agent_run" })
                         │
                         ▼
            getProcessingMessageInConversation  → 409 if in-flight
                         │
                         ▼
            createMessage(role: assistant, status: processing)
                         │
                         ▼
            inngest.send({ name: "agent/run", data: {...} })
                         │
                         ▼
        ┌────────────────────────────────────────────────────┐
        │  Inngest agent-loop function (retries: 3)          │
        │                                                    │
        │  1. assertWithinQuotaInternal      (NonRetriable)  │
        │  2. ensureSandbox()                                 │
        │       fetch sandboxes.getByProject                  │
        │       reuse if alive + within TTL                   │
        │       else sandbox.create()                         │
        │            ↓ withSpan("sandbox.boot")               │
        │       sandboxes.setForProject                       │
        │  3. AgentRunner.run({ resumeFromCheckpoint })       │
        │       ┌───────────────── loop iteration ─────────┐  │
        │       │  ClaudeAdapter.runWithTools             │  │
        │       │   ↓ yields AgentStep                    │  │
        │       │     - text_delta  → ConvexAgentSink     │  │
        │       │     - tool_call   → ToolExecutor.exec   │  │
        │       │         ↓                                │  │
        │       │       case run_command:                 │  │
        │       │         forbidden? → reject             │  │
        │       │         sandbox.exec(onStdout/onStderr) │  │
        │       │           → appendToolStream per line   │  │
        │       │     - usage      → usage.increment       │  │
        │       │     - done       → finalize + checkpoint │  │
        │       └─────────────────────────────────────────┘  │
        │                                                    │
        │  4. Catch SandboxDeadError → markDead, retry once  │
        │     Catch other errors    → checkpoint + rethrow   │
        └────────────────────────────────────────────────────┘
                         │
                         ▼
            Convex live query streams the new messages back
            to the browser; <ToolOutputStream> renders the
            stream array in real time.
```

## Sandbox lifecycle (D-018)

```
                    ┌─────────────────────────────┐
                    │  agent-loop.ensureSandbox() │
                    └──────────────┬──────────────┘
                                   │
              ┌────────────────────▼────────────────────┐
              │ Convex: sandboxes.getByProject          │
              └──────┬──────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
  row exists +                row absent
  alive +                     OR alive=false
  expiresAt > now             OR expiresAt < now
        │                         │
        ▼                         ▼
  reuse sandboxId          getSandboxProvider().create("nextjs", { 24h })
                                  │
                                  ▼
                          sandboxes.setForProject(sandboxId, expiresAt)
                                  │
                                  ▼
                          return sandboxId

  ┌── Run agent ──┐
  │               │
  │ try {         │
  │   runner.run()│
  │ } catch {     │
  │   if SDE      │
  │   markDead    │
  │   ensureSb()  │
  │   retry once  │
  │ }             │
  └───────────────┘
```

## Quota enforcement (§17, D-019, D-022)

```
                    ┌──────────────┐
                    │ entry point  │   /api/messages | agent-loop | github-export
                    └──────┬───────┘
                           │
                           ▼
              api.plans.assertWithinQuotaInternal({ op })
                           │
                           ▼
        ┌─── customers.plan ──→ plans.getById ──→ plan caps ───┐
        │                                                       │
        ▼                                                       │
  usage.{by_owner_month} or projects.{by_owner}.collect ◀───────┘
        │
        ▼
  current >= limit?
        │
   ┌────┴────┐
  yes        no
   │         │
   ▼         ▼
{ ok: false, reason, limit, current }   { ok: true }
       │
       ▼
  /api/messages → 429 + JSON  → conversation-sidebar parses → showQuotaBlocked toast
  agent-loop    → NonRetriableError
  github-export → NonRetriableError
```

## Stripe billing (§17.5, D-021)

```
User clicks "Upgrade to Pro" on /pricing
   │
   ▼
<form POST /api/billing/checkout> tier=pro
   │
   ▼
checkout/route.ts:
  - resolve customer (create if missing)
  - stripe.prices.list({ lookup_key: "polaris_pro" })
  - stripe.checkout.sessions.create
   │
   ▼
303 → Stripe Checkout
   │
   ▼ (user pays)
   │
   ▼
Stripe webhook → POST /api/billing/webhook
   │
   ▼
webhook/route.ts:
  - verify signature (STRIPE_WEBHOOK_SECRET)
  - webhook_events.isProcessed?  → 200 idempotent
  - dispatch by event.type:
     · checkout.session.completed → upsertFromWebhook(plan: pro)
     · customer.subscription.updated → upsertFromWebhook
     · customer.subscription.deleted → markCanceled (plan: free)
     · invoice.payment_failed → upsertFromWebhook(status: past_due)
  - webhook_events.markProcessed (only on success)

User clicks "Manage plan" in Settings
   │
   ▼
GET /api/billing/portal
   │
   ▼
303 → Stripe Customer Portal
```

## Workspaces (D-020)

```
new user signs up
   │
   ▼
Clerk webhook → /api/webhooks/clerk
   │
   ├─ clerk_users.upsertFromWebhook  (email/name cache)
   └─ workspaces.createPersonal       (idempotent)

user opens dashboard
   │
   ▼
useActiveWorkspaceId()
   │
   ├─ cookie polaris_active_workspace? → use it
   └─ else useCurrentWorkspace().{ first owned, else first member }

user clicks workspace in switcher
   │
   ▼
setActiveWorkspaceCookie(id)
useActiveScope.bump()  ── triggers project hooks to re-read
   │
   ▼
useProjects() → useQuery(api.projects.get, { workspaceId })
   │
   ▼
Convex projects.get:
  - resolveScope(userId, workspaceId)
    · if explicit, validate workspace_members.by_user_workspace
    · else fall back to first-owned or first-member-of
  - return projects.by_workspace.collect
```

## Constitution decision log (D-018..D-022 in flight)

| ID | Subject | Authority |
|---|---|---|
| D-018 | Per-project sandbox lifecycle | §6.3, §10 |
| D-019 | Plans table + idempotent seedDefaults | §17.2 |
| D-020 | Workspaces multi-tenancy + optional→required FK migration | §11.2 |
| D-021 | Stripe webhook idempotency via `webhook_events` | §13.1, §17.5 |
| D-022 | `assertWithinQuotaInternal` public-query gated on internalKey | §17, §13.4 |

Each decision lives at full length in [`CONSTITUTION.md`](CONSTITUTION.md)
Article XX. The architecture above is the implementation of those decisions.
