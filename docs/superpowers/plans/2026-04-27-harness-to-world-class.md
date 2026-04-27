# Polaris Harness — From Today's State to World-Class

> **For agentic workers:** Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to drive task-by-task. Steps use `- [ ]` checkboxes for tracking.

**Goal.** Take Polaris's agent harness from "competent SaaS plumbing" to the level of orchestration described in Anthropic's *Harness Design for Long-Running Agentic Apps* and OpenAI's *Harness Engineering*, while keeping the SaaS-specific edges (sandbox safety, quotas, multi-tenancy, billing) we already lead on. **Browser-first** — no CLI/TUI work.

**Operating principle.** Every Phase below is one focused subagent session of 4–10 hours. Phases are dependency-ordered; Phase 0 unblocks 1, 1 unblocks 3, etc. Where Phases are independent (5, 6, 7) they can run in parallel.

**Tech stack** — same as today: Next.js 16, Convex, Clerk, Inngest, E2B, raw `@anthropic-ai/sdk`, Vitest, Playwright.

---

## Why this plan, why now

I read three primary sources and one runtime side-by-side:

1. **Anthropic — Harness Design for Long-Running Agentic Apps.** Three-agent harness (Planner → Generator → Evaluator) with Playwright MCP for execution-based grading. Iteration counts 5–15. Cost $200/run accepted. Key insight: *self-evaluation is unreliable*; *context anxiety* causes Claude to wrap up early near limits; **full context resets with structured handoff outperform in-place compaction**.

2. **OpenAI — Harness Engineering (the Codex-builds-OpenAI-product article).** Single agent + massively-invested *environment*. **`AGENTS.md` is a 100-line table-of-contents, not an encyclopedia**. Plans are first-class artifacts checked into the repo (`docs/exec-plans/active/`). Per-worktree app boots, Chrome DevTools Protocol wired in, custom linters with **remediation messages injected into agent context**, recurring doc-gardening + GC agents.

3. **pi-mono (badlogic/pi-mono).** Three years of agent-runtime polish from libGDX-era engineer. `pi-ai` unifies 20+ providers with a single `Context` shape. Native prompt caching, `thinking_*` streaming events, mid-run `steer()`, branching sessions, compaction. **Explicitly rejects plan mode** — different product thesis.

4. **Polaris's actual code** — `agent-runner.ts`, `code-agent.ts`, `claude-adapter.ts`, `system-prompt.ts`, `convex/schema.ts`. Confirmed by codebase grep:
   - **No plan mode**, no Planner agent, no plans-as-files for user projects
   - **No compaction** — hard wall at 150K tokens, then `markDone(state, "error", ...)`
   - **No multi-agent evaluation** — single AgentRunner runs ClaudeAdapter end-to-end
   - **No browser-driving tools** — agent can `npm run build` but can't screenshot the preview, click buttons, or read the rendered DOM
   - **No agent-readable repo-as-record** — `docs/CONSTITUTION.md` etc. are for *Polaris engineers*, not for the agent generating user apps
   - **No prompt caching** — `cache_control` never appears in `claude-adapter.ts`
   - **No `thinking_*` events** — `AgentStep` union has only `text_delta | tool_call | usage | done`
   - **5-minute hard cap** — too short for any non-trivial build. Anthropic's *evaluator alone* runs 25 min on a single DAW pass. We're configured for "small refactor only."
   - **`/api/messages` is timing out today** on prompts like the user's "build SilverNish ecommerce" — this is a real symptom of the 5-min cap colliding with WebContainer slow boot + agent's need to do many tool calls

The four critical gaps from the article comparison, ordered by leverage:

| # | Critical Gap | Cost to fix | UX impact |
|---|---|---|---|
| 1 | **Plan mode** (plans-as-files, Planner→Generator separation) | High | Transformative |
| 2 | **Context compaction + reset-with-handoff** | Medium | Fixes "lose all work at 150K" |
| 3 | **Browser/UI verification** (agent can SEE the preview) | High | "Cursor vs v0" differentiator |
| 4 | **Repo as agent system-of-record** (`AGENTS.md` per project) | Low | Foundation for #1, #5 |

The two HIGH gaps:

| # | High Gap | Cost | Notes |
|---|---|---|---|
| 5 | **Multi-agent eval** (Generator + Evaluator) | Medium | Compose with #1 |
| 6 | **Mechanical enforcement** (linters with remediation injection) | Medium | Compose with #4 |

Plus pi-mono ports we should make:

| # | Port | Cost | Why |
|---|---|---|---|
| 7 | **Prompt caching** (`cache_control` on system + tools) | Low | 30–60% cost reduction immediately |
| 8 | **Multi-provider `Context` shape** | Medium | Replaces our Claude-baked `Message[]`; unblocks GPT/Gemini |
| 9 | **`thinking_*` streaming events** | Low | Ship Claude's extended-thinking to the chat |
| 10 | **Steering mid-run** | Low | Real UX win on top of existing cancel infra |

And one Polaris-specific catch-up:

| # | Item | Cost | Notes |
|---|---|---|---|
| 11 | **5-min cap → tier-aware budgets** (`free=5min`, `pro=30min`, `team=2hr`) | Low | Aligns with quota system; fixes today's `/api/messages` timeout |

---

## Phases at a glance

| Phase | Theme | Sessions | Hours | Parallelizable with |
|---|---|---|---|---|
| **0** | Foundation refactors (caching, thinking, Context, tier budgets) | 2 | 6–8 | — |
| **1** | Plan mode (Planner agent + plans-as-files + Plan UI) | 3 | 14–18 | — |
| **2** | Compaction + structured handoff + scratchpad memory | 2 | 8–10 | 5, 6 |
| **3** | Multi-agent eval (Evaluator subagent) | 2 | 10–12 | 6 |
| **4** | Browser/UI verification (Playwright-in-sandbox tools) | 3 | 12–14 | 5, 6, 7 |
| **5** | Repo as system-of-record (AGENTS.md, progressive disclosure) | 1 | 4–6 | 6, 7 |
| **6** | Mechanical enforcement (custom lints with remediation injection) | 2 | 8–10 | 5, 7 |
| **7** | Multi-provider Context shape | 2 | 8–10 | 5, 6 |
| **8** | Polish: steering, doc-gardener cron, longer paid-tier runs | 2 | 8–10 | — |

