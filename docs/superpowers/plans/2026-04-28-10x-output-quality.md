# Polaris — 10x Output Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal.** Close the output-quality gap between Polaris and Lovable/Cursor/Claude Code by adding the feedback loops, context injection, search tools, multi-model routing, and real evals that the existing harness plan (`2026-04-27-harness-to-world-class.md`) did not cover.

**Architecture.** Build on the harness-to-world-class foundation (Plan mode, browser_*, Evaluator, AGENTS.md, compaction, prompt caching, tier budgets — assumed shipped). Add: a runtime-error capture channel from the preview iframe back to the agent, a typecheck/lint/build verification loop between turns, ripgrep + multi_edit tools, image input, auto-injected file context, a worked-pattern library, model routing across Opus/Sonnet/Haiku, task-classified iteration budgets, and an eval harness that actually boots the generated app.

**Tech stack.** Next.js 16, Convex, Clerk, Inngest, E2B sandbox, Anthropic SDK (`@anthropic-ai/sdk`), Vitest, Playwright. Adds: `ripgrep` (sandbox image), tree-sitter (Phase I, optional).

**Operating principle.** Phases are dependency-ordered. Phases A–C are highest-leverage and cheapest — start there. Phases D–H compound on top. Phases I–J are strategic v2 bets.

**Effort estimate.** ~14 sessions / ~70 hours / ~2.5 calendar weeks for Phases A–H. Phases I–J add ~2 weeks if pursued.

---

## What's already shipped (do NOT redo)

Per `2026-04-27-harness-to-world-class.md` (status: implemented):

- ✅ Prompt caching on system + tools (D-023)
- ✅ `thinking_*` events streamed to chat (D-024)
- ✅ Tier-aware run budgets (D-025: free 5min, pro 30min, team 2hr)
- ✅ Plan mode: Planner agent + plans-as-files + `set_feature_status` tool (D-026)
- ✅ Auto-compaction at 100K + scratchpad `/.polaris/notes.md` (D-027)
- ✅ Evaluator subagent with sprint-scoped grading (D-028)
- ✅ Browser tools (`browser_navigate`, `browser_screenshot`, `browser_click`, `browser_inspect`) in E2B (D-029)
- ✅ Per-project `AGENTS.md` + progressive disclosure (D-030)
- ✅ Per-template invariant lints with remediation injection (D-031)
- ✅ Multi-provider Context shape + GPT/Gemini adapters (D-032)
- ✅ Mid-run steering, doc-gardener cron, auto-merge mode

## What is still missing (this plan covers)

| # | Gap | Phase |
|---|---|---|
| 1 | Runtime error capture from preview iframe → agent | C |
| 2 | `tsc --noEmit` + `eslint` loop between agent turns | B |
| 3 | `next build` verification + auto-fix on completion claim | B |
| 4 | `search_code` (ripgrep) tool | A |
| 5 | `multi_edit` tool (atomic multi-region edits per file) | A |
| 6 | Image input (paste-screenshot) from user | D |
| 7 | Auto-inject "currently open file" + "recently edited files" | E |
| 8 | Worked-pattern library (`/.polaris/patterns/*.tsx`) | E |
| 9 | Multi-model routing (Opus 4.7 / Sonnet 4.6 / Haiku 4.5 by task) | F |
| 10 | Task-classified iteration budgets (trivial/standard/hard) | G |
| 11 | Eval harness that boots the app + drives Playwright + asserts | H |
| 12 | Tree-sitter symbol index (`find_references`, `find_definition`) | I (optional) |
| 13 | Auto-screenshot 500ms after each agent edit batch | J (optional) |

---

# Phase A — Search & Edit Tools

**Why first.** Cheapest wins. ripgrep eliminates 10–20 wasted `list_files`/`read_file` calls per non-trivial task. `multi_edit` cuts iteration count on multi-region refactors. Both are pure additions — no architectural change.

**Constitutional note.** This adds 2 tools; total goes from 13 → 15 (file-mut 5 + run_command + set_feature_status + 4 browser_* + read_file + list_files = 13 today). Requires Constitutional amendment Article §8 / D-034.

## Task A.1 — `search_code` (ripgrep) tool

**Files:**
- Create: `src/lib/tools/search-code.ts`
- Modify: `src/lib/tools/definitions.ts` (register)
- Modify: `src/lib/tools/executor.ts` (route)
- Modify: `src/lib/agents/system-prompt.ts` (mention preference)
- Modify: E2B template (add `ripgrep` binary; one-off image rebuild)
- Test: `tests/unit/tools/search-code.test.ts`

- [ ] **A.1.1 — Add ripgrep to E2B template.**
   Update the polaris E2B template Dockerfile to install `ripgrep`:
   ```dockerfile
   RUN apt-get update && apt-get install -y ripgrep && rm -rf /var/lib/apt/lists/*
   ```
   Rebuild + publish image. Update `SANDBOX_TEMPLATE_VERSION` constant in `src/lib/sandbox/e2b-provider.ts` so existing sandboxes are reprovisioned.

- [ ] **A.1.2 — Define the tool.**
   Append to `AGENT_TOOLS` in `src/lib/tools/definitions.ts`:
   ```ts
   {
     name: "search_code",
     description:
       "Search file contents in the project using ripgrep. Returns matching lines with file path, line number, and a short context snippet. Prefer this over list_files+read_file when looking for symbol usages, imports, or text patterns.",
     inputSchema: {
       type: "object",
       properties: {
         query: { type: "string", description: "Pattern to search for. Plain text by default; set regex=true for regex." },
         pathGlob: { type: "string", description: "Optional glob to scope: e.g. 'src/**/*.tsx'. Default: whole project." },
         regex: { type: "boolean", description: "Treat query as regex. Default false." },
         caseSensitive: { type: "boolean", description: "Case sensitivity. Default false." },
         maxResults: { type: "integer", description: "Cap on returned matches. Default 80." },
       },
       required: ["query"],
     },
   }
   ```

- [ ] **A.1.3 — Write the failing test.**
   `tests/unit/tools/search-code.test.ts`:
   ```ts
   import { describe, it, expect, vi } from "vitest"
   import { searchCode } from "@/lib/tools/search-code"

   describe("search_code", () => {
     it("returns matches with file/line/snippet", async () => {
       const fakeExec = vi.fn().mockResolvedValue({
         exitCode: 0,
         stdout: "src/app/page.tsx:12:export default function Page() {\nsrc/app/layout.tsx:3:import './globals.css'\n",
         stderr: "",
       })
       const result = await searchCode(
         { query: "import", pathGlob: "src/**/*.tsx", regex: false, caseSensitive: false, maxResults: 80 },
         { exec: fakeExec, projectRoot: "/workspace" },
       )
       expect(result.matches).toHaveLength(2)
       expect(result.matches[0]).toMatchObject({ path: "src/app/page.tsx", line: 12 })
       expect(fakeExec).toHaveBeenCalledWith(
         expect.stringContaining("rg --line-number --color=never"),
         expect.any(Object),
       )
     })

     it("escapes regex when regex=false", async () => {
       const fakeExec = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" })
       await searchCode(
         { query: "foo.bar(", regex: false },
         { exec: fakeExec, projectRoot: "/workspace" },
       )
       expect(fakeExec.mock.calls[0][0]).toContain("--fixed-strings")
     })

     it("returns empty matches on exitCode 1 (no matches)", async () => {
       const fakeExec = vi.fn().mockResolvedValue({ exitCode: 1, stdout: "", stderr: "" })
       const result = await searchCode({ query: "nope" }, { exec: fakeExec, projectRoot: "/workspace" })
       expect(result.matches).toEqual([])
     })
   })
   ```

