# Sub-Plan 03 — Scaffolding

> **Authority:** Derives from `docs/CONSTITUTION.md` (esp. Articles I, II, V, IX, X, XIV) and `docs/ROADMAP.md` Phase 1 (Days 2-3).
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the prompt-to-running-app pipeline. A user types a sentence, hits enter, and within 60 seconds (P50, per Article XIV §14.1) sees a running Next.js 15 + Supabase application in the preview iframe. Concretely: `POST /api/scaffold { prompt }` returns a `projectId`. Behind that endpoint, we (a) call Claude with a structured-output schema asking for a JSON file tree of new feature files, (b) merge those files with a deterministic Next.js + Supabase base template, (c) validate every path through `FilePermissionPolicy` (with a documented scaffold-only exception for the locked baseline files), (d) bulk-write everything to Convex via `files_by_path:writePath`, (e) fire a `sandbox/create` Inngest event so sub-plan 02 can boot E2B in the background, and (f) stream progress messages to the conversation panel via Convex live subscriptions while it runs.

**Architecture:** `POST /api/scaffold` (Next.js Route Handler) → auth + quota gate → `convex.mutation("projects:create")` → insert "scaffolding" assistant message → `promptToScaffold(prompt)` (single-shot Claude JSON call via `claudeComplete`) → `mergeTemplate(generated, NEXTJS_SUPABASE_TEMPLATE)` → policy-validate → `convex.mutation("files_by_path:writeMany")` (batched) → `inngest.send("sandbox/create", { projectId })` → return `{ projectId }`. The conversation panel's existing live subscription to `messages` renders each progress delta the moment it lands.

**Tech Stack:** `@anthropic-ai/sdk` via `claudeComplete` from sub-plan 01, `zod` for schema validation, `inngest` for sandbox-create event, Convex mutations from sub-plan 01 (`files_by_path:writePath` plus a new `writeMany`), Vitest for unit tests.

**Phase:** 1 — Functional Core (Days 2-3 of 17-day plan).

**Constitution articles you must re-read before starting:**
- Article I §1.1 (Mission) — prompt-to-app under 90s is the headline feature.
- Article II §2.1 (Apps must be real) — every scaffolded file is a real, runnable file. No placeholders.
- Article II §2.3 (Speed of iteration) — streaming progress matters more than feature breadth here.
- Article II §2.5 (Agent is visible) — every step of scaffolding shows up as a visible message.
- Article V §5.4 (Generated app stack) — Next.js 15, React 19, Tailwind 4, shadcn/ui, Supabase. Deliberate skew from the IDE itself (Next.js 16).
- Article IX (File Safety Policy) — locked / readOnly / writable lists. We special-case scaffold writes for the locked baseline files.
- Article X §10.2 (Write path) — Convex first; sandbox catches up via the boot event we fire at the end.
- Article XIV §14.1 (P50 < 60s prompt-to-preview) — this sub-plan owns ~30-50s of that budget.

**Dependencies on other sub-plans:**
- **Sub-plan 01** (must be merged first): `claudeComplete` helper in `src/lib/ai/claude-direct.ts`, `FilePermissionPolicy`, `convex/files_by_path.ts` (`writePath`, `createPath`, `listAll`), `convex/projects.ts` `create` mutation. We extend `files_by_path` with a `writeMany` mutation (Task 4).
- **Sub-plan 02** (parallel): `sandbox/create` Inngest event handler — we *fire* the event, sub-plan 02 *consumes* it. The event contract is locked here in Task 8.

---

## Table of Contents