**Total: ~17 sessions / 80 hours / ~3 calendar weeks of focused execution.**

---

# Phase 0 — Foundation refactors

**Why first.** Phases 1–8 all assume: prompt-cached system+tools, `thinking_delta` plumbed end-to-end, longer wall-time for non-trivial work. If we don't land these now, every later phase has to retrofit.

## Task 0.1 — Prompt caching on system + tools

**Files:**
- Modify: `src/lib/agents/claude-adapter.ts`
- Modify: `src/lib/agents/agent-runner.ts` (call site for `runWithTools`)

**Steps:**

- [ ] **0.1.1** Read the current `runWithTools` body in `claude-adapter.ts`. Note where the system prompt + tools array are passed to `messages.stream`.
- [ ] **0.1.2** Wrap the system prompt as a content block with `cache_control: { type: "ephemeral" }`. Anthropic SDK shape:
  ```ts
  system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }]
  ```
- [ ] **0.1.3** Tag the **tools array** as cacheable on the last tool definition (Anthropic caches all tool definitions when the last one carries `cache_control`):
  ```ts
  const toolsWithCache = tools.map((t, i) => i === tools.length - 1
    ? { ...t, cache_control: { type: "ephemeral" } }
    : t)
  ```
- [ ] **0.1.4** Read the new `usage` from the streamed response — Anthropic returns `cache_creation_input_tokens` and `cache_read_input_tokens` separately from `input_tokens`. Extend `AgentStep`'s `usage` variant:
  ```ts
  | { type: "usage"; inputTokens: number; outputTokens: number;
      cacheCreationInputTokens?: number; cacheReadInputTokens?: number }
  ```
- [ ] **0.1.5** In `convex-sink.ts`, persist cache metrics into the `usage` Convex table. Schema add: `cacheReadTokens`, `cacheCreationTokens` optional fields.
- [ ] **0.1.6** Test: `tests/unit/agents/claude-adapter-cache.test.ts` — mock the SDK; assert `cache_control` is set; assert cache-read tokens flow through `AgentStep`.

**Verify:** `pnpm tsc --noEmit && pnpm vitest run tests/unit/agents/claude-adapter-cache.test.ts`.

**Commit:** `feat(adapter): prompt caching on system + tools (D-023)`. Authority D-023 added in Phase 0 commit.

**Expected ROI:** 30–60% input-token cost reduction on conversations >2 turns. Anthropic's docs cite ~10× cheaper cache reads.

## Task 0.2 — Surface `thinking_*` events end-to-end

**Files:**
- Modify: `src/lib/agents/types.ts` (add events)
- Modify: `src/lib/agents/claude-adapter.ts` (emit them)
- Modify: `src/lib/agents/sink.ts` + `convex-sink.ts` (persist)
- Modify: `convex/schema.ts` (`messages.thinking` field)
- Modify: `src/components/ai-elements/message.tsx` or `src/features/conversations/components/tool-call-card.tsx` (render)

**Steps:**

- [ ] **0.2.1** Extend `AgentStep`:
  ```ts
  | { type: "thinking_start" }
  | { type: "thinking_delta"; delta: string }
  | { type: "thinking_end" }
  ```
- [ ] **0.2.2** In `claude-adapter.ts`, when the stream yields a `thinking` content block delta, emit `thinking_delta`. Anthropic SDK delivers these via `content_block_delta` with `delta.type === "thinking_delta"`.
- [ ] **0.2.3** Schema: add `thinking: v.optional(v.string())` to the `messages` table.
- [ ] **0.2.4** Sink: `appendThinking(messageId, delta)` mutation in `convex/system.ts`.
- [ ] **0.2.5** UI: collapsed `<details><summary>Thinking</summary><pre>{thinking}</pre></details>` block above the message body. Praxiom muted-foreground italic.
- [ ] **0.2.6** Enable extended thinking in adapter call: `thinking: { type: "enabled", budget_tokens: 8000 }` for Claude 3.7+ models.
- [ ] **0.2.7** Test: replay a fixture stream with `thinking_delta` events; assert Convex receives the appended text.

**Commit:** `feat(agent): surface thinking_* events to chat (D-024)`.

## Task 0.3 — Tier-aware run budgets (fix today's timeout)

**Files:**
- Modify: `src/lib/agents/agent-runner.ts`
- Modify: `src/features/conversations/inngest/agent-loop.ts`

**Why.** Today's `MAX_DURATION_MS = 5 * 60_000` is a one-size-fits-all. The user's "Build SilverNish ecommerce" prompt times out because:
1. 5-min wall is shorter than the agent needs for a multi-feature build
2. `/api/messages/route.ts` blocks for the full Inngest dispatch including the quota query (which itself takes time)

**Steps:**

- [ ] **0.3.1** Replace constants with a function:
  ```ts
  export function runBudget(plan: "free" | "pro" | "team") {
    if (plan === "team") return { maxIterations: 200, maxTokens: 600_000, maxDurationMs: 2*60*60_000 }; // 2hr
    if (plan === "pro")  return { maxIterations: 100, maxTokens: 300_000, maxDurationMs: 30*60_000 };   // 30min
    return                       { maxIterations: 50,  maxTokens: 150_000, maxDurationMs: 5*60_000 };   // free: today's
  }
  ```