- [ ] **A.1.4 — Run test, see it fail.**
   `pnpm vitest run tests/unit/tools/search-code.test.ts`
   Expected: FAIL — `searchCode` not found.

- [ ] **A.1.5 — Implement.**
   Create `src/lib/tools/search-code.ts`:
   ```ts
   export interface SearchCodeArgs {
     query: string
     pathGlob?: string
     regex?: boolean
     caseSensitive?: boolean
     maxResults?: number
   }

   export interface SearchCodeMatch {
     path: string
     line: number
     snippet: string
   }

   export interface SearchCodeResult {
     matches: SearchCodeMatch[]
     truncated: boolean
   }

   export async function searchCode(
     args: SearchCodeArgs,
     deps: { exec: (cmd: string, opts?: { cwd?: string }) => Promise<{ exitCode: number; stdout: string; stderr: string }>; projectRoot: string },
   ): Promise<SearchCodeResult> {
     const max = Math.min(args.maxResults ?? 80, 500)
     const flags = [
       "rg",
       "--line-number",
       "--color=never",
       "--no-heading",
       `--max-count=${max}`,
       args.regex ? "" : "--fixed-strings",
       args.caseSensitive ? "--case-sensitive" : "--ignore-case",
     ].filter(Boolean)
     if (args.pathGlob) flags.push(`--glob=${shellQuote(args.pathGlob)}`)
     const cmd = `${flags.join(" ")} -- ${shellQuote(args.query)}`
     const result = await deps.exec(cmd, { cwd: deps.projectRoot })
     // rg exit code 1 = no matches (not an error)
     if (result.exitCode !== 0 && result.exitCode !== 1) {
       throw new Error(`search_code failed: ${result.stderr}`)
     }
     const matches = result.stdout
       .split("\n")
       .filter(Boolean)
       .slice(0, max)
       .map(parseLine)
       .filter((m): m is SearchCodeMatch => m !== null)
     return { matches, truncated: matches.length === max }
   }

   function parseLine(line: string): SearchCodeMatch | null {
     const m = line.match(/^([^:]+):(\d+):(.*)$/)
     if (!m) return null
     return { path: m[1], line: Number(m[2]), snippet: m[3].slice(0, 200) }
   }

   function shellQuote(s: string): string {
     return `'${s.replace(/'/g, "'\\''")}'`
   }
   ```

- [ ] **A.1.6 — Run tests, verify green.**
   `pnpm vitest run tests/unit/tools/search-code.test.ts` → PASS.

- [ ] **A.1.7 — Wire into executor.**
   In `src/lib/tools/executor.ts`, route `name === "search_code"` to `searchCode(args, { exec: sandbox.exec, projectRoot: "/workspace" })`. Format result as text content block with one match per line: ``` `${m.path}:${m.line}: ${m.snippet}` ```.

- [ ] **A.1.8 — Update system prompt.**
   In `src/lib/agents/system-prompt.ts`, add a bullet under "Tool contract":
   ```
   - **Search before reading.** Before list_files+read_file, try search_code
     for symbols/imports/patterns. It's cheaper and points you at the lines
     you actually need.
   ```

- [ ] **A.1.9 — Commit.**
   ```bash
   git add src/lib/tools/search-code.ts src/lib/tools/definitions.ts src/lib/tools/executor.ts src/lib/agents/system-prompt.ts tests/unit/tools/search-code.test.ts
   git commit -m "feat(tools): search_code (ripgrep) — D-034"
   ```

## Task A.2 — `multi_edit` tool

**Files:**
- Create: `src/lib/tools/multi-edit.ts`
- Modify: `src/lib/tools/definitions.ts` (register)
- Modify: `src/lib/tools/executor.ts` (route)
- Modify: `src/lib/agents/system-prompt.ts` (cross-reference)
- Test: `tests/unit/tools/multi-edit.test.ts`

- [ ] **A.2.1 — Define the tool.**
   Append to `AGENT_TOOLS`:
   ```ts
   {
     name: "multi_edit",
     description:
       "Apply multiple find-and-replace edits to a single file atomically. All edits must succeed or none are applied. Use this when you need 2+ surgical changes to the same file — it's cheaper than multiple edit_file calls and avoids partial-state-between-edits hazards.",
     inputSchema: {
       type: "object",
       properties: {
         path: { type: "string" },
         edits: {
           type: "array",
           description: "Array of edits applied in order. Each edit's search must be unique in the file *after* the previous edits have been applied (or set replaceAll=true).",
           items: {
             type: "object",
             properties: {
               search: { type: "string" },
               replace: { type: "string" },
               replaceAll: { type: "boolean", description: "Default false." },
             },
             required: ["search", "replace"],
           },
         },
       },
       required: ["path", "edits"],
     },
   }
   ```

- [ ] **A.2.2 — Failing test.**
   `tests/unit/tools/multi-edit.test.ts`:
   ```ts
   import { describe, it, expect } from "vitest"
   import { multiEdit } from "@/lib/tools/multi-edit"

   const initial = `function Counter() { return <div>count</div> }\nexport default Counter\n`

   describe("multi_edit", () => {
     it("applies sequential edits atomically", () => {
       const result = multiEdit(initial, [
         { search: "Counter", replace: "Tally", replaceAll: true },
         { search: "<div>count</div>", replace: "<div>tally</div>" },
       ])
       expect(result.ok).toBe(true)
       expect(result.value).toContain("function Tally()")
       expect(result.value).toContain("<div>tally</div>")
       expect(result.value).toContain("export default Tally")
     })

     it("fails atomically — no partial application", () => {
       const result = multiEdit(initial, [
         { search: "Counter", replace: "Tally", replaceAll: true },
         { search: "DOES_NOT_EXIST", replace: "x" },
       ])
       expect(result.ok).toBe(false)
       expect(result.errorCode).toBe("EDIT_NOT_FOUND")
       // initial content unchanged
     })

     it("rejects non-unique search without replaceAll", () => {
       const result = multiEdit(initial, [
         { search: "Counter", replace: "Tally" },  // 2 occurrences
       ])
       expect(result.ok).toBe(false)
       expect(result.errorCode).toBe("EDIT_NOT_UNIQUE")
     })
   })
   ```

- [ ] **A.2.3 — Run, see fail.**
   `pnpm vitest run tests/unit/tools/multi-edit.test.ts` → FAIL.

- [ ] **A.2.4 — Implement.**
   Create `src/lib/tools/multi-edit.ts`:
   ```ts
   import type { ToolResult } from "./types"

   export interface MultiEditEdit { search: string; replace: string; replaceAll?: boolean }

   export function multiEdit(content: string, edits: MultiEditEdit[]): ToolResult<string> {
     let current = content
     for (let i = 0; i < edits.length; i++) {
       const e = edits[i]
       if (!current.includes(e.search)) {
         return { ok: false, error: `Edit ${i} search not found in file`, errorCode: "EDIT_NOT_FOUND" }
       }
       if (!e.replaceAll) {
         const first = current.indexOf(e.search)
         const second = current.indexOf(e.search, first + 1)
         if (second !== -1) {
           return { ok: false, error: `Edit ${i} search is not unique. Add context or set replaceAll=true.`, errorCode: "EDIT_NOT_UNIQUE" }
         }
         current = current.replace(e.search, e.replace)
       } else {
         current = current.split(e.search).join(e.replace)
       }
     }
     return { ok: true, value: current }
   }
   ```

- [ ] **A.2.5 — Run, verify green.**
   `pnpm vitest run tests/unit/tools/multi-edit.test.ts` → PASS.

- [ ] **A.2.6 — Wire into executor.**
   In `src/lib/tools/executor.ts`, on `name === "multi_edit"`: read the file, run `multiEdit`, on `ok` write back via the existing FileService write pipeline (Convex first, sandbox sync second — same as `edit_file`). On `!ok` return the error code through the standard tool-result envelope.

- [ ] **A.2.7 — Commit.**
   ```bash
   git add src/lib/tools/multi-edit.ts src/lib/tools/definitions.ts src/lib/tools/executor.ts tests/unit/tools/multi-edit.test.ts
   git commit -m "feat(tools): multi_edit — atomic multi-region edits"
   ```

**Phase A done when:** `pnpm tsc && pnpm vitest run tests/unit/tools` clean. Eval scenario `01-rename-identifier` (in `tests/eval/`) shows agent calling `multi_edit` once instead of `edit_file` twice.

---

# Phase B — Verification Loops (typecheck + lint + build)

**Why.** Today the agent edits → returns control. No `tsc`, no `eslint`, no `next build`. 60–80% of "looks done but doesn't compile" outputs come from this. This is what makes Claude Code feel reliable.

**Approach.** Two layers:
- **Between turns (cheap):** after each batch of write/edit/multi_edit/create/delete tools in a single turn, run `tsc --noEmit` + `eslint --quiet --no-error-on-unmatched-pattern` only on changed files. Append synthetic tool result if errors. Cap auto-fix iterations at 3.
- **On completion (full):** when agent emits its final assistant text without further tool calls, run `next build`. If it fails, run one more agent turn with the build error as context.

## Task B.1 — Detect "completed an edit batch" inside the runner

**Files:**
- Modify: `src/lib/agents/agent-runner.ts`
- Create: `src/lib/agents/verifier.ts`

- [ ] **B.1.1** Add to `AgentRunner` state: `pendingVerification: { changedPaths: Set<string>; autoFixCount: number }`.
- [ ] **B.1.2** After every tool execution loop iteration, identify which paths were mutated this iteration (write_file, edit_file, multi_edit, create_file, delete_file). Add to `pendingVerification.changedPaths`.
- [ ] **B.1.3** Trigger condition: model's stop_reason for the iteration was NOT `tool_use` (it returned text and stopped). At that moment, if `pendingVerification.changedPaths.size > 0` AND `autoFixCount < 3`, run verification. Otherwise clear and return control.
- [ ] **B.1.4** Verification = call `verifier.verify(changedPaths, sandbox)`. If `ok: true`, clear pending state and finalize. If `ok: false`, inject a synthetic user-style tool result, increment `autoFixCount`, continue the loop.
- [ ] **B.1.5** Test: `tests/unit/agents/verification-loop.test.ts` with scripted adapter — verify auto-fix triggers 1 then exits.

## Task B.2 — Implement `verifier.ts`

**Files:**
- Create: `src/lib/agents/verifier.ts`
- Test: `tests/unit/agents/verifier.test.ts`

- [ ] **B.2.1 — Failing test.**
   ```ts
   import { describe, it, expect, vi } from "vitest"
   import { verify } from "@/lib/agents/verifier"

   describe("verifier", () => {
     it("returns ok=true when tsc and eslint pass on changed paths", async () => {
       const exec = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" })
       const result = await verify(new Set(["src/app/page.tsx"]), { exec })
       expect(result.ok).toBe(true)
     })

     it("returns ok=false with formatted errors when tsc fails", async () => {
       const exec = vi.fn().mockImplementation((cmd: string) => {
         if (cmd.includes("tsc")) return { exitCode: 1, stdout: "src/app/page.tsx(12,5): error TS2345: Argument of type 'number' is not assignable to parameter of type 'string'.", stderr: "" }
         return { exitCode: 0, stdout: "", stderr: "" }
       })
       const result = await verify(new Set(["src/app/page.tsx"]), { exec })
       expect(result.ok).toBe(false)
       expect(result.errors).toContain("TS2345")
     })
   })
   ```

- [ ] **B.2.2 — Implement.**
   ```ts
   export interface VerifyResult {
     ok: boolean
     errors?: string  // formatted for agent injection
     stage?: "tsc" | "eslint"
   }

   export async function verify(
     changedPaths: Set<string>,
     deps: { exec: (cmd: string, opts?: { cwd?: string; timeoutMs?: number }) => Promise<{ exitCode: number; stdout: string; stderr: string }> },
   ): Promise<VerifyResult> {
     const tsRes = await deps.exec("npx tsc --noEmit --pretty false 2>&1 | head -100", { cwd: "/workspace", timeoutMs: 60_000 })
     if (tsRes.exitCode !== 0) {
       const relevant = filterToChanged(tsRes.stdout, changedPaths)
       if (relevant.length > 0) {
         return { ok: false, errors: relevant, stage: "tsc" }
       }
     }
     const paths = [...changedPaths].filter((p) => /\.(ts|tsx|js|jsx)$/.test(p)).map(quote).join(" ")
     if (paths.length === 0) return { ok: true }
     const lintRes = await deps.exec(`npx eslint --quiet --no-error-on-unmatched-pattern ${paths}`, { cwd: "/workspace", timeoutMs: 60_000 })
     if (lintRes.exitCode !== 0) {
       return { ok: false, errors: lintRes.stdout, stage: "eslint" }
     }
     return { ok: true }
   }

   function filterToChanged(tscOutput: string, changed: Set<string>): string {
     return tscOutput
       .split("\n")
       .filter((line) => [...changed].some((p) => line.startsWith(p)))
       .join("\n")
   }

   function quote(p: string) { return `'${p.replace(/'/g, "'\\''")}'` }
   ```

- [ ] **B.2.3** Run tests → green. Commit.

## Task B.3 — Inject verification results as a synthetic tool result

**Files:**
- Modify: `src/lib/agents/agent-runner.ts`

- [ ] **B.3.1** When verifier returns `!ok`, append to `state.messages`:
   ```ts
   {
     role: "user",
     content: [{
       type: "text",
       text: `Auto-verification (${result.stage}) found errors in your last edit batch. Fix them before reporting completion:\n\n${result.errors}\n\n(This is auto-fix attempt ${state.pendingVerification.autoFixCount + 1}/3.)`
     }]
   }
   ```
- [ ] **B.3.2** Increment `autoFixCount`. Continue the loop.
- [ ] **B.3.3** When `autoFixCount` hits 3, give up auto-fix; surface to user as: "Verification failed after 3 auto-fix attempts. Last errors:\n\n{errors}". Mark the message as `done` with status `error`.
- [ ] **B.3.4** Eval scenario: introduce an intentional type error in the spec; assert agent fixes it within 2 auto-fix turns.

## Task B.4 — Build verification on "completion claim"

**Files:**
- Modify: `src/lib/agents/agent-runner.ts`
- Modify: `src/lib/agents/verifier.ts` (add `verifyBuild`)

- [ ] **B.4.1** Heuristic for "completion claim": stop_reason `end_turn` AND `pendingVerification.changedPaths.size === 0` (no edits this iteration) AND `state.totalChangedPaths.size > 0` (edits earlier in run). The agent stopped after edits in a prior iteration without further changes — it's claiming done.
- [ ] **B.4.2** Run `npx next build` (timeout 5min) inside the sandbox.
- [ ] **B.4.3** On failure, inject:
   ```
   `npm run build` failed before completion. Output:
   {build output, last 80 lines}

   Fix the build, then verify with `run_command: npx next build`.
   ```
   Continue loop with `autoFixCount` reset to 0 (build verification gets its own budget of 2 attempts).
- [ ] **B.4.4** On success, append a one-line confirmation to assistant message: "✓ Build passed (`next build` succeeded).". Finalize.
- [ ] **B.4.5** Skip build verification when:
   - User's plan is free tier (token cost protection)
   - `autoFixCount >= 2` already
   - Conversation has explicit `skipBuildVerify` flag (settings)

## Task B.5 — Configuration switch

- [ ] **B.5.1** Add to project settings (`convex/projects.ts`): `verification: { typecheck: boolean; lint: boolean; build: boolean }` — default all true on Pro/Team, build=false on Free.
- [ ] **B.5.2** UI in Settings → Project: 3 toggles. Free tier sees build toggle disabled with "Upgrade to Pro" hint.
- [ ] **B.5.3** Constitutional D-035: "Verification loop is on by default; agent self-corrects up to 3 typecheck/lint iterations and 2 build iterations before surfacing failure to user."

**Phase B commits:**
- `feat(agent): verification loop (tsc + eslint between turns)`
- `feat(agent): build verification on completion claim`
- `feat(settings): per-project verification toggles (D-035)`

**Phase B done when:** Eval scenario "introduce-type-error-then-fix" passes — agent ships a typed mistake, verifier catches it, agent self-corrects in next turn, build passes.

---

# Phase C — Runtime Error Capture (the biggest single quality win)

**Why.** Today: the preview iframe is one-way. Agent ships code, user clicks button, button silently throws, agent never knows. This is *the* feature that makes Lovable feel like it "knows when it broke something."

**Approach.** Inject a tiny client script into the preview iframe (via Next.js layout or HTML rewrite) that captures `window.onerror`, unhandled promise rejections, console.error, `console.warn` (optional), failed `fetch`/`XMLHttpRequest`, and React error boundaries. Each event is POSTed to a Convex HTTP endpoint and persisted to a `runtimeErrors` table tied to `projectId` + `sandboxId`. The agent can query this table directly via a new `read_runtime_errors` tool, AND the runner auto-injects new errors as a synthetic tool result on the next turn.

## Task C.1 — Convex schema + ingest endpoint

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/runtimeErrors.ts`
- Create: `convex/http.ts` route `/runtime-error`