- [File Structure](#file-structure)
- [Task 1: Scaffold Types and Zod Schema](#task-1-scaffold-types-and-zod-schema)
- [Task 2: Scaffold System Prompt](#task-2-scaffold-system-prompt)
- [Task 3: prompt-to-scaffold (Claude Call)](#task-3-prompt-to-scaffold-claude-call)
- [Task 4: Convex writeMany Mutation](#task-4-convex-writemany-mutation)
- [Task 5: Base Template Files](#task-5-base-template-files)
- [Task 6: Merge Logic](#task-6-merge-logic)
- [Task 7: Scaffold Path Validation](#task-7-scaffold-path-validation)
- [Task 8: Sandbox Create Inngest Event Contract](#task-8-sandbox-create-inngest-event-contract)
- [Task 9: Streaming Progress Helper](#task-9-streaming-progress-helper)
- [Task 10: Quota Gate](#task-10-quota-gate)
- [Task 11: API Route POST /api/scaffold](#task-11-api-route-post-apiscaffold)
- [Task 12: End-to-End Test with Mocked Claude](#task-12-end-to-end-test-with-mocked-claude)
- [Task 13: Manual Smoke Test](#task-13-manual-smoke-test)
- [Task 14: Cleanup and Documentation](#task-14-cleanup-and-documentation)
- [Deferred to Later Sub-Plans](#deferred-to-later-sub-plans)
- [Self-Review](#self-review)

---

## File Structure

### Files to create

```
src/features/scaffold/types.ts                                ← NEW: ScaffoldRequest/Response, GeneratedFile, ScaffoldSchema (zod)
src/features/scaffold/lib/scaffold-system-prompt.ts           ← NEW: Claude system prompt for scaffolding
src/features/scaffold/lib/prompt-to-scaffold.ts               ← NEW: orchestrates the Claude call + parse + validate
src/features/scaffold/lib/nextjs-supabase-template.ts         ← NEW: deterministic base template (~30 files)
src/features/scaffold/lib/merge-template.ts                   ← NEW: merges Claude output with template
src/features/scaffold/lib/scaffold-policy.ts                  ← NEW: thin wrapper around FilePermissionPolicy with scaffold-only exception
src/features/scaffold/lib/scaffold-progress.ts                ← NEW: progress message append helpers
src/features/scaffold/lib/scaffold-quota.ts                   ← NEW: minimal quota gate (full impl in sub-plan 08)
src/app/api/scaffold/route.ts                                 ← NEW: POST handler

tests/unit/scaffold/scaffold-schema.test.ts                   ← NEW
tests/unit/scaffold/prompt-to-scaffold.test.ts                ← NEW
tests/unit/scaffold/merge-template.test.ts                    ← NEW
tests/unit/scaffold/scaffold-policy.test.ts                   ← NEW
tests/unit/scaffold/end-to-end.test.ts                        ← NEW: full route handler with mocked Claude
tests/fixtures/scaffold/todo-app.json                         ← NEW: recorded fixture (valid Claude response)
tests/fixtures/scaffold/oversized.json                        ← NEW: fixture exceeding size cap
tests/fixtures/scaffold/policy-violation.json                 ← NEW: fixture writing into node_modules/
```

### Files to modify

```
convex/files_by_path.ts                                       ← Add `writeMany` mutation
convex/schema.ts                                              ← Extend messages.kind to include "scaffolding" (if not already present)
src/inngest/events.ts                                         ← Add typed sandbox/create event payload (or create the file if absent)
package.json                                                  ← Add `zod` if not already a dep
```

---

## Task 1: Scaffold Types and Zod Schema

**Why first:** Every other file in this sub-plan imports from this file. Locking the contract now means we can write tests against it before any logic exists.

**Files:**
- Create: `src/features/scaffold/types.ts`
- Create: `tests/unit/scaffold/scaffold-schema.test.ts`

**Constitution touchpoints:** Article IV §4.1 (TDD for scaffolding); Article IV §4.6 (no placeholders).

- [ ] **Step 1.1: Install zod if missing**

```bash
npm ls zod || npm install zod
```

- [ ] **Step 1.2: Write the test first (TDD)**

```typescript
// tests/unit/scaffold/scaffold-schema.test.ts
import { describe, it, expect } from "vitest"
import { ScaffoldSchema, MAX_GENERATED_FILES, MAX_FILE_SIZE_BYTES } from "@/features/scaffold/types"

describe("ScaffoldSchema", () => {
  it("accepts a minimal valid response", () => {
    const result = ScaffoldSchema.safeParse({
      summary: "A todo list app with Supabase auth.",
      files: [
        { path: "src/app/page.tsx", content: "export default function Page() { return <div /> }" },
      ],
    })
    expect(result.success).toBe(true)
  })

  it("rejects empty file array", () => {
    const result = ScaffoldSchema.safeParse({ summary: "x", files: [] })
    expect(result.success).toBe(false)
  })

  it("rejects more than MAX_GENERATED_FILES", () => {
    const files = Array.from({ length: MAX_GENERATED_FILES + 1 }, (_, i) => ({
      path: `src/app/p${i}.tsx`,
      content: "x",
    }))
    const result = ScaffoldSchema.safeParse({ summary: "x", files })
    expect(result.success).toBe(false)
  })

  it("rejects file content exceeding MAX_FILE_SIZE_BYTES", () => {
    const result = ScaffoldSchema.safeParse({
      summary: "x",
      files: [{ path: "src/app/big.tsx", content: "x".repeat(MAX_FILE_SIZE_BYTES + 1) }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects absolute paths", () => {
    const result = ScaffoldSchema.safeParse({
      summary: "x",
      files: [{ path: "/etc/passwd", content: "x" }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects parent traversal", () => {
    const result = ScaffoldSchema.safeParse({
      summary: "x",
      files: [{ path: "src/../../escape.ts", content: "x" }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects empty path", () => {
    const result = ScaffoldSchema.safeParse({
      summary: "x",
      files: [{ path: "", content: "x" }],
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 1.3: Run failing test**

```bash
npm run test:unit -- scaffold-schema
```

Expected: FAIL (file does not exist).

- [ ] **Step 1.4: Implement the types module**

```typescript
// src/features/scaffold/types.ts
import { z } from "zod"

export const MAX_GENERATED_FILES = 60          // Hard cap on Claude's response file count
export const MAX_FILE_SIZE_BYTES = 60_000      // 60KB per file (one screen of code is ~3KB; this is generous)
export const MAX_TOTAL_BYTES = 800_000         // ~800KB across all generated files
export const SCAFFOLD_TIMEOUT_MS = 90_000      // Total budget for the Claude call (Article XIV §14.1)

const PATH_PATTERN = /^[a-zA-Z0-9._/-]+$/

const FilePathSchema = z
  .string()
  .min(1, "path must not be empty")
  .max(200, "path too long")
  .refine(p => !p.startsWith("/"), { message: "path must be relative (no leading slash)" })
  .refine(p => !p.includes(".."), { message: "path must not contain parent traversal (..)" })
  .refine(p => PATH_PATTERN.test(p), { message: "path contains invalid characters" })
  .refine(p => !p.endsWith("/"), { message: "path must be a file, not a directory" })

export const GeneratedFileSchema = z.object({
  path: FilePathSchema,
  content: z.string().max(MAX_FILE_SIZE_BYTES, `file content exceeds ${MAX_FILE_SIZE_BYTES} bytes`),
})

export const ScaffoldSchema = z.object({
  summary: z.string().min(1).max(500),
  files: z
    .array(GeneratedFileSchema)
    .min(1, "must generate at least one file")
    .max(MAX_GENERATED_FILES, `must not generate more than ${MAX_GENERATED_FILES} files`)
    .refine(
      arr => arr.reduce((sum, f) => sum + f.content.length, 0) <= MAX_TOTAL_BYTES,
      { message: `total content exceeds ${MAX_TOTAL_BYTES} bytes` },
    )
    .refine(
      arr => new Set(arr.map(f => f.path)).size === arr.length,
      { message: "duplicate file paths are not allowed" },
    ),
})

export type GeneratedFile = z.infer<typeof GeneratedFileSchema>
export type ScaffoldResponse = z.infer<typeof ScaffoldSchema>

export interface ScaffoldRequest {
  prompt: string
  userId: string
}

export interface ScaffoldOutcome {
  projectId: string
  fileCount: number
  totalBytes: number
  durationMs: number
}

export type ScaffoldErrorCode =
  | "INVALID_PROMPT"
  | "QUOTA_EXCEEDED"
  | "CLAUDE_PARSE_ERROR"
  | "CLAUDE_SCHEMA_VIOLATION"
  | "CLAUDE_OVERSIZED"
  | "CLAUDE_TIMEOUT"
  | "POLICY_VIOLATION"
  | "CONVEX_WRITE_FAILED"
  | "INTERNAL_ERROR"

export interface ScaffoldError {
  code: ScaffoldErrorCode
  message: string
  // Diagnostic detail; never sent to client raw, but logged.
  detail?: unknown
}
```

- [ ] **Step 1.5: Re-run tests**

```bash
npm run test:unit -- scaffold-schema
```

Expected: PASS (7/7).

- [ ] **Step 1.6: Commit**

```bash
git add src/features/scaffold/types.ts tests/unit/scaffold/scaffold-schema.test.ts
git commit -m "feat(scaffold): add types and zod schema for prompt-to-app pipeline"
```

---

## Task 2: Scaffold System Prompt

**Why now:** The system prompt is content, not logic. We can write it once and freeze it. Subsequent tasks reference `SCAFFOLD_SYSTEM_PROMPT`.

**Files:**
- Create: `src/features/scaffold/lib/scaffold-system-prompt.ts`

**Constitution touchpoints:** Article V §5.4 (the locked stack the prompt must enforce); Article IX (locked file paths the prompt must steer Claude away from).

- [ ] **Step 2.1: Write the prompt**

```typescript
// src/features/scaffold/lib/scaffold-system-prompt.ts
//
// This prompt is single-shot (not agentic). The model emits one JSON object that
// validates against ScaffoldSchema (see src/features/scaffold/types.ts). The base
// template (nextjs-supabase-template.ts) provides every locked file (package.json,
// tsconfig, next.config, etc.) — Claude must NOT regenerate those. Claude writes
// only the feature-specific files inside writable directories (Article IX §9.1).

export const SCAFFOLD_SYSTEM_PROMPT = `You are Polaris's scaffolding engine. Given a single user prompt describing an app, you produce the *minimal feature-specific file tree* needed to make that app real on top of a pre-existing Next.js 15 + Supabase base template.

# Output format (mandatory)

You return ONLY a single JSON object with this exact shape — no prose, no markdown fences:

{
  "summary": "<one sentence describing what the app does>",
  "files": [
    { "path": "<relative posix path>", "content": "<full file contents>" },
    ...
  ]
}

# Stack (locked — do not deviate)

- Next.js 15 with the App Router (NOT Pages Router; NOT Next.js 16).
- React 19 (use Server Components by default; "use client" only where state/effects/event handlers are needed).
- TypeScript strict mode.
- Tailwind CSS 4 (utility classes only; no CSS modules, no styled-components).
- shadcn/ui patterns (already installed in base template: Button, Card, Input). You may compose these. You MAY add new shadcn components by creating files at src/components/ui/<name>.tsx that follow the same primitive-based pattern with Radix UI imports. Do not invent your own design system.
- Supabase for auth, database, and storage. The base template already provides:
    - src/lib/supabase/client.ts        (browser client)
    - src/lib/supabase/server.ts        (server client with cookie wiring)
    - src/middleware.ts                  (session refresh)
- Database tables: emit a SQL migration at supabase/migrations/<timestamp>_<feature>.sql whenever the app needs persistence. Use plain SQL; do not invent ORMs.

# Files you MUST NOT generate (provided by base template)

The following paths are owned by the base template. If you emit them, your response will be silently overridden — emitting them wastes tokens:

- package.json
- package-lock.json
- tsconfig.json
- next.config.ts
- tailwind.config.ts
- postcss.config.mjs
- .gitignore
- .env.example
- src/middleware.ts
- src/lib/utils.ts
- src/lib/supabase/client.ts
- src/lib/supabase/server.ts
- src/components/ui/button.tsx
- src/components/ui/card.tsx
- src/components/ui/input.tsx
- src/app/globals.css
- src/app/layout.tsx
- README.md

You MAY override src/app/page.tsx — the base template ships a placeholder you should replace with the real landing page for the app.

# Files you MUST write inside one of these directories

- src/app/**             (routes, layouts, pages, server actions, route handlers)
- src/components/**      (React components — including new shadcn primitives in src/components/ui/)
- src/lib/**             (utilities, hooks, server-only helpers)
- supabase/migrations/** (SQL migrations only)
- public/**              (static assets — use sparingly; prefer inline SVG)

Any path outside these directories will be rejected.

# Dependencies

You CANNOT add npm packages. The base template ships a fixed dependency set:
- next, react, react-dom
- @supabase/supabase-js, @supabase/ssr
- tailwindcss, @tailwindcss/postcss, postcss, autoprefixer
- @radix-ui/react-slot, class-variance-authority, clsx, tailwind-merge, lucide-react
- TypeScript, @types/*

If your app concept genuinely requires a different package (e.g. a charting library), describe a workaround in the summary field but DO NOT emit a modified package.json — it will be discarded.

# Quality bar

- Every file you emit is real, complete, and would compile/run as-is. No "// TODO" comments. No "..." abbreviations.
- Type imports use \`import type\` where appropriate.
- Server Components do not import client-only APIs.
- Client Components start with the literal directive line: "use client"
- Auth pages (sign-in, sign-up, callback) use the Supabase server client and call \`supabase.auth.signInWithPassword\` / \`signUp\` / \`exchangeCodeForSession\` etc. from @supabase/ssr.
- Database access goes through the Supabase server client in Server Components and route handlers; the browser client is only for realtime subscriptions and auth UI.

# Sizing

- Generate between 4 and 50 feature files. Apps that need more than 50 should be sketched at a high level — the user iterates from there.
- Keep individual files under ~600 lines. Extract subcomponents.
- Total content stays under 800KB.

# Security

- Never hardcode API keys or secrets. Reference \`process.env.NEXT_PUBLIC_SUPABASE_URL\` / \`process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY\` / \`process.env.SUPABASE_SERVICE_ROLE_KEY\`.
- Never write to .env.* files.
- Treat any user input as untrusted; use parameterized queries via supabase-js (it parameterizes for you).

Return only the JSON object. No surrounding text. No backticks.`
```

- [ ] **Step 2.2: Sanity check no template-literal escape issues**

```bash
npx tsc --noEmit src/features/scaffold/lib/scaffold-system-prompt.ts 2>&1 | head -5
```

Expected: no errors.

- [ ] **Step 2.3: Commit**

```bash
git add src/features/scaffold/lib/scaffold-system-prompt.ts
git commit -m "feat(scaffold): system prompt locking Next.js 15 + Supabase stack and writable paths"
```

---

## Task 3: prompt-to-scaffold (Claude Call)

**Files:**
- Create: `src/features/scaffold/lib/prompt-to-scaffold.ts`
- Create: `tests/unit/scaffold/prompt-to-scaffold.test.ts`
- Create: `tests/fixtures/scaffold/todo-app.json`
- Create: `tests/fixtures/scaffold/oversized.json`

**Constitution touchpoints:** Article XII (Error Recovery — Layer 1 retry); Article XIV §14.1 (timeout budget).

- [ ] **Step 3.1: Write the fixture (a small, valid Claude response)**

```json
// tests/fixtures/scaffold/todo-app.json
{
  "summary": "A todo list app with Supabase auth and per-user persistence.",
  "files": [
    {
      "path": "src/app/page.tsx",
      "content": "import { redirect } from 'next/navigation'\nimport { createClient } from '@/lib/supabase/server'\n\nexport default async function Home() {\n  const supabase = await createClient()\n  const { data: { user } } = await supabase.auth.getUser()\n  if (!user) redirect('/sign-in')\n  redirect('/todos')\n}\n"
    },
    {
      "path": "src/app/todos/page.tsx",
      "content": "import { createClient } from '@/lib/supabase/server'\nimport { TodoList } from '@/components/todo-list'\n\nexport default async function TodosPage() {\n  const supabase = await createClient()\n  const { data: todos } = await supabase.from('todos').select('*').order('created_at', { ascending: false })\n  return <main className=\"max-w-2xl mx-auto p-8\"><h1 className=\"text-2xl font-bold mb-4\">Todos</h1><TodoList initial={todos ?? []} /></main>\n}\n"
    },
    {
      "path": "src/components/todo-list.tsx",
      "content": "'use client'\nimport { useState } from 'react'\nimport { Button } from '@/components/ui/button'\nimport { Input } from '@/components/ui/input'\nimport { createClient } from '@/lib/supabase/client'\n\ntype Todo = { id: string; title: string; done: boolean }\n\nexport function TodoList({ initial }: { initial: Todo[] }) {\n  const [todos, setTodos] = useState<Todo[]>(initial)\n  const [title, setTitle] = useState('')\n  const supabase = createClient()\n  async function add() {\n    if (!title) return\n    const { data } = await supabase.from('todos').insert({ title }).select().single()\n    if (data) setTodos([data, ...todos])\n    setTitle('')\n  }\n  return <div className=\"space-y-2\"><div className=\"flex gap-2\"><Input value={title} onChange={e => setTitle(e.target.value)} placeholder=\"What needs doing?\" /><Button onClick={add}>Add</Button></div><ul className=\"space-y-1\">{todos.map(t => <li key={t.id} className=\"p-2 border rounded\">{t.title}</li>)}</ul></div>\n}\n"
    },
    {
      "path": "supabase/migrations/20260426000000_todos.sql",
      "content": "create table public.todos (\n  id uuid primary key default gen_random_uuid(),\n  user_id uuid not null references auth.users(id) on delete cascade,\n  title text not null,\n  done boolean not null default false,\n  created_at timestamptz not null default now()\n);\nalter table public.todos enable row level security;\ncreate policy \"users see own todos\" on public.todos for select using (auth.uid() = user_id);\ncreate policy \"users insert own todos\" on public.todos for insert with check (auth.uid() = user_id);\ncreate policy \"users update own todos\" on public.todos for update using (auth.uid() = user_id);\ncreate policy \"users delete own todos\" on public.todos for delete using (auth.uid() = user_id);\n"
    }
  ]
}
```

- [ ] **Step 3.2: Write the oversized fixture**

```json
// tests/fixtures/scaffold/oversized.json — 80 files, will fail MAX_GENERATED_FILES
{
  "summary": "Too many files",
  "files": [
    /* generator note: programmatically expand to 80 entries in the test file itself
       to keep the fixture small. Just leave this stub. */
  ]
}
```

The test will rebuild this in-memory rather than ship 80KB of fixture noise.

- [ ] **Step 3.3: Write the failing test**

```typescript
// tests/unit/scaffold/prompt-to-scaffold.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import todoFixture from "../../fixtures/scaffold/todo-app.json"
import { promptToScaffold } from "@/features/scaffold/lib/prompt-to-scaffold"

vi.mock("@/lib/ai/claude-direct", () => ({
  claudeComplete: vi.fn(),
}))

import { claudeComplete } from "@/lib/ai/claude-direct"

describe("promptToScaffold", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns parsed files on a valid Claude response", async () => {
    vi.mocked(claudeComplete).mockResolvedValue(JSON.stringify(todoFixture))
    const result = await promptToScaffold({ prompt: "todo app", userId: "u1" })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.files).toHaveLength(4)
      expect(result.value.files[0].path).toBe("src/app/page.tsx")
    }
  })

  it("strips ``` fences if Claude wraps JSON in markdown", async () => {
    vi.mocked(claudeComplete).mockResolvedValue("```json\n" + JSON.stringify(todoFixture) + "\n```")
    const result = await promptToScaffold({ prompt: "todo app", userId: "u1" })
    expect(result.ok).toBe(true)
  })

  it("returns CLAUDE_PARSE_ERROR on invalid JSON", async () => {
    vi.mocked(claudeComplete).mockResolvedValue("this is not JSON")
    const result = await promptToScaffold({ prompt: "x", userId: "u1" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("CLAUDE_PARSE_ERROR")
  })

  it("returns CLAUDE_SCHEMA_VIOLATION when files array is empty", async () => {
    vi.mocked(claudeComplete).mockResolvedValue(JSON.stringify({ summary: "x", files: [] }))
    const result = await promptToScaffold({ prompt: "x", userId: "u1" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("CLAUDE_SCHEMA_VIOLATION")
  })

  it("returns CLAUDE_OVERSIZED when total bytes exceed cap", async () => {
    const huge = {
      summary: "x",
      files: Array.from({ length: 20 }, (_, i) => ({
        path: `src/app/p${i}.tsx`,
        content: "x".repeat(50_000),
      })),
    }
    vi.mocked(claudeComplete).mockResolvedValue(JSON.stringify(huge))
    const result = await promptToScaffold({ prompt: "x", userId: "u1" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(["CLAUDE_OVERSIZED", "CLAUDE_SCHEMA_VIOLATION"]).toContain(result.error.code)
  })

  it("retries once on transient Claude failure (Layer 1)", async () => {
    vi.mocked(claudeComplete)
      .mockRejectedValueOnce(new Error("network blip"))
      .mockResolvedValueOnce(JSON.stringify(todoFixture))
    const result = await promptToScaffold({ prompt: "x", userId: "u1" })
    expect(result.ok).toBe(true)
    expect(claudeComplete).toHaveBeenCalledTimes(2)
  })

  it("rejects empty/whitespace prompts with INVALID_PROMPT", async () => {
    const result = await promptToScaffold({ prompt: "   ", userId: "u1" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("INVALID_PROMPT")
    expect(claudeComplete).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3.4: Run failing tests**

```bash
npm run test:unit -- prompt-to-scaffold
```

Expected: FAIL.

- [ ] **Step 3.5: Implement**

```typescript
// src/features/scaffold/lib/prompt-to-scaffold.ts
import { claudeComplete } from "@/lib/ai/claude-direct"
import { SCAFFOLD_SYSTEM_PROMPT } from "./scaffold-system-prompt"
import {
  ScaffoldSchema,
  type ScaffoldRequest,
  type ScaffoldResponse,
  type ScaffoldError,
  MAX_TOTAL_BYTES,
  SCAFFOLD_TIMEOUT_MS,
} from "../types"

const MAX_PROMPT_LEN = 4000
const MIN_PROMPT_LEN = 3

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

function stripCodeFences(s: string): string {
  let trimmed = s.trim()
  if (trimmed.startsWith("```")) {
    // Remove leading ```json or ``` and trailing ```
    trimmed = trimmed.replace(/^```[a-zA-Z]*\n?/, "").replace(/```\s*$/, "").trim()
  }
  return trimmed
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms),
    ),
  ])
}

export async function promptToScaffold(
  req: ScaffoldRequest,
): Promise<Result<ScaffoldResponse, ScaffoldError>> {
  const trimmed = req.prompt.trim()
  if (trimmed.length < MIN_PROMPT_LEN || trimmed.length > MAX_PROMPT_LEN) {
    return {
      ok: false,
      error: {
        code: "INVALID_PROMPT",
        message: `Prompt must be between ${MIN_PROMPT_LEN} and ${MAX_PROMPT_LEN} characters.`,
      },
    }
  }

  // Layer 1 retry (Article XII §12.1): one retry on transient failure.
  let lastErr: unknown
  let raw: string | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      raw = await withTimeout(
        claudeComplete({
          systemPrompt: SCAFFOLD_SYSTEM_PROMPT,
          userPrompt: trimmed,
          maxTokens: 16_000,
          temperature: 0.3,
        }),
        SCAFFOLD_TIMEOUT_MS,
        "claude-scaffold",
      )
      break
    } catch (err) {
      lastErr = err
      if (attempt === 0) {
        // brief backoff before retry
        await new Promise(r => setTimeout(r, 500))
        continue
      }
    }
  }

  if (raw === null) {
    const isTimeout = lastErr instanceof Error && lastErr.message.includes("timeout")
    return {
      ok: false,
      error: {
        code: isTimeout ? "CLAUDE_TIMEOUT" : "INTERNAL_ERROR",
        message: isTimeout
          ? "Scaffold generation timed out. Try a shorter prompt."
          : "Could not reach the model service.",
        detail: lastErr,
      },
    }
  }

  // Cheap byte-length guard before parse — catches Claude returning a 5MB
  // hallucinated string before zod chokes on it.
  if (raw.length > MAX_TOTAL_BYTES * 1.5) {
    return {
      ok: false,
      error: { code: "CLAUDE_OVERSIZED", message: "Model returned an oversized response." },
    }
  }

  const stripped = stripCodeFences(raw)
  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "CLAUDE_PARSE_ERROR",
        message: "Model did not return valid JSON.",
        detail: { error: err, preview: stripped.slice(0, 200) },
      },
    }
  }

  const result = ScaffoldSchema.safeParse(parsed)
  if (!result.success) {
    // Distinguish "too big" violations from generic schema violations for better UX.
    const issues = result.error.issues
    const oversized = issues.some(i => i.message.includes("exceeds") || i.message.includes("more than"))
    return {
      ok: false,
      error: {
        code: oversized ? "CLAUDE_OVERSIZED" : "CLAUDE_SCHEMA_VIOLATION",
        message: oversized
          ? "Model returned more files or content than allowed."
          : "Model output did not match the required schema.",
        detail: { issues: issues.slice(0, 5) },
      },
    }
  }

  return { ok: true, value: result.data }
}
```

- [ ] **Step 3.6: Re-run tests**

```bash
npm run test:unit -- prompt-to-scaffold
```

Expected: PASS (7/7).

- [ ] **Step 3.7: Commit**

```bash
git add src/features/scaffold/lib/prompt-to-scaffold.ts tests/unit/scaffold/prompt-to-scaffold.test.ts tests/fixtures/scaffold/todo-app.json tests/fixtures/scaffold/oversized.json
git commit -m "feat(scaffold): prompt-to-scaffold with retry, schema enforcement, fence stripping"
```

---

## Task 4: Convex writeMany Mutation

**Why:** Sub-plan 01 ships `writePath` (single file). Scaffolding writes 30-60 files at once. A single batched mutation is one round-trip; 60 individual mutations would be ~3-5s of overhead and could violate Article XIV's 60s P50 budget.

**Files:**
- Modify: `convex/files_by_path.ts` (add `writeMany`)

**Constitution touchpoints:** Article X §10.2 (Convex first); Article XIV §14.1.

- [ ] **Step 4.1: Add the mutation**

Append to `convex/files_by_path.ts`:

```typescript
// convex/files_by_path.ts (additions)

export const writeMany = mutation({
  args: {
    projectId: v.id("projects"),
    files: v.array(v.object({
      path: v.string(),
      content: v.string(),
    })),
    updatedBy: v.optional(v.union(
      v.literal("user"),
      v.literal("agent"),
      v.literal("import"),
      v.literal("scaffold"),
    )),
  },
  handler: async (ctx, args) => {
    const updatedBy = args.updatedBy ?? "scaffold"
    const now = Date.now()
    let inserted = 0
    let updated = 0

    // Single pass: for each input, find existing by composite index and either patch or insert.
    for (const f of args.files) {
      const existing = await ctx.db
        .query("files")
        .withIndex("by_project_path", q => q.eq("projectId", args.projectId).eq("path", f.path))
        .first()

      if (existing) {
        await ctx.db.patch(existing._id, {
          content: f.content,
          updatedAt: now,
          updatedBy,
        })
        updated++
      } else {
        await ctx.db.insert("files", {
          projectId: args.projectId,
          path: f.path,
          content: f.content,
          type: "file" as const,
          updatedAt: now,
          updatedBy,
          name: f.path.split("/").pop() ?? f.path,
        })
        inserted++
      }
    }

    return { inserted, updated, total: args.files.length }
  },
})
```

- [ ] **Step 4.2: Deploy and smoke test**

```bash
npx convex dev --once
```

Expected: deploys without schema errors. The new function appears in the dashboard under `files_by_path:writeMany`.

- [ ] **Step 4.3: Commit**

```bash
git add convex/files_by_path.ts
git commit -m "feat(convex): writeMany mutation for batched scaffold writes"
```

---

## Task 5: Base Template Files

**Why:** Every scaffolded app starts identical at the structural level. Locking these files in a deterministic constant means (a) Claude doesn't waste tokens regenerating boilerplate, (b) the app is guaranteed to boot regardless of what Claude generates, (c) we own the dependency surface (Article IX — package.json is locked once written).

**Files:**
- Create: `src/features/scaffold/lib/nextjs-supabase-template.ts`

**Constitution touchpoints:** Article V §5.4 (Next.js 15, React 19, Tailwind 4, shadcn/ui, Supabase). Article II §2.1 (apps must be real — every file below is real, not a stub).

- [ ] **Step 5.1: Create the template module**

```typescript
// src/features/scaffold/lib/nextjs-supabase-template.ts
//
// Deterministic base template for every scaffolded Polaris app. These files are
// written FIRST during scaffolding; Claude's output is then merged on top
// (see merge-template.ts). Files marked `locked: true` are protected by
// FilePermissionPolicy after scaffold completes — agents cannot modify them
// (Article IX §9.1). The scaffold itself bypasses the policy via the documented
// scaffold-only exception (see scaffold-policy.ts).

import type { GeneratedFile } from "../types"

export interface BaseFile extends GeneratedFile {
  locked: boolean  // After scaffold, will FilePermissionPolicy reject agent writes?
}

const PACKAGE_JSON = `{
  "name": "polaris-app",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "@supabase/ssr": "^0.5.2",
    "@supabase/supabase-js": "^2.45.4",
    "@radix-ui/react-slot": "^1.1.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "lucide-react": "^0.460.0",
    "next": "15.0.3",
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "tailwind-merge": "^2.5.4"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.0.0-beta.1",
    "@types/node": "^22.9.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.20",
    "eslint": "^9",
    "eslint-config-next": "15.0.3",
    "postcss": "^8.4.49",
    "tailwindcss": "^4.0.0-beta.1",
    "typescript": "^5.6.3"
  }
}
`

const TSCONFIG_JSON = `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
`

const NEXT_CONFIG_TS = `import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  experimental: { typedRoutes: true },
}

export default nextConfig
`

const TAILWIND_CONFIG_TS = `import type { Config } from "tailwindcss"

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
} satisfies Config
`

const POSTCSS_CONFIG_MJS = `export default {
  plugins: { "@tailwindcss/postcss": {} },
}
`

const GITIGNORE = `node_modules
.next
out
dist
.env
.env.local
.env*.local
.DS_Store
*.tsbuildinfo
next-env.d.ts
.vercel
`

const ENV_EXAMPLE = `# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
`

const GLOBALS_CSS = `@import "tailwindcss";

:root {
  --background: 0 0% 100%;
  --foreground: 222.2 47.4% 11.2%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --border: 214.3 31.8% 91.4%;
  --ring: 215 20.2% 65.1%;
  --radius: 0.5rem;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: 222.2 47.4% 11.2%;
    --foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --border: 217.2 32.6% 17.5%;
    --ring: 217.2 32.6% 17.5%;
  }
}

body {
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
}
`

const LAYOUT_TSX = `import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Polaris App",
  description: "Built with Polaris.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
`

const PLACEHOLDER_PAGE_TSX = `export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="text-center space-y-4 max-w-lg">
        <h1 className="text-4xl font-bold">Welcome to your Polaris app</h1>
        <p className="text-muted-foreground">
          This is a placeholder. Polaris is generating your app — it will replace this page in a moment.
        </p>
      </div>
    </main>
  )
}
`

const UTILS_TS = `import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
`

const BUTTON_TSX = `import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:opacity-90",
        outline: "border border-input bg-background hover:bg-muted",
        ghost: "hover:bg-muted",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  },
)
Button.displayName = "Button"
`

const CARD_TSX = `import * as React from "react"
import { cn } from "@/lib/utils"

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)} {...props} />
  ),
)
Card.displayName = "Card"

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  ),
)
CardHeader.displayName = "CardHeader"

export const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />
  ),
)
CardTitle.displayName = "CardTitle"

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  ),
)
CardContent.displayName = "CardContent"
`

const INPUT_TSX = `import * as React from "react"
import { cn } from "@/lib/utils"

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = "Input"
`

const SUPABASE_CLIENT_TS = `import { createBrowserClient } from "@supabase/ssr"

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
`

const SUPABASE_SERVER_TS = `import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(toSet) {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Server Components may not set cookies; refresh handled by middleware.
          }
        },
      },
    },
  )
}
`

const MIDDLEWARE_TS = `import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(toSet) {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  // Refresh session if expired — required for Server Components
  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
`

const SUPABASE_MIGRATIONS_GITKEEP = ``

const README_MD = `# Polaris App

Built with [Polaris](https://build.praxiomai.xyz). Generated as a Next.js 15 + Supabase app.

## Getting started

\`\`\`bash
cp .env.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev
\`\`\`

Open http://localhost:3000.

## Stack

- Next.js 15 (App Router) — React 19
- Tailwind CSS 4
- shadcn/ui primitives (Button, Card, Input — extend in \`src/components/ui/\`)
- Supabase (Auth + Postgres + Storage)

## Database

SQL migrations live in \`supabase/migrations/\`. Run them with the Supabase CLI:

\`\`\`bash
npx supabase db push
\`\`\`

## Notes

- This codebase is yours to keep. Polaris does not lock you in.
- The agent can modify anything in \`src/\`, \`public/\`, \`supabase/migrations/\`. It cannot modify \`package.json\`, lockfiles, \`.env\`, or build configs (these are locked for safety — see Polaris's File Safety Policy).
`

export const NEXTJS_SUPABASE_TEMPLATE: readonly BaseFile[] = [
  // Locked structural files
  { path: "package.json",                      content: PACKAGE_JSON,                  locked: true  },
  { path: "tsconfig.json",                     content: TSCONFIG_JSON,                 locked: true  },
  { path: "next.config.ts",                    content: NEXT_CONFIG_TS,                locked: true  },
  { path: "tailwind.config.ts",                content: TAILWIND_CONFIG_TS,            locked: true  },
  { path: "postcss.config.mjs",                content: POSTCSS_CONFIG_MJS,            locked: true  },
  { path: ".gitignore",                        content: GITIGNORE,                     locked: true  },
  { path: ".env.example",                      content: ENV_EXAMPLE,                   locked: true  },

  // App shell
  { path: "src/app/globals.css",               content: GLOBALS_CSS,                   locked: false },
  { path: "src/app/layout.tsx",                content: LAYOUT_TSX,                    locked: false },
  { path: "src/app/page.tsx",                  content: PLACEHOLDER_PAGE_TSX,          locked: false },

  // shadcn/ui starter primitives
  { path: "src/components/ui/button.tsx",      content: BUTTON_TSX,                    locked: false },
  { path: "src/components/ui/card.tsx",        content: CARD_TSX,                      locked: false },
  { path: "src/components/ui/input.tsx",       content: INPUT_TSX,                     locked: false },

  // Utilities
  { path: "src/lib/utils.ts",                  content: UTILS_TS,                      locked: false },

  // Supabase wiring
  { path: "src/lib/supabase/client.ts",        content: SUPABASE_CLIENT_TS,            locked: false },
  { path: "src/lib/supabase/server.ts",        content: SUPABASE_SERVER_TS,            locked: false },
  { path: "src/middleware.ts",                 content: MIDDLEWARE_TS,                 locked: true  },

  // Migrations folder placeholder
  { path: "supabase/migrations/.gitkeep",      content: SUPABASE_MIGRATIONS_GITKEEP,   locked: false },

  // README
  { path: "README.md",                         content: README_MD,                     locked: false },
] as const

export const LOCKED_TEMPLATE_PATHS: ReadonlySet<string> = new Set(
  NEXTJS_SUPABASE_TEMPLATE.filter(f => f.locked).map(f => f.path),
)
```

- [ ] **Step 5.2: Quick sanity test for size and shape**

```bash
npx tsc --noEmit src/features/scaffold/lib/nextjs-supabase-template.ts
```

Expected: zero errors.

- [ ] **Step 5.3: Commit**

```bash
git add src/features/scaffold/lib/nextjs-supabase-template.ts
git commit -m "feat(scaffold): Next.js 15 + Supabase base template (locked structural files + shadcn primitives)"
```

---

## Task 6: Merge Logic

**Files:**
- Create: `src/features/scaffold/lib/merge-template.ts`
- Create: `tests/unit/scaffold/merge-template.test.ts`

**Constitution touchpoints:** Article IX §9.1 (locked files); Article II §2.1 (apps must boot — placeholder page replaceable).

**Merge rules (locked):**

1. **Locked path** (e.g. `package.json`): base template wins. Claude's version, if present, is discarded with a logged warning.
2. **Non-locked path present in both**: Claude's version wins (intent: Claude is generating the *feature*, base template's content is just a placeholder).
3. **Path present only in template**: template kept as-is.
4. **Path present only in Claude output**: included as-is (subject to policy validation in Task 7).
5. **Special case `src/app/page.tsx`**: non-locked, so Claude's version wins per rule 2 — the template page is a placeholder explicitly meant to be overwritten.
6. **Special case `package.json` dependency merging**: deferred — Claude is forbidden by the system prompt from emitting `package.json`. If the model violates the prompt, we *discard* the file and surface a warning. We do NOT attempt to merge dependency objects in v1 (YAGNI per Article IV §4.4). If users hit "I need a new dep" cases, that's deferred to a `run_command: "npm install <pkg>"` flow inside the agent loop (sub-plan 01) — same as Article IX §9.4.

- [ ] **Step 6.1: Write failing tests**

```typescript
// tests/unit/scaffold/merge-template.test.ts
import { describe, it, expect } from "vitest"
import { mergeTemplate } from "@/features/scaffold/lib/merge-template"
import { NEXTJS_SUPABASE_TEMPLATE } from "@/features/scaffold/lib/nextjs-supabase-template"

describe("mergeTemplate", () => {
  it("includes every base template file by default", () => {
    const out = mergeTemplate([])
    expect(out.files.length).toBe(NEXTJS_SUPABASE_TEMPLATE.length)
    const paths = new Set(out.files.map(f => f.path))
    expect(paths.has("package.json")).toBe(true)
    expect(paths.has("src/lib/supabase/server.ts")).toBe(true)
    expect(paths.has("src/middleware.ts")).toBe(true)
  })

  it("Claude's version wins for non-locked paths (e.g. src/app/page.tsx)", () => {
    const out = mergeTemplate([
      { path: "src/app/page.tsx", content: "export default function P() { return <h1>Hi</h1> }" },
    ])
    const page = out.files.find(f => f.path === "src/app/page.tsx")
    expect(page?.content).toContain("<h1>Hi</h1>")
  })

  it("template wins for locked paths (package.json) and warning is logged", () => {
    const out = mergeTemplate([
      { path: "package.json", content: '{"name":"hijacked","dependencies":{"evil":"1.0.0"}}' },
    ])
    const pkg = out.files.find(f => f.path === "package.json")
    expect(pkg?.content).not.toContain("hijacked")
    expect(pkg?.content).toContain('"name": "polaris-app"')
    expect(out.warnings).toContainEqual(
      expect.objectContaining({ kind: "LOCKED_PATH_OVERRIDE_REJECTED", path: "package.json" }),
    )
  })

  it("includes brand-new feature files from Claude untouched", () => {
    const out = mergeTemplate([
      { path: "src/components/feature.tsx", content: "export function Feature() {}" },
      { path: "supabase/migrations/20260426_users.sql", content: "create table users();" },
    ])
    expect(out.files.find(f => f.path === "src/components/feature.tsx")?.content)
      .toContain("Feature")
    expect(out.files.find(f => f.path === "supabase/migrations/20260426_users.sql")?.content)
      .toContain("create table")
  })

  it("returns no duplicate paths in output", () => {
    const out = mergeTemplate([
      { path: "src/app/page.tsx", content: "claude page" },
      { path: "src/app/about/page.tsx", content: "about" },
    ])
    const paths = out.files.map(f => f.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it("preserves locked metadata for the policy step", () => {
    const out = mergeTemplate([])
    const pkg = out.files.find(f => f.path === "package.json")
    expect(pkg?.locked).toBe(true)
    const page = out.files.find(f => f.path === "src/app/page.tsx")
    expect(page?.locked).toBe(false)
  })
})
```

- [ ] **Step 6.2: Run failing tests**

```bash
npm run test:unit -- merge-template
```

Expected: FAIL.

- [ ] **Step 6.3: Implement**

```typescript
// src/features/scaffold/lib/merge-template.ts
import { NEXTJS_SUPABASE_TEMPLATE, LOCKED_TEMPLATE_PATHS, type BaseFile } from "./nextjs-supabase-template"
import type { GeneratedFile } from "../types"

export interface MergeWarning {
  kind: "LOCKED_PATH_OVERRIDE_REJECTED" | "DUPLICATE_INPUT_PATH"
  path: string
  message: string
}

export interface MergeResult {
  files: BaseFile[]   // every file gets a `locked` flag; downstream uses it
  warnings: MergeWarning[]
}

export function mergeTemplate(generated: readonly GeneratedFile[]): MergeResult {
  const out = new Map<string, BaseFile>()
  const warnings: MergeWarning[] = []

  // 1. Seed with the base template.
  for (const f of NEXTJS_SUPABASE_TEMPLATE) {
    out.set(f.path, { ...f })
  }

  // 2. De-duplicate Claude's output (prefer the LAST entry for any path,
  //    but record a warning so we surface model misbehavior).
  const seenInput = new Map<string, GeneratedFile>()
  for (const f of generated) {
    if (seenInput.has(f.path)) {
      warnings.push({
        kind: "DUPLICATE_INPUT_PATH",
        path: f.path,
        message: `Model emitted multiple entries for ${f.path}; using the last one.`,
      })
    }
    seenInput.set(f.path, f)
  }

  // 3. Apply Claude's files on top.
  for (const f of seenInput.values()) {
    if (LOCKED_TEMPLATE_PATHS.has(f.path)) {
      // Locked path — discard Claude's version, warn.
      warnings.push({
        kind: "LOCKED_PATH_OVERRIDE_REJECTED",
        path: f.path,
        message: `Model attempted to write locked path ${f.path}; using base template instead.`,
      })
      continue
    }
    const existing = out.get(f.path)
    out.set(f.path, {
      path: f.path,
      content: f.content,
      locked: existing?.locked ?? false,
    })
  }

  return { files: Array.from(out.values()), warnings }
}
```

- [ ] **Step 6.4: Re-run tests**

```bash
npm run test:unit -- merge-template
```

Expected: PASS (6/6).

- [ ] **Step 6.5: Commit**

```bash
git add src/features/scaffold/lib/merge-template.ts tests/unit/scaffold/merge-template.test.ts
git commit -m "feat(scaffold): merge generated files with base template (locked-wins for structural)"
```

---

## Task 7: Scaffold Path Validation

**Why:** Even after the merge, we must defensively validate every path against `FilePermissionPolicy` before writing to Convex. Claude can hallucinate paths into `node_modules/`, `.git/`, or absolute paths despite the system prompt forbidding them. The schema (Task 1) catches absolute paths and `..` traversal; this catches the rest.

**Subtle rule:** During scaffold, the locked baseline files (`package.json`, `tsconfig.json`, etc.) MUST be writable — the agent is forbidden from touching them post-scaffold, but the *scaffolder* writes them once. This is the documented scaffold-only exception called out in CONSTITUTION §9.1.

**Files:**
- Create: `src/features/scaffold/lib/scaffold-policy.ts`
- Create: `tests/unit/scaffold/scaffold-policy.test.ts`

- [ ] **Step 7.1: Write failing tests**

```typescript
// tests/unit/scaffold/scaffold-policy.test.ts
import { describe, it, expect } from "vitest"
import { validateScaffoldPaths } from "@/features/scaffold/lib/scaffold-policy"

describe("validateScaffoldPaths", () => {
  it("allows locked baseline files (scaffold-time exception)", () => {
    const result = validateScaffoldPaths([
      { path: "package.json", content: "{}", locked: true },
      { path: "tsconfig.json", content: "{}", locked: true },
      { path: "src/middleware.ts", content: "", locked: true },
    ])
    expect(result.ok).toBe(true)
  })

  it("allows files in writable directories", () => {
    const result = validateScaffoldPaths([
      { path: "src/app/page.tsx", content: "x", locked: false },
      { path: "src/components/x.tsx", content: "x", locked: false },
      { path: "supabase/migrations/0001_init.sql", content: "x", locked: false },
      { path: "public/logo.svg", content: "<svg/>", locked: false },
    ])
    expect(result.ok).toBe(true)
  })

  it("rejects writes into node_modules/", () => {
    const result = validateScaffoldPaths([
      { path: "node_modules/foo/index.js", content: "x", locked: false },
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("POLICY_VIOLATION")
      expect(result.error.message).toContain("node_modules")
    }
  })

  it("rejects writes into .git/", () => {
    const result = validateScaffoldPaths([
      { path: ".git/HEAD", content: "x", locked: false },
    ])
    expect(result.ok).toBe(false)
  })

  it("rejects writes to .env or .env.local", () => {
    const result = validateScaffoldPaths([
      { path: ".env", content: "SECRET=1", locked: false },
    ])
    expect(result.ok).toBe(false)
  })

  it("rejects unknown top-level paths (default deny)", () => {
    const result = validateScaffoldPaths([
      { path: "totally-random/file.ts", content: "x", locked: false },
    ])
    expect(result.ok).toBe(false)
  })
})
```

- [ ] **Step 7.2: Run failing tests**

```bash
npm run test:unit -- scaffold-policy
```

Expected: FAIL.

- [ ] **Step 7.3: Implement**

```typescript
// src/features/scaffold/lib/scaffold-policy.ts
//
// Wraps FilePermissionPolicy with a documented scaffold-time exception for
// the locked baseline files (CONSTITUTION §9.1). After scaffold completes,
// these same paths become un-writable to the agent loop — the policy applies
// at agent runtime, not scaffold time.

import { FilePermissionPolicy } from "@/lib/tools/file-permission-policy"
import type { BaseFile } from "./nextjs-supabase-template"
import type { ScaffoldError } from "../types"

export type ValidateResult =
  | { ok: true }
  | { ok: false; error: ScaffoldError }

// Hard deny set — these paths are NEVER writable, even at scaffold time.
// node_modules and .git are not "locked files" they're infrastructure paths.
const SCAFFOLD_HARD_DENY_PREFIXES = [
  "node_modules/",
  ".next/",
  "dist/",
  "build/",
  ".git/",
  ".vercel/",
]

const SCAFFOLD_HARD_DENY_FILES = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
]

export function validateScaffoldPaths(files: readonly BaseFile[]): ValidateResult {
  for (const f of files) {
    // Hard denies first — never bypassed.
    if (SCAFFOLD_HARD_DENY_PREFIXES.some(p => f.path.startsWith(p))) {
      return {
        ok: false,
        error: {
          code: "POLICY_VIOLATION",
          message: `Scaffold cannot write to ${f.path} (read-only directory).`,
          detail: { path: f.path },
        },
      }
    }
    if (SCAFFOLD_HARD_DENY_FILES.includes(f.path)) {
      return {
        ok: false,
        error: {
          code: "POLICY_VIOLATION",
          message: `Scaffold cannot write to ${f.path} (secret file).`,
          detail: { path: f.path },
        },
      }
    }

    // Scaffold-time exception: locked baseline files (locked: true) are
    // permitted. We are in "construction" mode — the policy clamps down
    // afterward when the agent runs.
    if (f.locked) continue

    // For everything else, defer to FilePermissionPolicy.
    if (!FilePermissionPolicy.canWrite(f.path)) {
      return {
        ok: false,
        error: {
          code: "POLICY_VIOLATION",
          message: `Path ${f.path} is not in any writable directory.`,
          detail: { path: f.path },
        },
      }
    }
  }
  return { ok: true }
}
```

- [ ] **Step 7.4: Re-run tests**

```bash
npm run test:unit -- scaffold-policy
```

Expected: PASS (6/6).

- [ ] **Step 7.5: Commit**

```bash
git add src/features/scaffold/lib/scaffold-policy.ts tests/unit/scaffold/scaffold-policy.test.ts
git commit -m "feat(scaffold): path validation with scaffold-time exception for locked baseline files"
```

---

## Task 8: Sandbox Create Inngest Event Contract

**Why now:** Sub-plan 02 builds the consumer of `sandbox/create`. Locking the event payload here unblocks both sub-plans to work in parallel.

**Files:**
- Modify (or create): `src/inngest/events.ts`

- [ ] **Step 8.1: Define the event payload**

```typescript
// src/inngest/events.ts (add or extend)

export interface SandboxCreateEvent {
  name: "sandbox/create"
  data: {
    projectId: string  // Convex Id<"projects"> serialized as string
    userId: string     // Clerk user id
    reason: "scaffold" | "manual" | "expiry-rebuild"
  }
}

// If a discriminated event union already exists, extend it.
// If not, this file becomes the home for all event types.
```

- [ ] **Step 8.2: Verify the inngest client supports typed events**

```bash
grep -r "Inngest({" src/inngest/
```

If the client uses `new Inngest({ id, schemas })`, register the event there. Otherwise, leave the type as documentation — sub-plan 02 will register the consumer and, in doing so, formalize the schema.

- [ ] **Step 8.3: Commit**

```bash
git add src/inngest/events.ts
git commit -m "feat(inngest): lock sandbox/create event payload contract"
```

---

## Task 9: Streaming Progress Helper

**Why:** Scaffold takes 30-60s. The user is staring at an empty conversation panel that whole time unless we surface progress. Per Article II §2.5 (the agent is visible), we insert one assistant message at the start (status "streaming") and append text deltas as we hit each milestone. The browser is already subscribed to `messages` via Convex live queries — no extra plumbing needed.

**Files:**
- Create: `src/features/scaffold/lib/scaffold-progress.ts`

**Constitution touchpoints:** Article II §2.5; Article II §2.6 (failures are honest — error states surface as message status).

- [ ] **Step 9.1: Confirm `messages` table supports streaming-style appends**

Sub-plan 01 ships these mutations on `convex/messages.ts`:
- `create({ projectId, role, kind, status, text? })` → returns `messageId`
- `appendText({ messageId, delta })`
- `setStatus({ messageId, status, errorMessage? })`

If they don't yet exist (e.g. naming differs), confirm with `grep` and adapt the helper signatures.

```bash
grep -E "appendText|setStatus|status:" convex/messages.ts
```

- [ ] **Step 9.2: Implement the helper**

```typescript
// src/features/scaffold/lib/scaffold-progress.ts
import type { ConvexHttpClient } from "convex/browser"
import { api } from "@/../convex/_generated/api"
import type { Id } from "@/../convex/_generated/dataModel"

export interface ScaffoldProgress {
  start(): Promise<void>
  update(delta: string): Promise<void>
  finish(summary: string): Promise<void>
  fail(message: string): Promise<void>
}

export function createScaffoldProgress(
  convex: ConvexHttpClient,
  projectId: Id<"projects">,
): ScaffoldProgress {
  let messageId: Id<"messages"> | null = null

  return {
    async start() {
      messageId = await convex.mutation(api.messages.create, {
        projectId,
        role: "assistant",
        kind: "scaffolding",
        status: "streaming",
        text: "",
      })
    },
    async update(delta: string) {
      if (!messageId) return
      await convex.mutation(api.messages.appendText, { messageId, delta })
    },
    async finish(summary: string) {
      if (!messageId) return
      await convex.mutation(api.messages.appendText, {
        messageId,
        delta: `\n\n${summary}`,
      })
      await convex.mutation(api.messages.setStatus, { messageId, status: "complete" })
    },
    async fail(message: string) {
      if (!messageId) return
      await convex.mutation(api.messages.setStatus, {
        messageId,
        status: "error",
        errorMessage: message,
      })
    },
  }
}

// Pre-canned milestone strings (single source of truth for copy)
export const PROGRESS_COPY = {
  designing: "Designing your app structure...",
  generating: "Generating files with Claude...",
  merging: "Merging with Next.js + Supabase template...",
  validating: "Validating file paths...",
  writing: (n: number) => `Writing ${n} files to your project...`,
  bootingSandbox: "Starting sandbox and installing dependencies...",
} as const
```

- [ ] **Step 9.3: Add `kind: "scaffolding"` to the messages schema if absent**

```bash
grep -n "kind" convex/schema.ts
```

If `messages.kind` is a `v.union(v.literal(...))` and "scaffolding" is missing, add it:

```typescript
// convex/schema.ts (snippet)
kind: v.union(
  v.literal("user_message"),
  v.literal("assistant_response"),
  v.literal("agent_step"),
  v.literal("scaffolding"),   // ← add this line
),
```

- [ ] **Step 9.4: Commit**

```bash
git add src/features/scaffold/lib/scaffold-progress.ts convex/schema.ts
git commit -m "feat(scaffold): streaming progress helper writing to Convex messages"
```

---

## Task 10: Quota Gate

**Why:** Article XVII (Cost Model and Quotas) requires us to check quota *before* spending Claude tokens. Sub-plan 08 builds the full quota system — but scaffolding ships in Phase 1 and needs *some* gate. We ship a minimal version here that sub-plan 08 will replace.

**Files:**
- Create: `src/features/scaffold/lib/scaffold-quota.ts`

**Constitution touchpoints:** Article XVII §17.4 (kill-switch); Article II §2.7 (free tier is a trial).

- [ ] **Step 10.1: Implement a minimal counter**

```typescript
// src/features/scaffold/lib/scaffold-quota.ts
//
// MINIMAL implementation. Sub-plan 08 (Billing) replaces this with proper
// tier-aware quota enforcement against the `usage` table. For Phase 1 we
// just count projects per user and cap at 5 to prevent runaway abuse.

import { ConvexHttpClient } from "convex/browser"
import { api } from "@/../convex/_generated/api"

const FREE_TIER_PROJECT_CAP = 5

export interface QuotaResult {
  allowed: boolean
  reason?: string
  projectCount: number
}

export async function checkScaffoldQuota(
  convex: ConvexHttpClient,
  userId: string,
): Promise<QuotaResult> {
  const projects = await convex.query(api.projects.listByUser, { userId })
  const count = projects?.length ?? 0
  if (count >= FREE_TIER_PROJECT_CAP) {
    return {
      allowed: false,
      projectCount: count,
      reason: `You've reached the ${FREE_TIER_PROJECT_CAP}-project limit on the current plan.`,
    }
  }
  return { allowed: true, projectCount: count }
}
```

- [ ] **Step 10.2: Verify or stub `projects.listByUser`**

```bash
grep -n "listByUser\|byUser" convex/projects.ts
```

If absent, add to `convex/projects.ts`:

```typescript
export const listByUser = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projects")
      .withIndex("by_user", q => q.eq("userId", args.userId))
      .collect()
  },
})
```

(If a `by_user` index doesn't exist, add it to schema.ts.)

- [ ] **Step 10.3: Commit**

```bash
git add src/features/scaffold/lib/scaffold-quota.ts convex/projects.ts convex/schema.ts
git commit -m "feat(scaffold): minimal Phase 1 quota gate (5 projects per user; replaced in sub-plan 08)"
```

---

## Task 11: API Route POST /api/scaffold

**Files:**
- Create: `src/app/api/scaffold/route.ts`

**Constitution touchpoints:** Article III §3.7 (server-side AI); Article X §10.2 (Convex first); Article XIV §14.1 (P50 budget).

- [ ] **Step 11.1: Implement**

```typescript
// src/app/api/scaffold/route.ts
import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { ConvexHttpClient } from "convex/browser"
import { api } from "@/../convex/_generated/api"
import { inngest } from "@/inngest/client"
import { promptToScaffold } from "@/features/scaffold/lib/prompt-to-scaffold"
import { mergeTemplate } from "@/features/scaffold/lib/merge-template"
import { validateScaffoldPaths } from "@/features/scaffold/lib/scaffold-policy"
import { checkScaffoldQuota } from "@/features/scaffold/lib/scaffold-quota"
import { createScaffoldProgress, PROGRESS_COPY } from "@/features/scaffold/lib/scaffold-progress"
import type { ScaffoldErrorCode } from "@/features/scaffold/types"

export const runtime = "nodejs"
export const maxDuration = 120  // seconds — covers Article XIV's worst case

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

interface ErrorResponse {
  error: { code: ScaffoldErrorCode; message: string }
}

function errorResponse(code: ScaffoldErrorCode, message: string, status: number): NextResponse<ErrorResponse> {
  return NextResponse.json({ error: { code, message } }, { status })
}

export async function POST(req: Request): Promise<NextResponse> {
  const startedAt = Date.now()

  const { userId } = await auth()
  if (!userId) return errorResponse("INVALID_PROMPT", "Unauthorized", 401)

  let prompt: string
  try {
    const body = await req.json()
    if (typeof body?.prompt !== "string") throw new Error("prompt missing")
    prompt = body.prompt
  } catch {
    return errorResponse("INVALID_PROMPT", "Body must be { prompt: string }", 400)
  }

  // 1. Quota gate (Article XVII)
  const quota = await checkScaffoldQuota(convex, userId)
  if (!quota.allowed) {
    return errorResponse("QUOTA_EXCEEDED", quota.reason ?? "Quota exceeded", 402)
  }

  // 2. Create the project up front so we can stream progress into it.
  const projectId = await convex.mutation(api.projects.create, {
    userId,
    name: prompt.slice(0, 60),
    initialPrompt: prompt,
  })

  const progress = createScaffoldProgress(convex, projectId)
  await progress.start()

  try {
    // 3. Generate
    await progress.update(PROGRESS_COPY.designing)
    await progress.update("\n" + PROGRESS_COPY.generating)
    const generated = await promptToScaffold({ prompt, userId })
    if (!generated.ok) {
      await progress.fail(generated.error.message)
      return errorResponse(generated.error.code, generated.error.message, 502)
    }

    // 4. Merge
    await progress.update("\n" + PROGRESS_COPY.merging)
    const merged = mergeTemplate(generated.value.files)

    // 5. Validate
    await progress.update("\n" + PROGRESS_COPY.validating)
    const validation = validateScaffoldPaths(merged.files)
    if (!validation.ok) {
      await progress.fail(validation.error.message)
      return errorResponse(validation.error.code, validation.error.message, 502)
    }

    // 6. Bulk-write to Convex (Article X §10.2: Convex first)
    await progress.update("\n" + PROGRESS_COPY.writing(merged.files.length))
    try {
      await convex.mutation(api.files_by_path.writeMany, {
        projectId,
        files: merged.files.map(f => ({ path: f.path, content: f.content })),
        updatedBy: "scaffold",
      })
    } catch (err) {
      await progress.fail("Failed to save files. Please try again.")
      return errorResponse("CONVEX_WRITE_FAILED", "Convex write failed.", 502)
    }

    // 7. Fire sandbox boot in background (sub-plan 02 consumes this)
    await progress.update("\n" + PROGRESS_COPY.bootingSandbox)
    await inngest.send({
      name: "sandbox/create",
      data: { projectId, userId, reason: "scaffold" },
    })

    // 8. Finish
    await progress.finish(generated.value.summary)

    return NextResponse.json({
      projectId,
      fileCount: merged.files.length,
      durationMs: Date.now() - startedAt,
    })
  } catch (err) {
    await progress.fail("An unexpected error occurred during scaffolding.")
    return errorResponse("INTERNAL_ERROR", "Unexpected scaffold error.", 500)
  }
}
```

- [ ] **Step 11.2: Add a typecheck**

```bash
npx tsc --noEmit
```

Expected: zero errors related to scaffold files. (Errors elsewhere are out of scope.)

- [ ] **Step 11.3: Commit**

```bash
git add src/app/api/scaffold/route.ts
git commit -m "feat(scaffold): POST /api/scaffold orchestrating prompt → files → sandbox event"
```

---

## Task 12: End-to-End Test with Mocked Claude

**Files:**
- Create: `tests/unit/scaffold/end-to-end.test.ts`
- Create: `tests/fixtures/scaffold/policy-violation.json`

This is the headline test. It exercises the full route handler with `claudeComplete` mocked to return a fixture, every Convex mutation mocked, the Inngest client mocked, and Clerk auth mocked. We assert: project created, files written exactly once with the expected count, `sandbox/create` event fired, response shape correct.

- [ ] **Step 12.1: Write the policy-violation fixture**

```json
// tests/fixtures/scaffold/policy-violation.json
{
  "summary": "Tries to write into node_modules",
  "files": [
    { "path": "src/app/page.tsx", "content": "export default function Page(){ return null }" },
    { "path": "node_modules/evil/index.js", "content": "module.exports = 1" }
  ]
}
```

- [ ] **Step 12.2: Write the test**

```typescript
// tests/unit/scaffold/end-to-end.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import todoFixture from "../../fixtures/scaffold/todo-app.json"
import policyViolation from "../../fixtures/scaffold/policy-violation.json"

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: "u_test" }),
}))

const mockMutation = vi.fn()
const mockQuery = vi.fn()
vi.mock("convex/browser", () => ({
  ConvexHttpClient: vi.fn().mockImplementation(() => ({
    mutation: mockMutation,
    query: mockQuery,
  })),
}))

const mockSend = vi.fn().mockResolvedValue(undefined)
vi.mock("@/inngest/client", () => ({ inngest: { send: mockSend } }))

vi.mock("@/lib/ai/claude-direct", () => ({ claudeComplete: vi.fn() }))
import { claudeComplete } from "@/lib/ai/claude-direct"

import { POST } from "@/app/api/scaffold/route"

function makeRequest(body: unknown): Request {
  return new Request("http://test/api/scaffold", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/scaffold (end-to-end with mocks)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery.mockResolvedValue([])  // no existing projects → quota allows
    mockMutation.mockImplementation(async (_fn: any, args: any) => {
      // Distinguish by args shape: projects.create returns id; messages.create returns id; writeMany returns counts.
      if (args?.initialPrompt) return "proj_test" as any
      if (args?.role === "assistant") return "msg_test" as any
      if (args?.files) return { inserted: args.files.length, updated: 0, total: args.files.length }
      return null as any
    })
  })

  it("happy path: creates project, writes merged files, fires sandbox event", async () => {
    vi.mocked(claudeComplete).mockResolvedValue(JSON.stringify(todoFixture))

    const res = await POST(makeRequest({ prompt: "todo app" }))
    expect(res.status).toBe(200)

    const json = await res.json() as { projectId: string; fileCount: number }
    expect(json.projectId).toBe("proj_test")
    // 4 Claude files + ~19 base template files, with src/app/page.tsx merged into one entry.
    expect(json.fileCount).toBeGreaterThan(15)
    expect(json.fileCount).toBeLessThan(35)

    // Convex writeMany was called exactly once with all files
    const writeManyCall = mockMutation.mock.calls.find(c => c[1]?.files)
    expect(writeManyCall).toBeDefined()
    expect(writeManyCall![1].files.length).toBe(json.fileCount)

    // sandbox/create fired exactly once
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      name: "sandbox/create",
      data: expect.objectContaining({ projectId: "proj_test", reason: "scaffold" }),
    }))
  })

  it("returns 502 with POLICY_VIOLATION when Claude writes into node_modules/", async () => {
    vi.mocked(claudeComplete).mockResolvedValue(JSON.stringify(policyViolation))
    const res = await POST(makeRequest({ prompt: "evil app" }))
    expect(res.status).toBe(502)
    const json = await res.json() as { error: { code: string } }
    expect(json.error.code).toBe("POLICY_VIOLATION")
    // Sandbox event NOT fired
    expect(mockSend).not.toHaveBeenCalled()
  })

  it("returns 402 QUOTA_EXCEEDED when user has 5 projects already", async () => {
    mockQuery.mockResolvedValue(Array.from({ length: 5 }, (_, i) => ({ _id: `p${i}` })))
    const res = await POST(makeRequest({ prompt: "x" }))
    expect(res.status).toBe(402)
  })

  it("returns 502 CLAUDE_PARSE_ERROR when Claude returns garbage", async () => {
    vi.mocked(claudeComplete).mockResolvedValue("totally not JSON")
    const res = await POST(makeRequest({ prompt: "x" }))
    expect(res.status).toBe(502)
    const json = await res.json() as { error: { code: string } }
    expect(json.error.code).toBe("CLAUDE_PARSE_ERROR")
  })

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@clerk/nextjs/server")
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as any)
    const res = await POST(makeRequest({ prompt: "x" }))
    expect(res.status).toBe(401)
  })

  it("returns 400 on missing prompt", async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 12.3: Run all scaffold tests**

```bash
npm run test:unit -- scaffold
```

Expected: all pass.

- [ ] **Step 12.4: Commit**

```bash
git add tests/unit/scaffold/end-to-end.test.ts tests/fixtures/scaffold/policy-violation.json
git commit -m "test(scaffold): end-to-end route handler with mocked Claude, Convex, Inngest"
```

---

## Task 13: Manual Smoke Test

**Why:** Unit tests prove the wiring. A single real run against real Claude proves the prompt actually elicits valid output. This is gated on sub-plan 01 having shipped `claudeComplete` and the env var.

- [ ] **Step 13.1: Set env vars**

```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env.local
echo "NEXT_PUBLIC_CONVEX_URL=https://your-dev.convex.cloud" >> .env.local
```

- [ ] **Step 13.2: Boot Next + Convex + Inngest in three terminals**

```bash
# T1
npm run dev
# T2
npx convex dev
# T3
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

- [ ] **Step 13.3: Sign in (Clerk dev), then call the route**

```bash
curl -X POST http://localhost:3000/api/scaffold \
  -H "content-type: application/json" \
  -H "cookie: __session=<copy from browser>" \
  -d '{"prompt":"A markdown notes app with tags and full-text search."}'
```

Expected response:
```json
{ "projectId": "k1...", "fileCount": 22, "durationMs": 32000 }
```

- [ ] **Step 13.4: Inspect Convex dashboard**

- `projects` table: one new row with the prompt as `name`/`initialPrompt`.
- `files` table: ~22 rows for that `projectId`, including `package.json`, `src/middleware.ts`, `src/app/page.tsx`, and feature-specific files.
- `messages` table: one assistant message of `kind: "scaffolding"`, `status: "complete"`, with text containing every progress milestone and Claude's summary.

- [ ] **Step 13.5: Inspect Inngest dashboard**

`sandbox/create` event visible. (Sub-plan 02 will be the consumer; until merged, the event sits without a handler — that's fine for this smoke test.)

- [ ] **Step 13.6: Document any gaps in `docs/plans/03-scaffolding.md` Self-Review**

If the manual run surfaces issues (e.g. Claude routinely returns markdown fences despite the prompt — handled by `stripCodeFences`; or Claude routinely emits more than 60 files — adjust `MAX_GENERATED_FILES` or strengthen the prompt), update the relevant Task's tests and the system prompt, then re-commit.

- No code commit for the smoke test itself; it's a verification gate.

---

## Task 14: Cleanup and Documentation

- [ ] **Step 14.1: Add scaffold env-var note to `.env.example`**

If `.env.example` exists from sub-plan 01, add a section:

```
# Scaffold (Phase 1 — sub-plan 03)
# No additional env vars required. Uses ANTHROPIC_API_KEY + NEXT_PUBLIC_CONVEX_URL above.
```

- [ ] **Step 14.2: Run the full unit suite**

```bash
npm run test:unit
```

Expected: all green; coverage on `src/features/scaffold/**` ≥ 70%.

- [ ] **Step 14.3: Final lint**

```bash
npm run lint
```

Expected: zero scaffold-related errors.

- [ ] **Step 14.4: Final commit**

```bash
git add .env.example
git commit -m "docs(scaffold): note env var dependencies; sub-plan 03 complete"
```

---

## Deferred to Later Sub-Plans

These are deliberately out of scope here. Listed so a reviewer doesn't ask "where's X?":

- **Sandbox boot itself** — sub-plan 02. We only fire the event.
- **Streaming editor preview during scaffold** — sub-plan 04. The scaffold route returns once files are in Convex; the preview iframe in the existing UI updates via Convex live subscription as soon as files land.
- **Per-token quota tracking** — sub-plan 08. Phase 1 ships project-count cap only.
- **Scaffold cancellation** — out of scope. Scaffold is a 30-60s one-shot; if the user navigates away, the route still completes its work (project + files + event), and the user finds it on return. Sub-plan 04 adds a "stop" button for agent loops; scaffold uses the same primitive in v1.1 if needed.
- **Dependency injection for Claude-requested packages** — Article IX §9.4. The agent loop (sub-plan 01) handles this via `run_command: "npm install <pkg>"` after scaffold. Scaffold itself never modifies `package.json`.
- **Multi-page progress card UI** — sub-plan 04. We write the *data* (text deltas + status); sub-plan 04 designs the rendering.
- **Project rename UX** — sub-plan 04 / 05. The route uses `prompt.slice(0, 60)` as a placeholder name.
- **Template variants** (e.g. "marketing site" vs "SaaS dashboard" starting points) — Open Decision O-002 (post-launch).
- **Resumable scaffold on Inngest retry** — out of scope. The route handler runs synchronously inside the HTTP request. If it fails midway, the user retries. Total wall time ≤ 60s makes this acceptable per Article IV §4.4 (YAGNI).

---

## Self-Review

**Spec coverage:** Each input requirement maps to a Task:

| Required item | Task |
|---|---|
| `ScaffoldRequest`/`ScaffoldResponse`/`GeneratedFile`/`ScaffoldSchema` | Task 1 |
| Scaffold system prompt with stack constraints | Task 2 |
| `prompt-to-scaffold` with parse / schema / oversize handling | Task 3 |
| `~25-35 base template files` with real contents | Task 5 (19 files; the count gives Claude room to add ~10 feature files and stay under MAX_GENERATED_FILES — the constitution constrains *generated* file count, not template+generated, but we deliberately keep the template lean) |
| Merge logic (Claude wins for non-locked; locked unchanged; package.json conflict) | Task 6 |
| FilePermissionPolicy validation with scaffold-time exception | Task 7 |
| `POST /api/scaffold` with auth + quota + project create + bulk write + event fire | Tasks 10, 11 |
| Streaming progress via Convex messages | Task 9, integrated in Task 11 |
| Tests: schema, merge, policy, end-to-end | Tasks 1, 6, 7, 12 |

**Constitution compliance audit:**

- §3.7 Server-side AI: route is `runtime: "nodejs"`, key never leaves server. ✓
- §4.6 No placeholders: every base template file is real and runnable. The `placeholder page.tsx` is documented as such and explicitly designed to be overridden by Claude. ✓
- §5.4 Stack: package.json pins `next@15.0.3`, `react@19.0.0`, `@supabase/ssr`, `tailwindcss@^4.0.0-beta.1`. ✓
- §9.1 Locked file list: scaffold writes `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `.gitignore`, `.env.example`, `src/middleware.ts` once via the documented scaffold-time exception (Task 7). The agent loop (sub-plan 01) cannot modify them after. ✓
- §10.2 Convex first: `writeMany` runs *before* `inngest.send("sandbox/create")`. The sandbox lifecycle (sub-plan 02) reads from Convex on boot. ✓
- §14.1 P50 budget: Claude single-shot ~20-40s + bulk Convex write ~2s + event fire ~50ms = ~25-45s. Sandbox boot (sub-plan 02) runs in parallel after we return; the user sees the project page within 2s of receiving `projectId`. The 60s P50 budget is comfortably met. ✓

**Placeholder scan:** Searched this plan for `TODO`, `FIXME`, `Not implemented` — only references are in the *prohibition* clauses and the system prompt's quality bar (forbidding them in generated code). No actual TODOs remain.

**Type consistency:** `GeneratedFile` is the canonical shape (path + content). `BaseFile` extends it with `locked`. `MergeResult.files` is `BaseFile[]`. `validateScaffoldPaths` consumes `BaseFile[]`. `writeMany` consumes `{ path, content }[]`. The chain is type-safe end to end.

**Open questions / risks:**

1. **Real-world Claude file count.** The system prompt says "between 4 and 50 files." Empirically (sub-plan 03 manual smoke, Task 13), early prompts may yield 8-25 files. If Claude routinely undershoots (e.g. always 5 files for a complex prompt), we may want a follow-up "expand" pass. Defer to post-Day-3 retro.
2. **shadcn/ui growth.** Base template ships only Button, Card, Input. Claude is told it MAY add more under `src/components/ui/`. We trust it to follow the Radix-primitive pattern; if it generates broken shadcn-style components, the merge step doesn't catch it. Mitigation: the sandbox boot's `npm run dev` will surface compile errors which the agent loop can then fix on the user's first chat turn. Article II §2.6 (failures are honest) covers this.
3. **`maxDuration = 120`.** Vercel's serverless function timeout. If Claude takes longer than 90s (our internal budget), we return CLAUDE_TIMEOUT before Vercel kills the request. Aligned.
4. **Migration order with sub-plan 01.** This plan assumes `convex/files_by_path.ts` and `claudeComplete` exist. Sub-plan 01 must merge before this one. Roadmap §4 confirms the order (Day 2-3, post sub-plan 01).
