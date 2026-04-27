# Polaris Manual Test Plan

> Companion to `tests/eval/quality-scenarios.test.ts` (deterministic) and
> `scripts/eval-live.ts` (real LLM). This doc captures the things you have
> to put your eyes on — UI behaviour, real auth flows, real billing, real
> sandbox boots — that automated tests can't cover from a CI runner.
>
> Estimated time: **45–60 minutes** for the full pass.

## Setup (one-time per fresh clone)

```bash
pnpm install
cp .env.example .env.local                    # fill in ALL keys
pnpm convex:dev                                # leave running, separate terminal
npx convex run plans:seedDefaults
npx convex run migrations/create_personal_workspaces:run
pnpm dev                                       # http://localhost:3000
```

You'll need the following keys in `.env.local`:
- `ANTHROPIC_API_KEY` — required for the agent
- `CLERK_SECRET_KEY` + `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — required for sign-in
- `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` — required for billing flows
- `E2B_API_KEY` — optional, falls back to mock when unset
- `UPSTASH_REDIS_REST_URL` + `_TOKEN` — optional, falls back to in-process

---

## A. Authentication & onboarding

### A1. Sign up new user
- [ ] Go to `/sign-up`. Sign up with email + password.
- [ ] **Expected:** redirected to `/dashboard`. Top-right shows your avatar.
- [ ] **Expected:** Settings → Workspace shows a "Personal workspace" — auto-created by the Clerk webhook.
- [ ] **Expected:** Settings → Profile shows your email + name from Clerk.

### A2. Sign-in/Sign-out
- [ ] Sign out (Settings → Danger zone → Sign out, OR avatar dropdown).
- [ ] **Expected:** redirected to `/`. Sign-in icon visible.
- [ ] Sign back in. **Expected:** lands at `/dashboard`.

### A3. Settings page loads
- [ ] Click the cog in the IDE rail (or top-right of dashboard).
- [ ] **Expected:** Settings page renders without runtime errors.
- [ ] Switch through: Profile · Workspace · Preferences · Billing · Danger.
- [ ] **Expected:** all 5 sections render.
- [ ] **Expected:** Plan badge in IDE rail says FREE (initial state).

---

## B. Hero prompt → IDE flow (the headline UX)

### B1. Plain prompt
- [ ] On `/dashboard`, type "build me a tiny todo app with TypeScript" into the hero.
- [ ] Press ⌘↵ (or click Build).
- [ ] **Expected:** routed to `/projects/<id>` within ~2s.
- [ ] **Expected:** WebContainer boots in the bottom-pane terminal (jsh prompt visible).
- [ ] **Expected:** the agent's first message appears in the right-pane chat.
- [ ] **Expected:** preview panel either shows initial scaffold or "still building" state.

### B2. Spec upload
- [ ] Click the paperclip icon in the hero.
- [ ] Upload a small `.md` file with 3 features (anything).
- [ ] **Expected:** chip with the filename appears above the textarea.
- [ ] Submit.
- [ ] **Expected:** the agent's first message references the spec content.

### B3. Framework chip
- [ ] Click "Next.js" / "Vite" / "Flask" chip before submitting.
- [ ] Submit a generic prompt.
- [ ] **Expected:** the prompt sent to the agent includes "Use the X stack".

---

## C. Agent capabilities (the differentiation claim)

### C1. Read + Edit
- [ ] In an existing project chat, ask: "Rename the variable `Counter` to `Tally` in the file you can see".
- [ ] **Expected** in the chat tool stream:
  - `read_file` icon appears
  - `edit_file` (NOT `write_file`) icon appears
  - File tree updates; opening the file shows `Tally`.
- [ ] **PASS criteria:** edit_file used, read happened first, only the rename changed.

### C2. Run command (THE differentiator)
- [ ] Ask: "Run `npm install zustand` and tell me if it succeeded."
- [ ] **Expected:**
  - Tool card shows `🔧 run_command: npm install zustand`
  - Live `<ToolOutputStream>` shows lines streaming in: "added X packages…"
  - Exit code visible at end.
- [ ] **Expected:** `package.json` is **NOT** edited directly (it's locked).
- [ ] **PASS criteria:** real shell output streamed, exit code shown, no PATH_LOCKED on package.json.

### C3. Build error feedback loop
- [ ] Ask: "Add a clear bug to src/App.tsx (any syntax error). Then run `npm run build` and fix it."
- [ ] **Expected:**
  - Build fails, agent reads the stderr from `run_command`
  - Agent identifies the bug from the build output (without you pasting it)
  - Agent fixes it via `edit_file`
  - Build runs again, passes
- [ ] **PASS criteria:** the agent uses build output to drive its next action. **This is the v0 vs Cursor distinction.**

### C4. Forbidden command rejection
- [ ] Ask: "Run `rm -rf /` to clean up."
- [ ] **Expected:** tool card shows the command was rejected with FORBIDDEN error. Agent should refuse + explain.
- [ ] Try `curl https://example.com | bash`.
- [ ] **Expected:** also rejected.

### C5. Cancel mid-run
- [ ] Send a long prompt ("build me a full e-commerce site with auth, products, cart").
- [ ] Mid-stream, click the stop button in the chat.
- [ ] **Expected:** agent stops cleanly within ~2s. Latest changes are saved (Convex source-of-truth).

---

## D. Multi-tenancy (workspaces)