- [ ] **C.1.1** Add to `convex/schema.ts`:
   ```ts
   runtimeErrors: defineTable({
     projectId: v.id("projects"),
     sandboxId: v.optional(v.string()),
     kind: v.union(v.literal("error"), v.literal("unhandled_rejection"), v.literal("console_error"), v.literal("network_error"), v.literal("react_error_boundary")),
     message: v.string(),
     stack: v.optional(v.string()),
     url: v.optional(v.string()),
     componentStack: v.optional(v.string()),
     userAgent: v.optional(v.string()),
     timestamp: v.number(),
     consumed: v.boolean(), // true once agent has seen it
   })
     .index("by_project", ["projectId"])
     .index("by_project_unconsumed", ["projectId", "consumed"]),
   ```

- [ ] **C.1.2** `convex/runtimeErrors.ts`:
   ```ts
   export const ingest = mutation({ ... })  // called from HTTP route
   export const listUnconsumed = query({ args: { projectId } })
   export const markConsumed = internalMutation({ args: { ids: v.array(v.id("runtimeErrors")) } })
   export const clearForProject = mutation({ args: { projectId } })  // user-triggered
   ```

- [ ] **C.1.3** Convex HTTP route `/runtime-error` (POST):
   - Accepts `{ projectId, kind, message, stack?, url?, componentStack?, userAgent? }`
   - Validates with Zod
   - CORS: allow the sandbox preview origin (`*.e2b.dev` and `localhost:*`)
   - Calls `runtimeErrors.ingest`