- [ ] **0.3.2** Plumb `plan` into `AgentRunner` deps. `agent-loop.ts` reads `customers.getByUser`, passes `plan` to runner.
- [ ] **0.3.3** Replace the three `MAX_*` checks in the runner's while loop with `budget.maxIterations` etc.
- [ ] **0.3.4** **Fix the route timeout**: in `src/app/api/messages/route.ts`, the route should return *immediately* after `inngest.send` — never block on the agent run. Today it does. Confirm by reading the route; the issue is that `convex.query(api.plans.assertWithinQuotaInternal, ...)` happens before the dispatch and Convex was responding slowly. Move the quota check INSIDE the Inngest function (which already does it on entry) and let the route return in <100ms.
  - Actually re-read the route: the route already only does fast queries. The 5-min timeout the user hit is the Inngest function timing out, NOT the HTTP route. Confirm by inspecting the error path — `timeout.ts:21:11` is a client-side ky timeout config.
  - In `src/lib/timeout.ts` (or wherever ky default is set): bump default request timeout to 30s. The agent run is async; we don't need to wait for it.
- [ ] **0.3.5** Test: `tests/unit/agents/budget.test.ts` — verify free plan caps at 5min, pro at 30min, team at 2hr.
- [ ] **0.3.6** Update the eval harness to use the right budget per plan in fixtures.

**Commit:** `feat(quota): tier-aware run budgets; fix /api/messages client timeout (D-025)`.

**Expected outcome:** Pro user can run "Build SilverNish ecommerce" without hitting the 5-min wall. Free user still capped (cost protection).

## Task 0.4 — Update `Constitution.md` with D-023..D-025

- [ ] **0.4.1** Append new entries:
  - **D-023** Prompt-cache the system prompt + last tool definition every call.
  - **D-024** Stream thinking blocks back to the chat as a collapsible block.
  - **D-025** Run budgets are plan-aware. Free = 5min/50it/150K, Pro = 30min/100it/300K, Team = 2hr/200it/600K.
- [ ] **0.4.2** Bump closing `last amended` date.

**Phase 0 done when:** `pnpm tsc && pnpm vitest run` clean; the SilverNish-style prompt completes instead of timing out at 5min on a Pro user.

---

# Phase 1 — Plan mode (THE BIG ONE)

**Why this is critical.** Both Anthropic and OpenAI converge: plans are files, plans are first-class artifacts. The agent must *write a plan, save it to the project, then execute against it*. Today Polaris's "spec-driven" pitch is marketing — the agent never writes a plan and never reads one back.

The architectural shape we're building:

```
User prompt
    │
    ▼
┌──────────────────────────────────────────┐
│ PlannerAgent (separate Anthropic call)   │
│   Input: prompt + spec attachment        │
│   Output: structured plan (features +    │
│           acceptance criteria + sprints) │
│   Persisted to: convex/specs row +       │
│                 /docs/plan.md in user    │
│                 project's file tree      │
└──────────────────────────────────────────┘
    │
    ▼
User reviews/edits plan in left pane
    │
    ▼
User clicks "Start build"
    │
    ▼
┌──────────────────────────────────────────┐
│ GeneratorAgent (the existing AgentRunner)│
│   Reads plan.md as part of context       │
│   Marks features done as it ships them   │
└──────────────────────────────────────────┘
```

The `convex/specs` table **already exists** with the right shape (features array, status enum, acceptance criteria). Phase 1 wires it to the agent loop.

## Task 1.1 — Plan format + persistence

**Files:**
- Modify: `convex/specs.ts` (or create — does it exist?)
- Modify: `convex/schema.ts` (add planMarkdown to specs row)
- Create: `src/lib/agents/plan-format.ts`

**Steps:**

- [ ] **1.1.1** Check if `convex/specs.ts` exists — if not, create. Add CRUD: `createPlan`, `updatePlan`, `setFeatureStatus`, `getCurrentPlan({ projectId })`.
- [ ] **1.1.2** Schema: add `planMarkdown: v.optional(v.string())` to specs (the human-readable form the user edits).
- [ ] **1.1.3** Define plan format. We pick one canonical YAML/markdown shape — agent and UI both read/write it. Example:
  ```markdown
  # SilverNish — Build Plan

  ## Sprint 1: Foundation
  - [ ] auth-clerk: Wire Clerk for sign-up/in.
        Acceptance: user can sign up with email; redirected to /dashboard.
  - [ ] schema-products: Convex schema for products table.
        Acceptance: schema deploys; products.list returns [].

  ## Sprint 2: Catalog
  - [ ] product-list-page: /products renders all products.
        Acceptance: page renders; 0 console errors.
  ...
  ```
- [ ] **1.1.4** `plan-format.ts` exports `parsePlan(md): Plan` and `serializePlan(plan): md`. Plan type matches existing `specs.features` validator.
- [ ] **1.1.5** When agent writes plan, it writes BOTH `convex/specs` (structured) and `/docs/plan.md` in the user's project file tree (so it shows up in the file explorer).
- [ ] **1.1.6** Test `tests/unit/specs/plan-format.test.ts` — round-trip parsing, malformed input handling.

## Task 1.2 — Planner agent

**Files:**
- Create: `src/lib/agents/planner.ts`
- Create: `src/lib/agents/planner-system-prompt.ts`
- Create: `src/features/conversations/inngest/plan.ts` (Inngest function `plan/run`)
- Modify: `src/app/api/inngest/route.ts` (register `plan/run`)

**Steps:**

- [ ] **1.2.1** `planner-system-prompt.ts` — based on Anthropic's planner pattern:
  > "You are the Polaris Planner. The user has given you a 1–4 sentence prompt. Expand it into a complete, ambitious-but-bounded build plan organized into 3–10 sprints. For each sprint, list 3–8 features, each with crisp testable acceptance criteria. Stay focused on product context and high-level technical design — do NOT prescribe implementation details. Output strict YAML matching the Plan schema."