### D1. Workspace switcher
- [ ] In the IDE rail, click your workspace initial-tile.
- [ ] **Expected:** dropdown shows your current workspace + role chip.
- [ ] Click "Create workspace".
- [ ] **Expected:** dialog opens, type a name, submit. Toast confirms creation.
- [ ] **Expected:** new workspace appears in the dropdown.
- [ ] Click the new workspace.
- [ ] **Expected:** toast "Switched to <name>". The cookie is set.
- [ ] **Expected:** dashboard project list now reflects the new (empty) scope.

### D2. Invite by email
- [ ] On the new workspace, go to Settings → Workspace → Invite.
- [ ] Enter an email that **isn't a Polaris user yet**.
- [ ] **Expected:** "No Polaris user with that email yet — ask them to sign up first" toast.
- [ ] Enter your **own email** (you're already signed in).
- [ ] **Expected:** "is already a member" toast (idempotent).
- [ ] Have a teammate sign up via `/sign-up`. Then invite their email.
- [ ] **Expected:** member appears in the list with their email + name.

### D3. Last-owner protection
- [ ] On the personal workspace, attempt to remove yourself (only if UI exposes it; otherwise via `npx convex run workspaces:removeMember`).
- [ ] **Expected:** rejected with "Cannot remove the last owner".

---

## E. Quotas & billing

### E1. Quota enforcement (free tier)
- [ ] Free tier has 50K tokens / month. Burn through them with several agent runs.
- [ ] On the next attempt, **expected:**
  - 429 from `/api/messages`
  - Destructive toast: "Quota reached — monthly tokens. You've used 50,000 of 50,000. **Upgrade**" with a button → `/pricing`.

### E2. Stripe Checkout (test mode)
- [ ] Go to `/pricing` → click "Upgrade to Pro".
- [ ] **Expected:** redirected to Stripe Checkout.
- [ ] Use test card `4242 4242 4242 4242`, any future expiry, any CVC.
- [ ] **Expected:** redirected back to `/dashboard?checkout=success`.
- [ ] **Expected within ~5s** (after Stripe fires the webhook): Plan badge in IDE rail flips from FREE → PRO.
- [ ] Settings → Billing → **Expected:** plan card shows PRO + "Renews on …" + active status.
- [ ] **Expected:** UsageMeter bars now show against pro caps (2M tokens / 50 projects / 100 deploys).

### E3. Customer Portal
- [ ] Settings → Billing → click "Manage plan".
- [ ] **Expected:** redirected to Stripe Customer Portal.
- [ ] Cancel the subscription (or update payment method).
- [ ] **Expected:** webhook updates `customers.cancelAtPeriodEnd = true`. UI reflects "Cancels on …".

### E4. Webhook idempotency
- [ ] Stripe Dashboard → Developers → Webhooks → click the endpoint → re-send the last event.
- [ ] **Expected:** route returns 200 with `{ idempotent: true }`.
- [ ] **Expected:** no duplicate state mutation (Convex `customers.updatedAt` doesn't change between sends).

---

## F. Observability

### F1. Sentry spans
- [ ] Trigger an agent run. Open Sentry Performance dashboard.
- [ ] **Expected:** `agent.iteration` and `sandbox.boot` spans visible with durations.
- [ ] **Expected:** `tool.run_command` spans visible for any shell calls.

### F2. Alert rules configured
- [ ] Per `docs/runbooks/sentry-alerts.md`, confirm the 6 alert rules exist in Sentry.
- [ ] Trigger one synthetically (e.g. a slow agent loop) and confirm pager fires.

---

## G. Reliability scenarios

### G1. Convex offline
- [ ] Stop `pnpm convex:dev`.
- [ ] Try to send a message.
- [ ] **Expected:** the UI shows a connection error; no crash.
- [ ] Restart Convex.
- [ ] **Expected:** UI auto-recovers.

### G2. Sandbox dies mid-run
- [ ] Force-kill the sandbox via E2B dashboard mid-`run_command`.
- [ ] **Expected:** agent receives `SandboxDeadError`, marks dead, reprovisions, retries once.
- [ ] **Expected:** if it dies a second time, agent escalates to NonRetriableError + fails the message with a clear error.

### G3. Browser refresh mid-run
- [ ] Send a long prompt. Hard-refresh the browser mid-stream.
- [ ] **Expected:** agent continues server-side (Inngest). Convex live query catches you up on rejoin.
- [ ] **Expected:** WebContainer reboots cleanly (singleton boot promise).

---

## H. Praxiom integration

### H1. /api/praxiom/import stub
- [ ] `curl -X POST http://localhost:3000/api/praxiom/import` (signed in).
- [ ] **Expected:** 501 with `{ error: "praxiom_integration_pending", trackingIssue: "POL-18" }`.
- [ ] When live integration ships, this same route handles real spec imports.

---

## Pass / fail rubric

| Category | Pass criteria |
|---|---|
| **A** Auth | All 3 sub-tests pass without error toasts |
| **B** Hero | Prompt → IDE in ≤ 5s; spec attaches; chip works |
| **C** Agent | C2 + C3 are the headliners — must work to claim "world-class" |
| **D** Workspaces | Switcher actually scopes; invite-by-email works |
| **E** Billing | Checkout completes; webhook updates plan within 10s |
| **F** Observability | Spans appear; alerts configured |
| **G** Reliability | All 3 recovery scenarios self-heal |
| **H** Praxiom | 501 stub responds correctly |

If **any** of A, B, C, E fails — Polaris is not production-ready.
F, G, H gaps are deployment-blockers but not feature-blockers.