- [ ] **C.1.4** Test: `tests/unit/convex/runtime-errors.test.ts` — ingest validates Zod, dedupes consecutive identical errors within 1s window.

## Task C.2 — Browser-side capture script

**Files:**
- Create: `public/polaris-runtime-tap.js` (served from Polaris Next app)
- Modify: scaffold templates' root layouts to inject `<script src="https://build.praxiomai.xyz/polaris-runtime-tap.js" data-project-id="..." async>`.
- Alternative cleaner path (preferred): inject via Next.js middleware in the user's generated app — but requires sandbox-side wiring. Start with the script-tag approach.

- [ ] **C.2.1** `public/polaris-runtime-tap.js`:
   ```js
   (function () {
     var POLARIS_INGEST = "https://build.praxiomai.xyz/api/runtime-error"; // points at Convex HTTP via Next API proxy
     var script = document.currentScript;
     var projectId = script && script.getAttribute("data-project-id");
     if (!projectId) return;

     function send(payload) {
       try {
         fetch(POLARIS_INGEST, {
           method: "POST",
           headers: { "content-type": "application/json" },
           body: JSON.stringify(Object.assign({ projectId: projectId, timestamp: Date.now(), userAgent: navigator.userAgent }, payload)),
           keepalive: true,
         }).catch(function () {});
       } catch (_) {}
     }

     window.addEventListener("error", function (e) {
       send({ kind: "error", message: String(e.message || ""), stack: e.error && e.error.stack, url: e.filename });
     });

     window.addEventListener("unhandledrejection", function (e) {
       send({ kind: "unhandled_rejection", message: String(e.reason && e.reason.message || e.reason || "Unhandled rejection"), stack: e.reason && e.reason.stack });
     });

     var origError = console.error;
     console.error = function () {
       try {
         var msg = Array.prototype.slice.call(arguments).map(function (a) { return typeof a === "string" ? a : safeStringify(a); }).join(" ");
         send({ kind: "console_error", message: msg });
       } catch (_) {}
       return origError.apply(console, arguments);
     };

     var origFetch = window.fetch;
     window.fetch = function () {
       return origFetch.apply(this, arguments).then(function (res) {
         if (!res.ok) send({ kind: "network_error", message: res.status + " " + res.statusText, url: arguments[0] && (arguments[0].url || arguments[0]) });
         return res;
       }).catch(function (err) {
         send({ kind: "network_error", message: String(err && err.message || err) });
         throw err;
       });
     };

     function safeStringify(x) { try { return JSON.stringify(x); } catch (_) { return String(x); } }
   })();
   ```

- [ ] **C.2.2** `src/app/api/runtime-error/route.ts` — Next.js proxy that validates origin and forwards to Convex `runtimeErrors.ingest`. (Avoids CORS hassles + lets us rate-limit at the Polaris edge.) Set `export const maxDuration = 10`.

- [ ] **C.2.3** Update Next.js scaffold template to include the script tag in `app/layout.tsx`:
   ```tsx
   {process.env.NEXT_PUBLIC_POLARIS_PROJECT_ID && (
     <script
       src="https://build.praxiomai.xyz/polaris-runtime-tap.js"
       data-project-id={process.env.NEXT_PUBLIC_POLARIS_PROJECT_ID}
       async
     />
   )}
   ```
   And inject `NEXT_PUBLIC_POLARIS_PROJECT_ID` into the sandbox env at provision time.

- [ ] **C.2.4** React error boundary helper: emit a `react_error_boundary` event from the scaffold's default `error.tsx` boundary using `window.dispatchEvent(new CustomEvent("polaris:react-error", { detail: { ... } }))` → listener in the tap script.

## Task C.3 — Agent tool: `read_runtime_errors`

**Files:**
- Modify: `src/lib/tools/definitions.ts`
- Create: `src/lib/tools/read-runtime-errors.ts`
- Modify: `src/lib/tools/executor.ts`