- [ ] **1.2.2** `planner.ts` — single Anthropic call (no tool use). Uses `ClaudeAdapter.runWithTools` with `tools: []` and the planner system prompt. Returns `Plan`.
- [ ] **1.2.3** Inngest function `plan/run`:
  - Event payload: `{ projectId, conversationId, userPrompt, specAttachment? }`
  - Step 1: call planner → Plan
  - Step 2: persist via `specs.create` + write `/docs/plan.md` via `system.createFileInternal`
  - Step 3: emit `plan/ready` event with `{ projectId, planId }`
  - Inngest retries: 2 (planner is one-shot, retry-tolerant)
  - Hard timeout: 5 minutes
- [ ] **1.2.4** Test: `tests/unit/agents/planner.test.ts` with ScriptedAdapter — verify planner output round-trips through parse/serialize.

## Task 1.3 — Build button + plan UI

**Files:**
- Modify: `src/features/projects/components/projects-view.tsx` (hero submission flow)
- Create: `src/features/specs/components/plan-pane.tsx` (left pane in IDE)
- Modify: `src/features/projects/components/project-id-layout.tsx` (wire plan pane)
- Modify: `src/app/api/messages/route.ts` (split "first message" → planner path)

**New flow:**

```
User submits hero textarea
    │
    ▼
POST /api/messages (first message of conversation)
    │
    ▼
detect: is this the first message + no plan yet?
    │
    ├─ YES → emit plan/run; route returns { planId, status: "planning" }
    │
    └─ NO  → emit agent/run as today
```

- [ ] **1.3.1** `/api/messages` detects first-message-of-project → dispatches `plan/run` instead of `agent/run`. Returns `{ status: "planning", planId }`.
- [ ] **1.3.2** `<PlanPane />` — left pane in IDE (replaces or co-exists with file explorer). Renders Plan as editable checklist. CSS: Praxiom §7.4 chip palette for status badges.
- [ ] **1.3.3** "Start build" button at top of plan pane. On click → POST `/api/specs/start-build` → emits `agent/run` with the plan in scope.
- [ ] **1.3.4** Generator system prompt update: prepend "Active build plan from /docs/plan.md:\n\n{plan}\n\nAs you complete each feature, update its status to `done` via `set_feature_status` tool."

## Task 1.4 — `set_feature_status` tool (9th tool)

**Files:**
- Modify: `src/lib/agents/code-agent.ts` (legacy registry)
- Modify: `src/lib/tools/definitions.ts` (modern registry)
- Modify: `src/lib/agents/system-prompt.ts`
- Modify: `convex/specs.ts`

**Steps:**

- [ ] **1.4.1** Tool spec:
  ```ts
  {
    name: "set_feature_status",
    description: "Mark a plan feature as in_progress, done, or blocked. Use this as you complete each feature so the user can track progress.",
    input_schema: { type: "object", properties: {
      featureId: { type: "string" },
      status: { type: "string", enum: ["todo","in_progress","done","blocked"] },
    }, required: ["featureId","status"] },
  }
  ```
- [ ] **1.4.2** Handler — call `convex.mutation(api.specs.setFeatureStatus, ...)`.
- [ ] **1.4.3** Update `convex/specs.ts` if `setFeatureStatus` doesn't already exist.
- [ ] **1.4.4** **Constitutional amendment D-026**: 9 tools now (8 file-mutation + run_command + set_feature_status). Update Article §8 heading + decision log.
- [ ] **1.4.5** Test: `tests/unit/tools/set-feature-status.test.ts` — mocks ctx.db; asserts feature row patched.

**Phase 1 done when:** User types "build SilverNish ecommerce", sees a plan render in left pane within 30s, can edit it, clicks "Start build", and watches features tick to `done` as the agent ships them.

**Commits (4):**
- `feat(specs): plan-format + plan-markdown persistence`
- `feat(agent): Planner agent + plan/run Inngest fn (D-026 part 1)`
- `feat(ui): plan pane + build button flow`
- `feat(agent): set_feature_status tool wired (D-026 part 2)`

---

# Phase 2 — Compaction + scratchpad memory

**Why.** Anthropic: *context anxiety* + *coherence loss* near the limit. Solution: full reset with a structured handoff artifact. Today we just `markDone(state, "error", "Context limit reached. Start a new conversation.")` — the user loses all work-in-progress context.

## Task 2.1 — Auto-compaction at 100K tokens

**Files:**
- Modify: `src/lib/agents/agent-runner.ts`
- Create: `src/lib/agents/compactor.ts`
- Create: `src/lib/agents/compactor-prompt.ts`

**Steps:**

- [ ] **2.1.1** In the runner's while loop, before the iteration check, also check `state.totalInputTokens + state.totalOutputTokens >= COMPACTION_THRESHOLD` (default 100K, 2/3 of 150K).
- [ ] **2.1.2** When triggered:
  - Call `compactor` (one Anthropic call, no tools, separate system prompt)
  - It receives the full message history + a request: "Summarize the conversation so far in <2K tokens. Preserve: the user's original goal, completed plan-features, in-flight work, key decisions, file paths touched, last 3 turns verbatim. Output: structured handoff artifact (markdown)."
  - Write the artifact to `/docs/handoff-{timestamp}.md` in the user project
- [ ] **2.1.3** Reset the runner state:
  ```ts
  state.messages = [
    { role: "user", content: `Continuing from compaction. Handoff:\n\n${artifact}` }
  ]
  state.iterationCount = 0  // reset; total tokens carry forward
  ```
- [ ] **2.1.4** Emit `<CompactionEvent>` to chat: collapsed banner "Context compacted. {tokensFreed} tokens freed."
- [ ] **2.1.5** Test: `tests/unit/agents/compaction.test.ts` — fixture conversation at 100K → compactor returns artifact → state resets → next turn sees the artifact as user message.

## Task 2.2 — Agent scratchpad memory

**Why.** OpenAI: durable artifacts checked into the repo. Polaris's `agent_checkpoints` is for retry-resume, not for *agent-authored project knowledge*.

