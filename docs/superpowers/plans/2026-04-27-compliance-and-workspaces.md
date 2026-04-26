# Polaris Constitutional Compliance + Workspaces Multi-tenancy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive Polaris from ~65% to 100% Constitutional compliance and add workspaces multi-tenancy as a first-class data model.

**Architecture:** Each Phase below is a self-contained subagent session. Phases 1–3 close the audit's critical gaps (E2B, run_command, edit_file, plans/quotas, Stripe, gitleaks, tests). Phase 4 introduces the `workspaces` table as a foreign-key migration over `projects` plus the membership model. Phase 5 is the cosmetic finish: surface plan tier in the rail, render workspace switcher.

**Tech Stack:** Next.js 16 (App Router), Convex, Clerk, Inngest, E2B, Stripe, Vitest, Playwright.

---

## Why a multi-session plan

The user audit estimates ~67h Week 1 + ~70h Week 2 of work to reach 100% compliance. That is genuinely 8–10 focused subagent sessions of ~6–10h each. Attempting all of it in a single conversation pass produces broken half-implementations of E2B, Stripe, gitleaks, quotas, AND breaks the working code that exists today. The cost of a broken main branch exceeds the cost of one extra session per phase.

**Phases below are ordered by blast radius:**
1. Agent capability (E2B + run_command + edit_file) — biggest UX delta vs. competitors
2. Quota enforcement (plans table + pre-operation checks) — revenue protection
3. Test coverage (unit + E2E) — landing safety
4. Workspaces migration — data-model foundation for teams
5. UI polish (plan tier, workspace switcher) — depends on 2 + 4

Each phase produces working, shippable software. If we stop after Phase 1, Polaris is materially better than it is today.

---

## Phase 1 — Agent Code Execution (E2B + run_command + edit_file)

**Reference:** Audit Gap 1 / "What world class looks like" / Articles VI, VIII.

### Task 1.1: edit_file Constitutional amendment

**Files:**
- Modify: `docs/CONSTITUTION.md` Article VIII (add 8th tool)
- Modify: `docs/CONSTITUTION.md` §20 Decision Log (D-018: edit_file)
- Modify: `convex/agents/tools.ts` (or wherever the tool registry lives — to be confirmed)
- Test: `tests/unit/tools/edit-file.test.ts`

- [ ] **Step 1.1.1: Locate the tool registry**
  Run: `grep -rn "read_file\|write_file" convex/ src/lib --include="*.ts" -l`
  Expected: a registry file listing the 7 tools.
- [ ] **Step 1.1.2: Define the EditFile tool spec**
  Add tool with args `{ path: string; old_string: string; new_string: string; replace_all?: boolean }`. Returns `{ replacements: number }`. Errors: `OLD_STRING_NOT_FOUND`, `OLD_STRING_NOT_UNIQUE` (if replace_all=false), `PATH_LOCKED`, `FILE_NOT_FOUND`.
- [ ] **Step 1.1.3: Write failing tests** (5 cases: not found, not unique, replace_all, path_locked, success)
- [ ] **Step 1.1.4: Implement** — find via Convex `system.getFileByPath`, do string replacement, persist via existing `system.updateFileContent`.
- [ ] **Step 1.1.5: Update CONSTITUTION.md Article VIII to list 8 tools, add D-018**
- [ ] **Step 1.1.6: Commit:** `feat(agent): add edit_file tool (D-018)`

### Task 1.2: E2B SandboxProvider implementation

**Files:**
- Create: `src/lib/sandbox/e2b-provider.ts`
- Test: `tests/unit/sandbox/e2b-provider.test.ts`
- Modify: `src/lib/sandbox/index.ts` (provider selection)

- [ ] **Step 1.2.1: Verify SandboxProvider interface**
  Read `src/lib/sandbox/types.ts` (or equivalent). Confirm 10 methods: `create`, `connect`, `exec`, `writeFile`, `readFile`, `mkdir`, `rm`, `list`, `kill`, `keepalive`.