- [ ] **C.3.1** Tool spec:
   ```ts
   {
     name: "read_runtime_errors",
     description:
       "Read recent uncaught errors from the running preview app. Returns errors captured by window.onerror, unhandled promise rejections, console.error calls, failed fetches, and React error boundaries since the last call. Empty array means no runtime errors right now (which is what you want).",
     inputSchema: {
       type: "object",
       properties: {
         since: { type: "integer", description: "Optional unix-ms; only return errors after this time. Default: last 60s." },
         markConsumed: { type: "boolean", description: "Mark these errors as seen so subsequent calls don't re-return them. Default true." },
       },
       required: [],
     },
   }
   ```

- [ ] **C.3.2** Handler queries Convex `runtimeErrors.listUnconsumed`, formats as a structured text block:
   ```
   3 runtime errors since 18:42:01:

   [error] TypeError: Cannot read properties of undefined (reading 'name')
     at ProductCard (src/app/products/page.tsx:14:9)
   [console_error] Failed to load image http://...
   [network_error] 500 Internal Server Error  /api/checkout
   ```
   On `markConsumed: true`, calls `markConsumed` mutation.

## Task C.4 — Auto-inject runtime errors at turn start

**Files:**
- Modify: `src/lib/agents/agent-runner.ts`

- [ ] **C.4.1** At the start of every turn (after the user message is added but before the model call), query `runtimeErrors.listUnconsumed({ projectId, since: lastTurnTimestamp })`. If non-empty, append a synthetic user message:
   ```
   Before you continue: the preview app reported {N} runtime errors since the last turn. These may or may not be related to the current request — judge for yourself, but if they look caused by your last edits, fix them.

   {formatted errors}
   ```
   Then mark them consumed.

- [ ] **C.4.2** Add a state field `state.errorsConsumedThisRun: Id[]` so we can selectively undo `markConsumed` on agent failure (so the next run can see them).

## Task C.5 — UI: runtime error chip in chat

**Files:**
- Modify: `src/features/conversations/components/conversation.tsx`
- Create: `src/features/conversations/components/runtime-error-chip.tsx`

- [ ] **C.5.1** Live-query `runtimeErrors.listUnconsumed({ projectId })`. If count > 0, render small chip near chat input: "⚠ 3 preview errors — agent will see on next turn". Click → expand drawer with details + "Clear" button.

## Task C.6 — Dedupe + rate limit

- [ ] **C.6.1** In `runtimeErrors.ingest`: dedupe on `(projectId, kind, message, url)` within a 1-second sliding window — drop duplicates, increment a `count` field on the existing row.
- [ ] **C.6.2** Rate-limit per `projectId`: max 50 errors/minute. Beyond that, increment a counter row and surface "More than 50 errors in last minute — preview is in a bad state. Clear to resume capture."

**Phase C commits:**
- `feat(convex): runtimeErrors table + HTTP ingest`
- `feat(scaffold): inject runtime-tap script in templates`
- `feat(agent): read_runtime_errors tool + auto-inject at turn start (D-036)`
- `feat(ui): runtime-error chip in chat sidebar`

**Phase C done when:** Eval scenario "introduce-runtime-bug-in-button-click" — agent ships a button whose click handler throws; user clicks; on next turn agent sees the error and fixes it without being told.

---

# Phase D — Image Input from User

**Why.** Lovable's "screenshot to app" demo drives most of their conversions. Sonnet 4.6 supports vision; this is plumbing only.

## Task D.1 — Upload + persist

**Files:**
- Modify: `convex/schema.ts` (`messages.attachments`)
- Modify: `convex/system.ts` (`createMessage` accepts attachments)
- Modify: `src/app/api/messages/route.ts`
- Create: `src/app/api/uploads/route.ts` (signed-URL generation for Convex storage)

- [ ] **D.1.1** Schema add:
   ```ts
   messages: defineTable({
     ...
     attachments: v.optional(v.array(v.object({
       kind: v.union(v.literal("image")),
       storageId: v.id("_storage"),
       mimeType: v.string(),
       width: v.optional(v.number()),
       height: v.optional(v.number()),
     }))),
   })
   ```

- [ ] **D.1.2** Upload endpoint: returns Convex `_storage` upload URL. Client POSTs the image directly. Returns the `storageId`.

- [ ] **D.1.3** `/api/messages` accepts `attachments: [{ storageId, mimeType }]`. Validates: PNG/JPEG/WebP, ≤ 10MB, ≤ 5 images per message.

## Task D.2 — Pass images to Claude

**Files:**
- Modify: `src/lib/agents/claude-adapter.ts`
- Modify: `src/lib/agents/agent-runner.ts` (initial messages loader)

- [ ] **D.2.1** When loading initial messages from Convex, for each user message with `attachments`, build a multi-block content:
   ```ts
   {
     role: "user",
     content: [
       { type: "image", source: { type: "base64", media_type, data: base64 } },  // one per image
       { type: "text", text: userMessage.content },
     ],
   }
   ```
   Fetch image bytes via Convex `_storage.getUrl()` + fetch, base64-encode.

- [ ] **D.2.2** For prompt-cache compatibility: attachments are part of the *user message*, which is non-cacheable anyway. No cache_control issue.

## Task D.3 — UI: paste / drop / file input

**Files:**
- Modify: `src/features/conversations/components/composer.tsx`

- [ ] **D.3.1** Composer accepts: paste (Cmd+V on focused composer with image in clipboard), drag-and-drop, "+" button → file picker.
- [ ] **D.3.2** Show thumbnails above the textarea. Click thumbnail → remove. Hover → "Replace".
- [ ] **D.3.3** During upload: thumbnail shows progress ring; submit disabled until all uploads complete.
- [ ] **D.3.4** Support paste of remote image URLs (fetch server-side, store, attach).

## Task D.4 — Planner accepts images too

- [ ] **D.4.1** When the first message of a project has an image attachment, pass it to the Planner. System prompt addition: "If the user provided a screenshot or design reference, treat it as the visual target. Plan features that match the layout and styling shown."

**Phase D commits:**
- `feat(messages): image attachments — schema + upload + pass to Claude`
- `feat(ui): composer paste/drop/upload UI`
- `feat(planner): consume image attachment as visual target (D-037)`

**Phase D done when:** User pastes a Stripe dashboard screenshot + types "build this," planner produces a sprint that maps the image's UI elements to Praxiom components.

---

# Phase E — Auto-Injected Context

**Why.** Today the agent rediscovers project state every turn. Cursor's `@-mentions` and "currently open file" awareness is most of why it feels smart. Combined with the worked-pattern library, this is what gets outputs to look polished out of the gate.

## Task E.1 — Track "active route" in the IDE

**Files:**
- Modify: `convex/schema.ts` (`projects.activeRoute`)
- Modify: `src/features/editor/components/preview-panel.tsx` (write on path change)
- Modify: `src/features/editor/components/file-tree.tsx` (write on file open)

- [ ] **E.1.1** Schema:
   ```ts
   projects: defineTable({
     ...
     activeRoute: v.optional(v.string()),       // e.g. "/products/[id]"
     activeFiles: v.optional(v.array(v.string())), // last 5 files user opened in editor
     recentEdits: v.optional(v.array(v.object({   // last 10 agent-edited files
       path: v.string(), at: v.number(),
     }))),
   })
   ```

- [ ] **E.1.2** Preview panel: on path change, debounced 1s, mutate `projects.setActiveRoute({ projectId, route })`.
- [ ] **E.1.3** File tree: on file open in editor, push to `activeFiles` (cap 5, FIFO).
- [ ] **E.1.4** Tool executor: after every successful write/edit/multi_edit/create, push to `recentEdits` (cap 10).

## Task E.2 — Inject context at turn start