**Files:**
- Modify: `src/lib/agents/system-prompt.ts`
- New convention: `/.polaris/notes.md` in user project

**Steps:**

- [ ] **2.2.1** System prompt addition: "You may write durable notes for future agent runs to `/.polaris/notes.md`. Use this for: project-specific quirks you discovered, conventions the user prefers, files you've already explored. Keep it short — re-read it at the start of every session via `read_file('/.polaris/notes.md')`."
- [ ] **2.2.2** Update `FilePermissionPolicy` to whitelist `/.polaris/*` as agent-writable.
- [ ] **2.2.3** Update planner: when generating the plan, also bootstrap `/.polaris/notes.md` with project conventions.
- [ ] **2.2.4** Test the loop: agent reads notes → modifies them → next turn re-reads. Stub-LLM eval scenario.

**Commits:** `feat(agent): auto-compaction at 100K + scratchpad memory (D-027)`.

---

# Phase 3 — Multi-agent eval (Evaluator subagent)

**Why.** Anthropic: "When asked to evaluate work they've produced, agents tend to respond by confidently praising the work — even when, to a human observer, the quality is obviously mediocre." Polaris today does exactly this — the same agent that writes code grades it.

## Task 3.1 — Evaluator agent + grading rubric

**Files:**
- Create: `src/lib/agents/evaluator.ts`
- Create: `src/lib/agents/evaluator-prompt.ts`
- Modify: `convex/specs.ts` (add `eval_report` field per feature)

**Steps:**