- [ ] **Step 1.2.2: Write failing tests** for each of the 10 methods using a mock `@e2b/code-interpreter` import.
- [ ] **Step 1.2.3: Implement E2BSandboxProvider** wrapping `Sandbox.create`, `Sandbox.connect`, with `exec` accepting `onStdout`/`onStderr` streaming callbacks.
- [ ] **Step 1.2.4: Provider selection** — `SANDBOX_PROVIDER=e2b|mock` env, default `mock` in tests, `e2b` in prod.
- [ ] **Step 1.2.5: Commit:** `feat(sandbox): E2B provider with streaming exec`

### Task 1.3: run_command tool with streaming to chat

**Files:**
- Modify: tool registry (run_command implementation)
- Modify: `src/components/ai-elements/message.tsx` (add ToolOutputStream component)
- Test: `tests/unit/tools/run-command.test.ts`
- Test: `tests/e2e/run-command-stream.spec.ts`

- [ ] **Step 1.3.1: Forbidden command guard**
  Add `src/lib/agent/forbidden-commands.ts` with the regex list from Article XIII. Test all 5 patterns reject.
- [ ] **Step 1.3.2: Streaming surface in Convex**
  Add `system.appendToolStream` mutation that pushes lines into a `messages.toolCalls[].stream[]` array.
- [ ] **Step 1.3.3: Implement run_command tool**
  Calls `sandbox.exec(cmd, { onStdout: line => appendToolStream(...), onStderr: ... })`. Returns `{ stdout, stderr, exitCode, durationMs }`.
- [ ] **Step 1.3.4: Add ToolOutputStream UI component**
  Renders streaming lines under the tool-call card with a vertical accent bar (Praxiom §7.7 — `border-l-2 border-primary/40 pl-3`). Scrollable, monospace, JetBrains Mono.
- [ ] **Step 1.3.5: Wire into message-bubble.tsx** — when `tc.name === "run_command"`, render `<ToolOutputStream lines={tc.stream} />`.
- [ ] **Step 1.3.6: Commit:** `feat(agent): run_command with streaming output to chat`

---

## Phase 2 — Quota Enforcement + Stripe + Vercel AI SDK strip

**Reference:** Audit Gaps 2, 3, 4 / Article XVII.

### Task 2.1: plans table + quota schema

**Files:**
- Modify: `convex/schema.ts` (add `plans` table, augment `customers` if needed)
- Create: `convex/plans.ts`
- Modify: `convex/usage.ts` (add reset boundaries + plan-aware aggregations)

- [ ] **Step 2.1.1:** Define `plans` table per Article XVII §17.2 — `id` (free|pro|team), monthly token limit, daily $ ceiling, projects allowed, deploys allowed, seats.
- [ ] **Step 2.1.2:** Seed 3 plan rows via a one-off `seedPlans` internal mutation; document in D-019.
- [ ] **Step 2.1.3:** Add `usage.assertWithinQuota(userId, op)` query — returns `{ ok: true } | { ok: false, reason, limit, current }`.
- [ ] **Step 2.1.4: Test** `tests/unit/quota/quota-check.test.ts` — 6 cases (free under, free at, free over, pro under, pro over, team).
- [ ] **Step 2.1.5: Commit:** `feat(quota): plans table + assertWithinQuota query`

### Task 2.2: Wire pre-operation quota checks

**Files:**
- Modify: `src/features/conversations/inngest/agent-loop.ts` (assert before loop entry)
- Modify: `src/app/api/messages/route.ts` (assert before Inngest dispatch)
- Modify: `src/features/projects/inngest/github-export.ts` (assert export quota)
- Create: `src/components/quota-blocked-toast.tsx` (UI)

- [ ] **Step 2.2.1: Test** `tests/e2e/quota-blocks-free-user.spec.ts` — free user hits 50K tokens, gets 429 with upgrade CTA.
- [ ] **Step 2.2.2:** Add the assertion at all 3 entry points; on failure, surface a destructive toast with "Upgrade to Pro" link to `/pricing`.
- [ ] **Step 2.2.3: Commit:** `feat(quota): enforce limits at API and Inngest entry points`

### Task 2.3: Stripe webhook + lifecycle

**Files:**
- Modify: `src/app/api/billing/webhook/route.ts` (complete the handler)
- Modify: `convex/customers.ts` (idempotency keys)
- Test: `tests/unit/billing/webhook.test.ts`