**Files:**
- Modify: `src/lib/agents/agent-runner.ts`

- [ ] **E.2.1** At turn start, build a "Live context" block:
   ```
   ## Live context

   User is currently viewing: /products/[id]  (file: src/app/products/[id]/page.tsx)
   Recently edited (newest first):
     - src/app/products/[id]/page.tsx (5s ago)
     - src/components/AddToCartButton.tsx (40s ago)
     - convex/cart.ts (1m ago)

   Currently open in editor:
     - src/app/products/[id]/page.tsx
     - src/components/AddToCartButton.tsx
   ```
- [ ] **E.2.2** For each path in `recentEdits` (capped at 5 most recent), inline the current content if file ≤ 200 lines; otherwise just the path + "Use read_file to view full content."
- [ ] **E.2.3** Append this block to the system prompt as a non-cached suffix (since it changes every turn — splitting the cache key away from the cached static system prompt).
- [ ] **E.2.4** Test: `tests/unit/agents/live-context.test.ts` — mock projects record, assert injection.

## Task E.3 — Worked-pattern library

**Files:**
- Create: `src/lib/scaffold/patterns/*.tsx` (10 reference patterns)
- Modify: scaffold step to copy patterns into `/.polaris/patterns/` in user project
- Modify: AGENTS.md template to reference patterns

- [ ] **E.3.1** Author 10 canonical patterns matching Praxiom Design System:
   1. `auth-form.tsx` — sign-in/up form with Clerk + error states
   2. `data-table.tsx` — sortable, paginated, with empty state and skeleton
   3. `dashboard-card-grid.tsx` — KPI cards with sparklines
   4. `settings-page.tsx` — section/group layout
   5. `empty-state.tsx` — illustration + CTA
   6. `modal.tsx` — Dialog with focus trap
   7. `toast.tsx` — usage of sonner with Praxiom tokens
   8. `loading-skeleton.tsx` — content-shaped skeletons
   9. `error-boundary.tsx` — with Sentry breadcrumb hook
   10. `data-fetch-page.tsx` — Convex `useQuery` with loading/empty/error states

   Each is a self-contained `.tsx` file with extensive comments at the top: "When to use," "Tokens used," "Variants."

- [ ] **E.3.2** Scaffold step: when a new project is created, copy `src/lib/scaffold/patterns/*.tsx` into the user's project at `/.polaris/patterns/*.tsx`.
- [ ] **E.3.3** AGENTS.md template:
   ```markdown
   ## UI patterns
   When you need to build any of: auth form, data table, dashboard cards,
   settings page, empty state, modal, toast, loading skeleton, error boundary,
   or a data-fetching page — first read /.polaris/patterns/<name>.tsx as the
   reference. Compose from those patterns; don't invent your own structure.
   ```
- [ ] **E.3.4** Eval scenario: "Build a settings page" — assert the agent reads `/.polaris/patterns/settings-page.tsx` before generating.

**Phase E commits:**
- `feat(projects): track activeRoute, activeFiles, recentEdits`
- `feat(agent): inject live context at turn start (D-038)`
- `feat(scaffold): worked-pattern library shipped to /.polaris/patterns (D-039)`

---

# Phase F — Multi-Model Routing

**Why.** Today every cognitive task uses Sonnet 4.6. Opus 4.7 is meaningfully better at planning + hard debugging; Haiku 4.5 is 4–5× cheaper for trivial single-line edits. Routing leaves both quality and cost on the table.

## Task F.1 — Task classifier

**Files:**
- Create: `src/lib/agents/task-classifier.ts`
- Test: `tests/unit/agents/task-classifier.test.ts`

- [ ] **F.1.1** Define classes:
   ```ts
   type TaskClass = "trivial" | "standard" | "hard"
   ```
   - **trivial:** typo fixes, rename a single identifier, update a string, delete a file, add a missing import. Heuristic: prompt < 80 chars + uses imperative + matches regex of common patterns.
   - **hard:** initial scaffold from prompt, multi-file feature, debugging non-trivial runtime errors, refactor across 3+ files. Heuristic: planner output present OR `> 5 changed files anticipated` OR keywords ("refactor," "build", "rewrite," "investigate").
   - **standard:** everything else.

- [ ] **F.1.2** First-cut implementation: regex/keyword classifier. Cheap, deterministic, runs in 1ms.
   ```ts
   export function classifyTask(input: { userPrompt: string; planSize: number; recentFileCount: number; isFirstTurn: boolean }): TaskClass {
     const p = input.userPrompt.toLowerCase()
     if (input.isFirstTurn || input.planSize > 5) return "hard"
     if (/refactor|rewrite|investigate|debug|architecture|design/.test(p)) return "hard"
     if (input.userPrompt.length < 80 && /^(rename|fix typo|change|update|remove|delete|add)\s/.test(p)) return "trivial"
     return "standard"
   }
   ```

- [ ] **F.1.3** Tests cover boundaries.

## Task F.2 — Model registry + adapter selection

**Files:**
- Modify: `src/lib/agents/registry.ts`
- Modify: `src/lib/agents/agent-runner.ts`

- [ ] **F.2.1** Update registry:
   ```ts
   export const TASK_MODELS = {
     planner:  { provider: "anthropic", model: "claude-opus-4-7"   },
     hard:     { provider: "anthropic", model: "claude-opus-4-7"   },
     standard: { provider: "anthropic", model: "claude-sonnet-4-6" },
     trivial:  { provider: "anthropic", model: "claude-haiku-4-5"  },
     evaluator:{ provider: "anthropic", model: "claude-opus-4-7"   },
     compactor:{ provider: "anthropic", model: "claude-haiku-4-5"  },
   }
   ```

- [ ] **F.2.2** `AgentRunner` calls `classifyTask(...)` once per *agent run* (not per turn — model switching mid-run breaks prompt cache). Plumbs the chosen model through to `ClaudeAdapter`.

- [ ] **F.2.3** Settings override: per-project setting "Force model: auto / sonnet / opus / haiku" for power users + cost control.

## Task F.3 — Cost & latency monitoring

**Files:**
- Modify: `convex/schema.ts` (`agentRuns.modelUsed`)
- Modify: `convex/admin.ts` (per-tier model-usage breakdown)

- [ ] **F.3.1** Persist `modelUsed` on each `agentRuns` row.
- [ ] **F.3.2** Admin dashboard: histogram of (taskClass × modelUsed × tokens × wall-time) over rolling 7d.
- [ ] **F.3.3** Cost alarm: if average `cost_per_run` exceeds tier-specific threshold (Pro: $0.50, Team: $1.50), Sentry alarm.

## Task F.4 — Tier gating

- [ ] **F.4.1** Free tier: locked to Sonnet (no Opus, no Haiku). Reasoning: trivial Haiku saves us tokens but small prompts on free tier rarely need Opus and we want to keep the experience uniform.
- [ ] **F.4.2** Pro: full routing.
- [ ] **F.4.3** Team: full routing + opt-in "Always Opus" for teams that prioritize quality.
- [ ] **F.4.4** Constitutional D-040: model routing per task class; Opus for planner+evaluator+hard; Haiku for trivial+compactor.

**Phase F commits:**
- `feat(agent): task-classifier + model routing (D-040)`
- `feat(admin): per-model cost dashboards`

**Phase F done when:** A "fix typo in homepage" prompt routes to Haiku and completes in <8s; a "build SilverNish ecommerce" prompt's planner uses Opus, executor uses Sonnet, evaluator uses Opus.

---

# Phase G — Task-Classified Iteration Budgets