- [ ] **3.1.1** Evaluator system prompt (matches Anthropic's 4-criteria pattern):
  > "You are the Polaris Evaluator. The Generator agent has just shipped Sprint {N}. Your job is to grade it on 4 axes: **Functionality** (does the acceptance criteria pass?), **Code quality** (typing, structure, no obvious anti-patterns), **Design** (Praxiom §1–§14 conformance), **Build health** (does `npm run build` pass?). For each feature, score 1–5 with one-sentence rationale. Then return overall verdict: PASS / FAIL / RETURN-FOR-FIX. If FAIL or RETURN-FOR-FIX, list 1–5 specific issues the Generator must address."
- [ ] **3.1.2** Tool surface for the evaluator: `read_file`, `list_directory`, `run_command` (for `npm run build`/`test`), and the new browser tools from Phase 4 once landed. NO write/edit tools — Evaluator must not touch code.
- [ ] **3.1.3** Inngest function `eval/run` (sprint-scoped). Triggered when Generator marks all features in a sprint as `done`.
- [ ] **3.1.4** Persist eval report to `convex/specs` row's new `eval_report` JSON field.

## Task 3.2 — Generator → Evaluator handoff loop

**Files:**
- Modify: `src/features/conversations/inngest/agent-loop.ts`
- Modify: Generator system prompt

**Steps:**

- [ ] **3.2.1** When Generator finishes a sprint (all features `done`), emit `eval/run` event.
- [ ] **3.2.2** When Evaluator returns `RETURN-FOR-FIX`, dispatch a *new* Generator turn with the eval report as context: "The Evaluator returned the following issues. Address them, then mark the sprint done again."
- [ ] **3.2.3** Hard cap: max 3 eval rounds per sprint. After that, surface to user as "needs your review."
- [ ] **3.2.4** UI: per-feature rubric chips in the plan pane (`★★★★☆` for code quality, etc).

## Task 3.3 — Tier-gated multi-agent

**Why.** Anthropic notes $200/run vs $9/run — multi-agent is 20× more expensive. We can't run Evaluator on free tier.

**Steps:**

- [ ] **3.3.1** Free tier: skip Evaluator (single-agent, today's behavior).
- [ ] **3.3.2** Pro/Team tier: run Evaluator after each sprint.
- [ ] **3.3.3** Setting in Settings → Preferences: "Enable Evaluator (uses ~30% more tokens)" toggle for Pro+ users.
- [ ] **3.3.4** **D-028**: multi-agent eval is gated by plan tier; document in Constitution.

**Commit:** `feat(agent): Evaluator subagent with sprint-scoped grading (D-028)`.

---

# Phase 4 — Browser/UI verification (the Cursor-vs-v0 differentiator)

**Why critical.** Right now Polaris's agent can run `npm run build` and read TypeScript errors — that's "Cursor-tier." But it cannot SEE the rendered preview. It cannot click a button to verify the cart flow works. **Anthropic's evaluator uses Playwright MCP. OpenAI wires Chrome DevTools Protocol into the agent runtime.** Both teams agree this is non-negotiable for non-trivial UI work.

## Task 4.1 — Architecture decision: where does the headless browser live?

**Two options:**

| Approach | Pros | Cons |
|---|---|---|
| **A. Playwright in the E2B sandbox** | Sandbox already there. Server-side. Agent can drive it via tool calls. | E2B images need Playwright preinstalled (~300MB extra). |
| **B. Playwright on a separate Polaris worker** | Smaller E2B footprint. Centralized image. | Adds infra; needs reverse-tunnel from sandbox preview to worker. |

**Decision (D-029):** Option A. The sandbox already runs `npm run dev` for preview; running Playwright inside the same sandbox keeps everything in one process tree, and we can save sandbox time by pre-baking a Polaris-specific E2B template with `playwright + chromium` preinstalled.

## Task 4.2 — Browser tool surface (4 new tools)

**Files:**
- Modify: `src/lib/agents/code-agent.ts`
- Modify: `src/lib/sandbox/e2b-provider.ts` (helpers for Playwright bridge)
- Create: `convex/system.ts` mutations for screenshot storage

**New tools:**

```
browser_navigate(url)              → loads URL in headless Chrome inside sandbox
browser_screenshot(viewport?)      → returns base64 PNG; persisted to Convex
                                     storage; surfaced in chat
browser_click(selector)            → clicks element; returns nav state
browser_inspect(selector?)         → returns DOM snapshot (HTML) of selector
                                     or full page; truncated to 4KB tail
```

**Steps:**

- [ ] **4.2.1** Update Polaris's E2B sandbox template to include Playwright + Chromium. (One-off image build.)
- [ ] **4.2.2** Tool handlers: each browser_* tool generates a tiny Node script (`browser-{verb}.ts`), runs it via `sandbox.exec("node browser-{verb}.ts")`, parses the JSON response.
- [ ] **4.2.3** Screenshot persistence: write base64 to Convex `_storage` blob; `messages.toolCalls[].result` carries the storageId; chat UI renders via `<img src={url}>`.
- [ ] **4.2.4** UI: `<ScreenshotResult />` component below browser_screenshot tool calls.
- [ ] **4.2.5** Test: `tests/unit/tools/browser-tools.test.ts` mocks the sandbox exec; verifies the tool roundtrip.

## Task 4.3 — Evaluator uses browser tools

**Steps:**

- [ ] **4.3.1** Evaluator tool surface from Phase 3 expands to include the 4 browser tools.
- [ ] **4.3.2** Evaluator system prompt addition: "After verifying the build passes, use `browser_navigate` to load the relevant URL, `browser_screenshot` to capture the rendered output, and `browser_click` to walk through the user flow described in the acceptance criteria. Include screenshot evidence in your verdict."
- [ ] **4.3.3** Eval scenario: "Build a login page" → verify Evaluator actually screenshots and clicks the form.

**Commits (3):**
- `feat(sandbox): bake Playwright into Polaris E2B template (D-029)`
- `feat(agent): browser_* tools (navigate/screenshot/click/inspect)`
- `feat(eval): Evaluator uses browser tools for execution verification`

---

# Phase 5 — Repo as agent system-of-record (`AGENTS.md`)

**Why.** OpenAI: "Give Codex a map, not a 1,000-page instruction manual." `AGENTS.md` is ~100 lines, points to deeper sources of truth elsewhere.

Today our agent's system prompt is monolithic. Project-specific knowledge has nowhere to live.

## Task 5.1 — Per-project `AGENTS.md` injection

**Files:**
- Modify: `src/lib/agents/system-prompt.ts`
- Modify: `src/lib/agents/agent-runner.ts` (or sink) — inject AGENTS.md if present
- Modify: scaffold templates in `src/lib/scaffold/` to ship a starter AGENTS.md per template

**Steps:**

- [ ] **5.1.1** When agent loop starts, read `/AGENTS.md` from the user's project (via FileService). If present, prepend to the messages array as a system-style block.
- [ ] **5.1.2** Add to system prompt: "Always check /AGENTS.md first. It's the table of contents for this project. Follow its links to /docs/ for deeper context."
- [ ] **5.1.3** Update Next.js / Vite / Flask scaffold templates to drop a starter `AGENTS.md`:
  ```markdown
  # Project Map for AI Agents

  ## Architecture
  See /docs/ARCHITECTURE.md.

  ## Conventions
  - All API boundaries use Zod for input validation.
  - Components live in src/components; pages in src/app.
  - Tests adjacent to source: foo.ts → foo.test.ts.

  ## Locked paths
  /node_modules, .env, .git
  ```
- [ ] **5.1.4** Plan UI exposes "Edit AGENTS.md" — power users can curate.

## Task 5.2 — Progressive disclosure

**Files:**
- Modify: `src/lib/agents/system-prompt.ts`

**Steps:**

- [ ] **5.2.1** Slim the canonical system prompt. Move project-specific stuff (locked files, conventions) OUT of the system prompt and INTO `/AGENTS.md` per project.
- [ ] **5.2.2** System prompt becomes "How to be a Polaris agent" (~40 lines: tool semantics, error vocabulary, untrusted-input boundary). Project-specific stuff lives where the user/agent can edit it.
- [ ] **5.2.3** Test: same eval scenarios pass with the slimmer prompt.

**Commit:** `feat(agent): per-project AGENTS.md + progressive disclosure (D-030)`.

---

# Phase 6 — Mechanical enforcement with remediation injection

**Why.** OpenAI: "Custom linters... we write the error messages to inject remediation instructions into agent context."

Today our `EDIT_NOT_FOUND` / `PATH_LOCKED` errors do this for tools. We don't do it for *project linting*. The agent could ship a React app with circular imports and no rule fires.

## Task 6.1 — Per-template invariant lints

**Files:**
- Create: `src/lib/scaffold/lints/<template-id>/*.ts`
- Modify: `src/lib/agents/code-agent.ts` (after each `npm run build`-equivalent, also run lints)

**Steps:**

- [ ] **6.1.1** Create a `Lint` interface:
  ```ts
  interface Lint {
    id: string
    description: string
    appliesTo: (path: string) => boolean
    check: (file: FileRecord) => LintResult | null
  }
  interface LintResult { severity: "error" | "warning"; message: string; remediation: string }
  ```
- [ ] **6.1.2** Author 5 starter lints for the Next.js template:
  - `forbid-direct-fetch-in-page` (use API route)
  - `forbid-cross-domain-imports` (App Router boundaries)
  - `require-zod-at-api-boundaries`
  - `forbid-console-log` (use logger)
  - `enforce-praxiom-tokens` (no raw hex)
- [ ] **6.1.3** A `runLints({ projectId })` helper that returns aggregated `LintResult[]`.
- [ ] **6.1.4** New tool `run_lints` — agent can invoke; returns the array in remediation-friendly format. Auto-invoked after `run_command("npm run build")` if config flag set.

## Task 6.2 — Inject remediation into Generator's next turn

**Steps:**

- [ ] **6.2.1** When the Evaluator runs, it calls `run_lints` automatically before grading.
- [ ] **6.2.2** Lint failures → Evaluator verdict: `RETURN-FOR-FIX` with remediation injected verbatim.
- [ ] **6.2.3** Generator's next turn sees: "Linter `forbid-direct-fetch-in-page` flagged src/app/products/page.tsx. Remediation: move the fetch into a route handler at src/app/api/products/route.ts and call it from the page."

**Commit:** `feat(lints): per-template mechanical enforcement with remediation injection (D-031)`.

---

# Phase 7 — Multi-provider `Context` shape (pi-mono inspired)

**Why.** D-007 said strip the Vercel AI SDK and use raw `@anthropic-ai/sdk`. We did. But our `Message[]` is now Claude-baked. To add real GPTAdapter/GeminiAdapter, we need a shape that serializes losslessly across providers.

## Task 7.1 — Define `Context` shape

**Files:**
- Create: `src/lib/agents/context.ts`
- Modify: `src/lib/agents/types.ts`

**Steps:**

- [ ] **7.1.1** Define:
  ```ts
  interface Context {
    systemPrompt: string
    messages: ContextMessage[]
    tools: ToolDefinition[]
    cacheRetention?: "default" | "long"  // for Anthropic prompt caching
    sessionId?: string                    // for OpenAI / OpenRouter session caching
  }
  type ContextMessage =
    | { role: "user"; content: ContentBlock[] }
    | { role: "assistant"; content: ContentBlock[] }
    | { role: "toolResult"; toolCallId: string; content: ContentBlock[]; isError?: boolean }
  ```
- [ ] **7.1.2** `serializeContext(c): string` and `parseContext(s): Context` for cross-provider handoff. Already half-done by Convex's typed validators.

## Task 7.2 — ClaudeAdapter takes Context

**Steps:**

- [ ] **7.2.1** `ClaudeAdapter.run(ctx: Context, opts): AsyncGenerator<AgentStep>`. Internally maps Context → Anthropic SDK shape.
- [ ] **7.2.2** Existing tests must continue to pass.

## Task 7.3 — Real GPTAdapter + GeminiAdapter (replace stubs)

**Steps:**

- [ ] **7.3.1** GPTAdapter: maps Context → OpenAI Chat Completions API. Tool calling, streaming, prompt caching (`prompt_cache_key` header).
- [ ] **7.3.2** GeminiAdapter: maps Context → Google `@google/genai` SDK. Tool calling, streaming.
- [ ] **7.3.3** Adapter registry: `MODEL_KEYS` becomes a runtime selector based on `messages.modelKey`.
- [ ] **7.3.4** Tests: `tests/unit/agents/gpt-adapter.test.ts` and `gemini-adapter.test.ts` go from stub-tests to real-shape tests.

**Commit:** `refactor(agent): Context shape + real GPT/Gemini adapters (D-032)`.

---

# Phase 8 — Polish: steering, doc-gardener, throughput-mode

## Task 8.1 — Steering mid-run

**Files:**
- Modify: `src/lib/agents/agent-runner.ts`
- Modify: chat input in `src/features/conversations/components/conversation-sidebar.tsx`
- Modify: `src/lib/agents/sink.ts`

**Steps:**

- [ ] **8.1.1** New AgentSink method: `getPendingSteer(messageId): string | null`. Convex stores pending steers in a `steering_queue` table.
- [ ] **8.1.2** AgentRunner checks for pending steer between iterations. If present, injects as a user-style message, continues.
- [ ] **8.1.3** Chat input: while agent is streaming, user can type "Wait, also include X" and click `Steer` (separate button from `Send`). POSTs to `/api/messages/steer`.
- [ ] **8.1.4** Test: scripted scenario where steer arrives between iterations 2 and 3; verify agent picks it up.

## Task 8.2 — Doc-gardener cron

**Files:**
- Create: `src/inngest/cron/doc-gardener.ts`

**Steps:**

- [ ] **8.2.1** Inngest cron — runs every 24h per project (only for projects with activity in last 7d).
- [ ] **8.2.2** Loads `/AGENTS.md` and `/.polaris/notes.md`, plus a sampled set of project files. Asks Claude: "Are these docs still accurate vs the code? List drift items."
- [ ] **8.2.3** If drift > threshold, files a "Doc gardener" message in the user's chat: "Your AGENTS.md mentions X but I don't see X in the code anymore. Want me to update it?"
- [ ] **8.2.4** Tier-gated to Pro/Team (paid feature).

## Task 8.3 — Throughput mode (paid)

**Files:**
- New conversation mode: `auto-merge`

**Steps:**

- [ ] **8.3.1** Setting: "Auto-merge minor changes (no review prompt for renames, typo fixes, doc updates)."
- [ ] **8.3.2** When toggled, agent skips the "shall I apply this?" UX and just applies. User can revert from a per-change history.
- [ ] **8.3.3** Audit log table `auto_merge_log` per project for compliance.

## Task 8.4 — Tool surface consolidation (consider)

**Files:**
- Modify: `src/lib/agents/code-agent.ts` and `src/lib/tools/definitions.ts`

**Decision (D-033):** **Defer this.** Even though OpenAI shipped just `apply_patch + shell`, our 8-tool surface (now 9 with `set_feature_status`, 13 with browser_*) is justified by the explicit failure modes (PATH_LOCKED, EDIT_NOT_FOUND, BINARY_FILE) carrying remediation hints. Collapsing them would lose error-vocabulary precision. **Re-evaluate in 6 months when token costs and model capability change.** No code change in this phase.

**Commits:** `feat(agent): mid-run steering`, `feat(cron): doc-gardener`, `feat(ui): auto-merge mode`.

---

## Decision Log additions (proposed)

Each phase adds at least one D-NNN entry to `docs/CONSTITUTION.md`:

| ID | Subject |
|---|---|
| **D-023** | Prompt-cache system + last tool definition every call |
| **D-024** | Stream `thinking_*` events to chat as collapsible block |
| **D-025** | Tier-aware run budgets (free 5min, pro 30min, team 2hr) |
| **D-026** | Plan mode: Planner agent + plans-as-files + 9th tool `set_feature_status` |
| **D-027** | Auto-compaction at 100K with structured handoff + scratchpad memory |
| **D-028** | Multi-agent Evaluator gated by paid tier |
| **D-029** | Playwright in E2B template; 4 browser_* tools |
| **D-030** | Per-project AGENTS.md + progressive disclosure |
| **D-031** | Per-template lints inject remediation into agent context |
| **D-032** | Context shape replaces Message[]; real GPT/Gemini adapters |
| **D-033** | Tool surface NOT consolidated — failure-mode precision over count |

---

## What "100% world-class" looks like at the end

| Critical gap | Today | After plan |
|---|---|---|
| Plan mode | ❌ | ✅ Planner + plans-as-files + plan UI + sprint-scoped execution |
| Context compaction | ❌ Hard 150K wall | ✅ Auto-compact at 100K + structured handoff |
| Repo as agent record | ❌ | ✅ AGENTS.md per project + scratchpad notes.md |
| Browser/UI verification | ❌ | ✅ 4 browser_* tools + Evaluator drives them |
| Multi-agent eval | ❌ | ✅ Evaluator agent (paid tier) with grading rubric |
| Mechanical enforcement | ⚠️ tool-level only | ✅ Per-template lints with remediation injection |
| Multi-provider | ⚠️ Claude only | ✅ Context shape + real GPT/Gemini |
| Prompt caching | ❌ | ✅ system + tools cached every call |
| Thinking events | ❌ | ✅ Streamed to chat |
| Steering mid-run | ❌ | ✅ |
| Doc-gardener | ❌ | ✅ Daily cron (paid tier) |
| Throughput mode | ❌ | ✅ Auto-merge minor (opt-in) |
| Run budgets | ❌ One-size 5min | ✅ Tier-aware |

**What we keep that the articles don't have:**
- Per-project E2B sandbox lifecycle (D-018)
- Hard iteration / token / time caps (now tier-aware)
- Forbidden command regex + path lock policy
- Quota gates at 3 entry points + Stripe lifecycle
- Multi-tenancy (workspaces + members + roles)
- Browser-side WebContainer for instant preview

**The honest pitch after this plan ships:**
> Polaris is a hosted, spec-driven, multi-tenant AI coding-agent platform. The agent **plans its work as files in your repo, executes against the plan with execution-based verification, grades its own output through a separate Evaluator agent, and stays coherent through 2-hour build sessions via auto-compaction.** Plus the production stuff (Stripe, quotas, sandbox safety) every published harness paper assumes "someone else will build."

---

## Self-review checklist (run at end of every phase)

1. `pnpm tsc --noEmit` — zero errors
2. `pnpm lint` — zero new errors in modified files
3. `pnpm vitest run tests/unit tests/eval` — all green
4. `npx convex dev --once` — schema deploys cleanly
5. `git diff main` — no unrelated drift
6. CONSTITUTION decision log updated for the new D-NNN
7. README + ARCHITECTURE.md reference any new top-level concept

---

## What we explicitly are NOT building

(per user direction — browser-first SaaS):
- pi-mono CLI / TUI experience
- pi-mono `/tree` branching sessions (UX cost > value for browser web app)
- pi-mono extension package system (we have a fixed tool surface deliberately)
- OpenAI's per-worktree app boots (our per-project E2B sandbox is the equivalent)

---

## Effort estimate (calendar)

| Phase | Sessions | Hours | Cumulative wall (focused) |
|---|---|---|---|
| 0 — Foundation | 2 | 6–8 | Week 1, days 1–2 |
| 1 — Plan mode | 3 | 14–18 | Week 1, days 3–5 |
| 2 — Compaction | 2 | 8–10 | Week 2, days 1–2 |
| 3 — Eval | 2 | 10–12 | Week 2, days 3–4 |
| 4 — Browser tools | 3 | 12–14 | Week 2 day 5 + Week 3 day 1 |
| 5 — AGENTS.md | 1 | 4–6 | Week 3, day 2 (parallel with 6) |
| 6 — Lints | 2 | 8–10 | Week 3, day 3 (parallel with 5/7) |
| 7 — Context + adapters | 2 | 8–10 | Week 3, day 4 |
| 8 — Polish | 2 | 8–10 | Week 3, day 5 |

**Total: ~17 sessions / ~80 hours / 3 calendar weeks.**

Phases 5/6/7 can run in parallel after Phase 4 ships. Phases 0/1/2/3/4 are strict dependency chain.

---

## Open questions (flag before starting)

1. **Should the Planner write to `convex/specs` only, or also to `/docs/plan.md`?** Recommendation: BOTH. specs is the structured store the UI reads; plan.md is what the agent reads back into context. They sync via plan-format.ts round-trip.

2. **Should the Evaluator have write access to the user's project at all?** Recommendation: NO. Evaluator is read-only — it grades, returns issues. The Generator does all writes. This matches Anthropic's pattern + reduces blast-radius.

3. **What happens to free-tier users when Evaluator is paid?** Recommendation: free tier still ships features (no Evaluator), with a banner "Upgrade to Pro to enable agent grading + multi-sprint reviews."

4. **`MAX_DURATION_MS=2hr` for Team — does Inngest support that?** Inngest function steps can be hours; the wall-clock concern is `step.run` blocks. We serialize via `step.run("agent-iteration-N")` per iteration, which checkpoints. So 2hr total wall is fine.

5. **What if a Generator turn produces a plan-feature update *and* writes code?** Recommendation: allow both in the same turn. `set_feature_status` is just another tool call.

6. **Praxiom integration**: today the spec arrives via hero attachment. After this plan, the Planner becomes the canonical spec-author. **Praxiom continues to be the upstream input** to the Planner — Praxiom's exported document arrives as the user prompt, the Planner expands it into Polaris's structured plan format. No conflict.