- [ ] **Step 2.3.1: Test** failing webhook for `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
- [ ] **Step 2.3.2: Idempotency:** add `processed_stripe_events` table (eventId, processedAt). Reject duplicates.
- [ ] **Step 2.3.3: Implement** all 4 handler branches; on success, `customers.upsertFromWebhook`.
- [ ] **Step 2.3.4: Commit:** `feat(billing): complete Stripe webhook lifecycle with idempotency`

### Task 2.4: Strip Vercel AI SDK

**Files:**
- Modify: `src/app/api/suggestion/route.ts` (use ClaudeAdapter)
- Modify: `src/app/api/quick-edit/route.ts` (use ClaudeAdapter)
- Modify: `package.json` (drop `@ai-sdk/anthropic`, `@ai-sdk/google`, `ai`)

- [ ] **Step 2.4.1: Read the existing routes** — note their request/response shape.
- [ ] **Step 2.4.2: Rewrite** each route to use the `ModelAdapter` interface; preserve response shape exactly.
- [ ] **Step 2.4.3: Remove deps** — `pnpm remove @ai-sdk/anthropic @ai-sdk/google ai`. Verify `pnpm build` and existing tests.
- [ ] **Step 2.4.4: Commit:** `refactor: strip Vercel AI SDK per D-007`

---

## Phase 3 — Test Coverage

**Reference:** Audit Gap 1 / Article XVI.

### Task 3.1: Unit test suites (6 missing)

**Files:**
- Create: `tests/unit/agents/agent-runner.test.ts`
- Create: `tests/unit/agents/claude-adapter.test.ts`
- Create: `tests/unit/agents/gpt-adapter.test.ts`
- Create: `tests/unit/agents/gemini-adapter.test.ts`
- Create: `tests/unit/sandbox/e2b-provider.test.ts` (covered in 1.2.2)
- Create: `tests/unit/scaffold/prompt-to-scaffold.test.ts`

- [ ] **Step 3.1.1: agent-runner** — loop termination (max iters), checkpoint resume, all 4 error layers.
- [ ] **Step 3.1.2: claude-adapter** — streaming token aggregation, retry on 429, stop reason mapping.
- [ ] **Step 3.1.3: gpt-adapter** — basic smoke (1 happy path, 1 error mapping).
- [ ] **Step 3.1.4: gemini-adapter** — basic smoke.
- [ ] **Step 3.1.5: prompt-to-scaffold** — schema validation (Zod), 3 valid prompts, 3 invalid.
- [ ] **Step 3.1.6: Commit per file:** keep unit-test commits granular.

### Task 3.2: E2E smoke tests (5 missing)

**Files:**
- Create: `tests/e2e/prompt-to-preview.spec.ts`
- Create: `tests/e2e/chat-modify.spec.ts`
- Create: `tests/e2e/github-import.spec.ts`
- Create: `tests/e2e/deploy.spec.ts`
- Create: `tests/e2e/quota-blocks-free-user.spec.ts` (covered in 2.2.1)

- [ ] **Step 3.2.1: prompt-to-preview** — submit hero prompt, wait for `serverUrl`, assert iframe loads.
- [ ] **Step 3.2.2: chat-modify** — open existing project, send "rename Counter to Tally", assert file content changed.
- [ ] **Step 3.2.3: github-import** — paste public repo URL, assert files appear in tree.
- [ ] **Step 3.2.4: deploy** — trigger deploy, assert deployment URL surfaces.
- [ ] **Step 3.2.5: Commit per spec.**

---

## Phase 4 — Workspaces Multi-tenancy

**Reference:** User explicit request. **Not** in current schema — net-new.

### Task 4.1: Schema migration

**Files:**
- Modify: `convex/schema.ts` — add `workspaces`, `workspace_members`; add `workspaceId` to `projects`.
- Create: `convex/workspaces.ts`
- Create: `convex/migrations/2026-04-create-personal-workspaces.ts`

```ts
// New tables
workspaces: defineTable({
  name: v.string(),
  slug: v.string(),
  ownerId: v.string(),                 // Clerk userId of owner
  plan: v.union(...),                  // mirrors customers.plan; bills per workspace
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_owner", ["ownerId"])
  .index("by_slug", ["slug"]),

workspace_members: defineTable({
  workspaceId: v.id("workspaces"),
  userId: v.string(),
  role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
  joinedAt: v.number(),
}).index("by_workspace", ["workspaceId"])
  .index("by_user", ["userId"])
  .index("by_user_workspace", ["userId", "workspaceId"]),

// Augmented
projects: defineTable({
  ...existing,
  workspaceId: v.optional(v.id("workspaces")),  // optional during migration
})
```

- [ ] **Step 4.1.1: Add tables and indexes** to `convex/schema.ts`.
- [ ] **Step 4.1.2: Migration mutation** `createPersonalWorkspaces`: for every distinct `ownerId` in `projects`, insert a `workspaces` row named "{userName}'s workspace", insert one `workspace_members` row (role=owner), patch all that user's projects with `workspaceId`.
- [ ] **Step 4.1.3: Run migration** in dev, assert every project has `workspaceId` set.
- [ ] **Step 4.1.4: Make `workspaceId` required** in a follow-up commit once migration is verified.
- [ ] **Step 4.1.5: Commit:** `feat(schema): workspaces + workspace_members tables (migration plan D-020)`

### Task 4.2: Workspace queries/mutations

**Files:** `convex/workspaces.ts`

- [ ] `getCurrent` — current user's "active" workspace (= first owned, or first member of).
- [ ] `listForUser` — all workspaces the user is a member of.
- [ ] `create({ name })` — creates workspace + owner membership atomically.
- [ ] `invite({ workspaceId, email })` — sends Clerk invite, pre-creates `workspace_members` row.
- [ ] `removeMember` / `updateRole` — owner-only.
- [ ] **Test** each in `tests/unit/workspaces/*.test.ts`.

### Task 4.3: Project scoping

**Files:** `convex/projects.ts`

- [ ] All project queries gain a `workspaceId` filter (default = current workspace).
- [ ] `create` requires `workspaceId`; defaults to current.
- [ ] Authorization: project access requires `workspace_members` row.

### Task 4.4: Frontend integration

**Files:**
- Create: `src/features/workspaces/hooks/use-workspaces.ts`
- Create: `src/features/workspaces/components/workspace-switcher.tsx`
- Modify: `src/features/projects/components/ide-rail.tsx` (add switcher above logo or replace UserButton)
- Modify: `src/features/projects/components/projects-view.tsx` (header shows workspace name)

- [ ] Hook: `useCurrentWorkspace`, `useWorkspaces`, `useCreateWorkspace`, `useInviteMember`.
- [ ] WorkspaceSwitcher: Praxiom §7.8 dropdown (avatar + truncated name + chevron).
- [ ] Wire into rail (top, replacing the bare logo) and dashboard top bar.
- [ ] Settings page: new section "Workspaces" with member list + invite form.

---

## Phase 5 — Cosmetic Surfacing

- [ ] Plan tier badge in rail (free/pro/team chip below avatar).
- [ ] Usage meter in Settings → Billing (tokens used / limit).
- [ ] Real gitleaks integration (`src/lib/security/secret-scan.ts`).
- [ ] Sentry performance dashboard + alerts (Article XIV instrumentation).
- [ ] Generic "My apologies" fallback removed from `process-message.ts` (Article §2.6).
- [ ] Prompt-injection hardening note in system prompt.

---

## Self-review checklist (run at end of each phase)

1. `pnpm tsc --noEmit` — zero errors
2. `pnpm lint` — zero new errors in modified files
3. `pnpm test` — all unit tests green
4. `pnpm test:e2e` — relevant smoke green
5. `git diff main` — no unrelated drift
6. CONSTITUTION.md decision log updated if any architectural decision was made

---

## Decision Log (proposed)

- **D-018**: Add `edit_file` as the 8th agent tool — find/replace beats whole-file rewrite for large files.
- **D-019**: `plans` table is the source of truth for limits; `customers.plan` is the user's selection. Seeding via internal mutation, not migration script.
- **D-020**: Workspaces are introduced as optional FK (Phase 4.1) then migrated to required (Phase 4.1.4) to avoid downtime.