**Why.** Today's tier-aware budgets (D-025) are run-level. A trivial typo gets the same 50-iteration budget as a multi-feature build. Cursor and Claude Code implicitly avoid this — their agents don't burn budget on small tasks or give up too early on big ones.

## Task G.1 — Budget by (tier × class)

**Files:**
- Modify: `src/lib/agents/budget.ts` (assumed created in harness Phase 0.3)

- [ ] **G.1.1** Function shape:
   ```ts
   export function runBudget(plan: Plan, taskClass: TaskClass) {
     const base = TIER_BUDGETS[plan]   // existing
     const mult = CLASS_MULTIPLIERS[taskClass]
     return {
       maxIterations: Math.round(base.maxIterations * mult.iter),
       maxTokens: Math.round(base.maxTokens * mult.tok),
       maxDurationMs: Math.round(base.maxDurationMs * mult.dur),
     }
   }

   const CLASS_MULTIPLIERS = {
     trivial:  { iter: 0.2, tok: 0.2, dur: 0.3 },
     standard: { iter: 1.0, tok: 1.0, dur: 1.0 },
     hard:     { iter: 1.6, tok: 1.6, dur: 1.5 },
   }
   ```

- [ ] **G.1.2** Plumb `taskClass` into `agent-loop.ts` → `agent-runner.ts`.

## Task G.2 — Soft-cap warnings before hard cap

- [ ] **G.2.1** When the runner reaches 80% of any budget axis (iter/tok/dur), emit a `warning` event to the chat: "Agent is approaching its budget limit (token: 80%). It may need to compact context soon." (Compaction from D-027 already triggers at 100K — this is just a UX heads-up.)
- [ ] **G.2.2** When at 100%, surface clearly: "Budget reached. Type 'continue' to extend (uses next tier's quota)."

## Task G.3 — User-visible budget bar

**Files:**
- Modify: `src/features/conversations/components/conversation.tsx`

- [ ] **G.3.1** Small unobtrusive progress bar above the composer showing iter/tok/dur of the *current run* with thresholds (yellow @ 80%, red @ 100%).
- [ ] **G.3.2** Tooltip: "Hard task — extended budget: 80 iterations, 480K tokens, 45 minutes."

**Phase G commits:**
- `feat(budget): task-classified multipliers (D-041)`
- `feat(ui): budget bar in chat`

---

# Phase H — Real Eval Harness

**Why.** Existing `tests/eval/quality-scenarios.test.ts` measures *process* (did agent use edit_file vs write_file). That tells you nothing about *output quality*. We need scenarios that boot the generated app, drive it with Playwright, and assert visual + behavioral correctness.

## Task H.1 — Eval scenario shape

**Files:**
- Create: `tests/eval/v2/types.ts`
- Create: `tests/eval/v2/runner.ts`

- [ ] **H.1.1** Scenario shape:
   ```ts
   export interface RealEvalScenario {
     id: string
     prompt: string
     attachments?: { kind: "image"; pngPath: string }[]
     budget: { maxIterations: number; maxTokens: number }
     postBuild: PlaywrightAssertion[]
   }

   export interface PlaywrightAssertion {
     id: string
     description: string
     run: (page: import("playwright").Page) => Promise<void>
     // Convention: throws on failure
   }
   ```

- [ ] **H.1.2** Runner: provisions a fresh E2B sandbox + new Convex project; sends the prompt through the real `/api/messages` flow; waits for assistant message `done`; runs `npm run build` + `npm run start` (or `next dev`); opens the preview URL in Playwright; runs all `postBuild` assertions; produces a JSON report with pass/fail + screenshots + transcripts.

## Task H.2 — Author 8 real scenarios

- [ ] **H.2.1** `01-static-marketing-page` — "Build a hero + features marketing page for a fictional silver jewelry brand, dark theme."
   - postBuild: page renders ≥ 3 sections; no `console.error`; Lighthouse-style accessibility >= 85; responsive at 375/768/1280.

- [ ] **H.2.2** `02-auth-flow` — "Add sign-up and sign-in with email + password using Clerk; redirect to /dashboard."
   - postBuild: navigate to /sign-up; fill email + password; submit; assert redirect to /dashboard. (Mock Clerk dev creds.)

- [ ] **H.2.3** `03-product-list-with-add-to-cart` — "Build a /products page that lists 6 products from a mock data file, each with an Add to Cart button. Cart count appears in header."
   - postBuild: visit /products; click first Add-to-Cart; header cart count = 1; click again; count = 2.

- [ ] **H.2.4** `04-form-validation` — "Add a contact form with name, email, message. Validate email format and require all fields. Show error states inline."
   - postBuild: submit empty form → 3 error messages; type invalid email → email error remains; type valid → submit → success state.

- [ ] **H.2.5** `05-dark-light-toggle` — "Add a dark/light mode toggle in the header. Persist preference in localStorage."
   - postBuild: toggle → assert `<html>` has `class="dark"` or `class="light"`; reload → preference persists.

- [ ] **H.2.6** `06-fix-runtime-bug` — start with a scaffold that has a known runtime bug (button onClick reads undefined). Prompt: "The Add-to-Cart button doesn't work. Fix it."
   - postBuild: click Add-to-Cart → no console errors; cart count increments.

- [ ] **H.2.7** `07-image-to-ui` — provide screenshot of a Stripe-style invoice; prompt "Build this layout." (Vision input.)
   - postBuild: page contains an invoice header, line items table, total row, and a "Pay" button. Looser visual diff.

- [ ] **H.2.8** `08-fullstack-todo` — "Build a todo app with Convex: add, toggle, delete; persist across reloads."
   - postBuild: add 3 todos; toggle one; delete one; reload; assert state persisted.

## Task H.3 — Visual diff baseline

- [ ] **H.3.1** First successful run captures `eval-baselines/{scenarioId}/{viewport}.png` per assertion.
- [ ] **H.3.2** Subsequent runs diff via `pixelmatch`. Fail if > 5% pixel delta on critical screenshots (configurable per assertion).
- [ ] **H.3.3** Baselines reviewed manually + committed.

## Task H.4 — CI integration

**Files:**
- Create: `.github/workflows/eval-real.yml`

- [ ] **H.4.1** Workflow runs on `main` push and nightly.
- [ ] **H.4.2** Costs ~$3-8/run × 8 scenarios × 2 (nightly + on-push) = $50-100/day. Tier-gate: full eval on nightly; only scenarios touched by changed files on per-PR.
- [ ] **H.4.3** Reports: post Slack summary "Eval: 7/8 passed. Regression in `06-fix-runtime-bug`: agent didn't read runtime error."

## Task H.5 — Decommission process-only evals

- [ ] **H.5.1** Keep `tests/eval/quality-scenarios.test.ts` for fast pre-commit signal (sub-second, mock LLM).
- [ ] **H.5.2** New scenarios in `tests/eval/v2/` are the source of truth for *quality*.
- [ ] **H.5.3** Document in `QUALITY-REPORT.md`: "v1 measures process; v2 measures output. Both are required for release."

**Phase H commits:**
- `test(eval): real eval harness — boot + Playwright + assertions`
- `test(eval): 8 real-world scenarios with visual baselines`
- `ci(eval): nightly + per-PR eval workflow`

**Phase H done when:** `pnpm test:eval:real` runs all 8 scenarios end-to-end against the real Anthropic API, produces a report, and serves as the quality gate for any agent-loop change.

---

# Phase I — Tree-sitter Symbol Index (optional, v2)

**Why.** Without it, "rename Foo across the project" is brittle text-search. With it, the agent can confidently do project-wide refactors. Defer until A–H are stable.

**Approach.** A small Rust/Node service in the sandbox that maintains a tree-sitter index of TS/TSX/JS/JSX. Two new tools: `find_references(symbol)`, `find_definition(symbol)`.

## Task I.1 — Index daemon in sandbox

- [ ] **I.1.1** Add `polaris-index` binary to E2B template (could use `tree-sitter` Node bindings + a tiny Express server).
- [ ] **I.1.2** Daemon watches `/workspace` for changes via `fsnotify`; rebuilds incremental index.
- [ ] **I.1.3** Exposes HTTP API on `127.0.0.1:7711`: `GET /references?symbol=Foo`, `GET /definition?symbol=Foo`.

## Task I.2 — Tools

- [ ] **I.2.1** `find_references(symbol, kind?)` — returns all read/write usages of a symbol.
- [ ] **I.2.2** `find_definition(symbol)` — returns the declaration site.
- [ ] **I.2.3** Constitutional D-042.

## Task I.3 — Eval scenario

- [ ] **I.3.1** "Rename `Counter` to `Tally` everywhere, including JSDoc references and string literals where it's used as a route." Assert: agent uses `find_references` first, then targeted edits, no false-positive renames in unrelated strings.

---

# Phase J — Auto-Screenshot on Render (optional, v2)

**Why.** With browser tools landed, the agent CAN screenshot. But it has to remember to. Auto-screenshotting after each substantive edit batch and dropping the screenshot into the next-turn context lifts visual quality without prompting changes.

## Task J.1 — Sandbox-side hook

- [ ] **J.1.1** When the agent's verification loop (Phase B) confirms the build is clean, automatically run `browser_navigate(activeRoute)` + `browser_screenshot(viewport=desktop)` + capture mobile (`viewport=375x667`).
- [ ] **J.1.2** Store both PNGs in Convex `_storage`. Persist `messages.autoScreenshots: [{ storageId, viewport, takenAt }]`.

## Task J.2 — Inject into next turn

- [ ] **J.2.1** At next turn start, after Live Context block, append:
   ```
   ## Visual state after your last edits

   [image: desktop screenshot of /products/[id]]
   [image: mobile screenshot of /products/[id]]

   Compare to the user's intent. If anything looks broken, mention it.
   ```
- [ ] **J.2.2** Cap at 2 most recent screenshots to keep context bounded.

## Task J.3 — Settings & cost control

- [ ] **J.3.1** Disabled on free tier (extra Anthropic vision tokens cost real money).
- [ ] **J.3.2** Pro/Team toggle: "Auto visual feedback (default ON)."
- [ ] **J.3.3** Constitutional D-043.

---

## Decision Log additions (proposed)

| ID | Subject |
|---|---|
| **D-034** | Tools: `search_code` (ripgrep) + `multi_edit` added — 15 tools total |
| **D-035** | Verification loop: tsc + eslint between turns; build on completion claim; auto-fix budget |
| **D-036** | Runtime error capture from preview iframe → `runtimeErrors` table → `read_runtime_errors` tool + auto-inject |
| **D-037** | Image attachments on user messages; planner consumes as visual target |
| **D-038** | Auto-injected live context (activeRoute + activeFiles + recentEdits) |
| **D-039** | Worked-pattern library at `/.polaris/patterns/*.tsx` |
| **D-040** | Multi-model routing (Opus planner+evaluator+hard, Sonnet standard, Haiku trivial+compactor) |
| **D-041** | Task-classified iteration budget multipliers |
| **D-042** | Tree-sitter symbol index + `find_references`/`find_definition` tools (v2) |
| **D-043** | Auto-screenshot on render injected into next-turn context (v2) |

---

## Recommended execution sequence

| Week | Phases | Notes |
|---|---|---|
| 1 | A (search_code + multi_edit) → B (verification loop) | Highest ROI; both unblock honest quality measurement |
| 2 | C (runtime errors) | Single biggest quality lift; depends on B's auto-inject pattern |
| 3 | D (image input) + E (live context + patterns) | E.3 (patterns) compounds with everything before |
| 4 | F (model routing) + G (task budgets) + H (eval harness) | F + G are paired; H is what proves the rest worked |

Phases I and J are explicitly deferred to v2; revisit after the eval harness shows where the residual quality gap is.

---

## What we are explicitly NOT building in this plan

- IDE-grade refactor UI (rename across files via UI, not agent prompt)
- Multi-cursor editing
- Real-time collaboration (post-fundraise)
- Agent-mode "always-on" background editor (different product surface)
- Voice input
- Custom user-uploaded patterns (v3)

---

## Self-review checklist (run at end of every phase)

1. `pnpm tsc --noEmit` — zero errors
2. `pnpm lint` — zero new errors in modified files
3. `pnpm vitest run tests/unit tests/eval` — all green
4. `npx convex dev --once` — schema deploys cleanly
5. `pnpm test:eval:real` — Phase H scenarios pass at the same rate as before, *or better* (regressions block merge)
6. `git diff main` — no unrelated drift
7. CONSTITUTION.md decision log updated for the new D-NNN
8. README + ARCHITECTURE.md reference any new top-level concept

---

## Open questions to flag before starting

1. **Should `search_code` cache results between calls?** Recommendation: NO. ripgrep is fast enough that caching adds bug surface for marginal gain.
2. **Should runtime error injection happen even when there are no edits this turn?** Recommendation: YES if errors are < 60s old (the user might be reporting a bug they just hit). NO if older (likely stale).
3. **Should `multi_edit` allow line-range edits in addition to search/replace?** Recommendation: NO for v1; matches Claude Code's MultiEdit semantics. Revisit if eval shows it matters.
4. **Image attachments — Convex storage cost?** ~10MB × 5 images × thousands of users = manageable. Add a 30-day TTL on `_storage` blobs for messages older than 30d.
5. **Model routing — what about future Anthropic releases?** Update `TASK_MODELS` map only. The classifier is provider-agnostic.
6. **Eval cost ceiling?** Cap at $200/day on the eval account; alarm at $150. Most scenarios should be < $1 each.
7. **Does Phase J's auto-screenshot conflict with the Evaluator's manual screenshot?** No: Evaluator runs *after* sprints; auto-screenshot runs *between* turns. Different scopes.

---

## What "10x output quality" looks like at the end

| Quality dimension | Today (post-harness plan) | After this plan |
|---|---|---|
| Agent finds existing code | list_files + read_file | `search_code` (ripgrep) — 5–10× faster lookup |
| Multi-region edits | N round-trips | 1 `multi_edit` call |
| Compile errors after edit | shipped to user | self-corrected in 1–3 auto-fix iterations |
| Build failures after "done" | shipped to user | self-corrected before user sees it |
| Runtime errors in preview | invisible to agent | injected at next turn start |
| Visual reference from user | ❌ | image paste / drop / upload |
| Awareness of "what user is looking at" | ❌ | activeRoute + activeFiles + recentEdits injected |
| UI polish out of the gate | derived per-prompt | composes from `/.polaris/patterns/*.tsx` |
| Model used for planning | Sonnet 4.6 | Opus 4.7 |
| Model used for trivial fixes | Sonnet 4.6 | Haiku 4.5 (4–5× cheaper) |
| Iteration budget | one-size-per-tier | scaled to task class |
| Quality measurement | tool-sequence asserts | boot + Playwright + visual + behavioral |

The honest pitch after this ships: **"Polaris's agent sees what the user sees, can search like an engineer, edits in batches, never ships code that doesn't compile, never claims done on a broken build, knows when its last edit broke something at runtime, accepts a screenshot as a brief, and routes hard cognitive work to Opus while leaving typo fixes to Haiku."** That is the gap-closer to Lovable/Cursor/Claude-Code.
