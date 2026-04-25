# Sub-Plan 04 — Streaming UI

> **Authority:** Derives from `docs/CONSTITUTION.md` (esp. Article II §2.5 "agent visible", Article III §3.7 "server-side AI", Article VII "agent loop", Article XII §12.5 "error surface") and `docs/ROADMAP.md` Phase 1.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the agent loop visible, beautiful, and trustworthy. Render every message, every tool call, every status transition produced by sub-plan 01 in the conversation sidebar. Polish the cancel UX. Pulse the file tree when the agent writes. Add optimistic mutations to all four file mutations so manual edits feel instant.

**Architecture:** Sub-plan 01 is the data plane — Inngest function streams `messages.toolCalls` (JSON-serialized records `{ id, name, input, output?, error?, status: 'running' | 'completed' | 'error' }`) and message text into Convex via `appendText`, `appendToolCall`, `appendToolResult` mutations. Convex subscriptions push deltas to React in <300ms. This sub-plan is the presentation plane — discriminated rendering of `message.role × message.status × toolCalls[]`, plus optimistic local state for file mutations.

**Tech Stack:** React 19 + TypeScript, `convex/react` (`useQuery`, `useMutation().withOptimisticUpdate`), shadcn/ui (`Card`, `Badge`, `Button`, `Collapsible`), Tailwind 4, `lucide-react` icons, `react-markdown` + `remark-gfm` (assistant text), `sonner` (toast), `vitest` + `@testing-library/react` (snapshot + behavior tests).

**Phase:** 1 — Functional Core (Days 2-4 of 17-day plan; Track C on Day 3, Track A on Day 4).

**Constitution articles you must re-read before starting:**
- Article II §2.5 — "agent visible by default" (every tool call rendered, every error surfaced specifically)
- Article III §3.7 — server-side AI (the UI is a passive subscriber; never originates Claude calls)
- Article VII — agent loop step shape and the `AgentStep` discriminated union
- Article XII §12.5 — error surface (specific copy for rate-limit / timeout / sandbox-dead, with paired CTA)
- Article X — Convex first (optimistic updates resolve to Convex truth; never to local-only state)

---

## Table of Contents

- [File Structure](#file-structure)
- [Task 1: Dependencies and shadcn primitives](#task-1-dependencies-and-shadcn-primitives)
- [Task 2: Tool icon registry](#task-2-tool-icon-registry)
- [Task 3: StreamingIndicator](#task-3-streamingindicator)
- [Task 4: ToolCallCard](#task-4-toolcallcard)
- [Task 5: MessageBubble](#task-5-messagebubble)
- [Task 6: ErrorState](#task-6-errorstate)
- [Task 7: CancelButton (extracted, polished)](#task-7-cancelbutton-extracted-polished)
- [Task 8: Refactor ConversationSidebar to use new components](#task-8-refactor-conversationsidebar-to-use-new-components)
- [Task 9: Optimistic mutations in use-files](#task-9-optimistic-mutations-in-use-files)
- [Task 10: useRecentlyChangedFiles hook](#task-10-userecentlychangedfiles-hook)
- [Task 11: File-tree pulse animation wiring](#task-11-file-tree-pulse-animation-wiring)
- [Task 12: Tests — snapshot + behavior + rollback](#task-12-tests--snapshot--behavior--rollback)
- [Task 13: Manual smoke checklist + Phase 1 DoD verification](#task-13-manual-smoke-checklist--phase-1-dod-verification)

---

## File Structure

### Files to create

```
src/features/conversations/components/message-bubble.tsx           ← NEW
src/features/conversations/components/tool-call-card.tsx           ← NEW
src/features/conversations/components/streaming-indicator.tsx      ← NEW
src/features/conversations/components/error-state.tsx              ← NEW
src/features/conversations/components/cancel-button.tsx            ← NEW
src/features/conversations/lib/tool-icons.tsx                      ← NEW
src/features/conversations/lib/error-classify.ts                   ← NEW
src/features/conversations/lib/parse-tool-calls.ts                 ← NEW
src/features/projects/hooks/use-recently-changed-files.ts          ← NEW

tests/unit/conversations/message-bubble.test.tsx                   ← NEW
tests/unit/conversations/tool-call-card.test.tsx                   ← NEW
tests/unit/conversations/error-state.test.tsx                      ← NEW
tests/unit/conversations/cancel-button.test.tsx                    ← NEW
tests/unit/projects/use-files-optimistic.test.tsx                  ← NEW
tests/unit/projects/use-recently-changed-files.test.tsx            ← NEW
tests/helpers/convex-test-provider.tsx                             ← NEW
```

### Files to modify

```
src/features/conversations/components/conversation-sidebar.tsx     ← Delegate to new components
src/features/projects/hooks/use-files.ts                           ← Implement 4 optimistic mutations
src/features/projects/components/file-explorer/tree-item-wrapper.tsx ← Apply pulse class
src/app/globals.css                                                ← Add @keyframes pulse-agent (Tailwind 4 @theme)
package.json                                                       ← Add react-markdown, remark-gfm, @testing-library/react, jsdom
vitest.config.ts                                                   ← Add jsdom env for *.test.tsx
```

---

## Task 1: Dependencies and shadcn primitives

**Why first:** `react-markdown` is required by MessageBubble Task 5; `@testing-library/react` + `jsdom` are required by every `.test.tsx` test file in Task 12. shadcn `Collapsible` and `Badge` may not be installed yet — verify before assuming.

**Files:** `package.json`, `vitest.config.ts`, possibly `src/components/ui/collapsible.tsx` and `src/components/ui/badge.tsx`.

- [ ] **Step 1.1: Verify markdown deps**

```bash
node -e "require('react-markdown')" 2>&1
node -e "require('remark-gfm')" 2>&1
```

If either errors with `Cannot find module`, install:

```bash
npm install react-markdown remark-gfm
```

- [ ] **Step 1.2: Install testing deps**

```bash
npm install -D @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 1.3: Verify shadcn primitives**

```bash
ls src/components/ui/badge.tsx src/components/ui/collapsible.tsx src/components/ui/card.tsx 2>&1
```

For any missing:

```bash
npx shadcn@latest add badge collapsible card
```

- [ ] **Step 1.4: Update `vitest.config.ts` to support JSX tests**

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}", "convex/**/*.ts"],
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
})
```

If `@vitejs/plugin-react` is missing: `npm install -D @vitejs/plugin-react`.

- [ ] **Step 1.5: Test setup file**

```typescript
// tests/setup.ts
import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

afterEach(() => cleanup())
```

- [ ] **Step 1.6: Add Tailwind 4 keyframes for pulse-agent**

Append to `src/app/globals.css` inside the existing `@theme` block (or below it):

```css
@keyframes pulse-agent {
  0%, 100% { background-color: transparent; }
  50% { background-color: color-mix(in oklab, var(--color-primary) 18%, transparent); }
}

.animate-pulse-agent {
  animation: pulse-agent 1.2s ease-in-out 2;
}
```

The `2` (iteration count) makes the pulse run twice (~2.4s total) when the agent touches a file, then settle.

- [ ] **Step 1.7: Confirm tests still execute**

```bash
npm run test:unit -- --run --reporter=verbose
```

Expected: zero tests, zero errors.

- [ ] **Step 1.8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/setup.ts src/app/globals.css src/components/ui/
git commit -m "build(streaming-ui): add markdown + RTL + jsdom; pulse keyframes"
```

---

## Task 2: Tool icon registry

**Why second:** Every other component in this plan imports from here. Pure data, no React state — trivially testable.

**Files:** `src/features/conversations/lib/tool-icons.tsx`

- [ ] **Step 2.1: Write the failing test first (TDD)**

```typescript
// tests/unit/conversations/tool-icons.test.tsx (co-located in tool-call-card.test.tsx is fine; or new file)
import { describe, expect, it } from "vitest"
import { TOOL_ICON, TOOL_LABEL, getToolPresentation } from "@/features/conversations/lib/tool-icons"

describe("tool-icons", () => {
  it("returns concrete icon component for each known tool", () => {
    for (const tool of ["read_file", "write_file", "create_file", "delete_file", "list_files", "run_command"] as const) {
      expect(TOOL_ICON[tool]).toBeTypeOf("object") // forwardRef component
    }
  })

  it("returns a fallback for unknown tools", () => {
    const p = getToolPresentation("totally_made_up_tool")
    expect(p.Icon).toBeDefined()
    expect(p.label).toBe("totally_made_up_tool")
  })

  it("labels match Article VIII tool list", () => {
    expect(TOOL_LABEL.write_file).toBe("Write file")
    expect(TOOL_LABEL.run_command).toBe("Run command")
  })
})
```

Run: `npm run test:unit -- tool-icons`. Expect failure (module does not exist).

- [ ] **Step 2.2: Implement**

```tsx
// src/features/conversations/lib/tool-icons.tsx
import {
  FileText,
  Pencil,
  FilePlus,
  Trash,
  Folder,
  Terminal,
  Wrench,
  type LucideIcon,
} from "lucide-react"

export const TOOL_NAMES = [
  "read_file",
  "write_file",
  "create_file",
  "delete_file",
  "list_files",
  "run_command",
] as const

export type ToolName = (typeof TOOL_NAMES)[number]

export const TOOL_ICON: Record<ToolName, LucideIcon> = {
  read_file: FileText,
  write_file: Pencil,
  create_file: FilePlus,
  delete_file: Trash,
  list_files: Folder,
  run_command: Terminal,
}

export const TOOL_LABEL: Record<ToolName, string> = {
  read_file: "Read file",
  write_file: "Write file",
  create_file: "Create file",
  delete_file: "Delete file",
  list_files: "List files",
  run_command: "Run command",
}

export interface ToolPresentation {
  Icon: LucideIcon
  label: string
  /** Concise human-readable summary of the tool's input. */
  summary: (input: unknown) => string
}

const SUMMARY: Record<ToolName, (input: unknown) => string> = {
  read_file: (i) => `reading ${pathOf(i)}`,
  write_file: (i) => `writing ${pathOf(i)}`,
  create_file: (i) => `creating ${pathOf(i)}`,
  delete_file: (i) => `deleting ${pathOf(i)}`,
  list_files: (i) => `listing ${pathOf(i, "/")}`,
  run_command: (i) => {
    const cmd = (i as { command?: string })?.command ?? ""
    return cmd.length > 60 ? `running \`${cmd.slice(0, 57)}…\`` : `running \`${cmd}\``
  },
}

function pathOf(input: unknown, fallback = "(unknown)"): string {
  if (typeof input === "object" && input !== null && "path" in input) {
    const p = (input as { path?: unknown }).path
    if (typeof p === "string" && p.length > 0) return p
  }
  return fallback
}

export function getToolPresentation(name: string): ToolPresentation {
  if ((TOOL_NAMES as readonly string[]).includes(name)) {
    const n = name as ToolName
    return { Icon: TOOL_ICON[n], label: TOOL_LABEL[n], summary: SUMMARY[n] }
  }
  return { Icon: Wrench, label: name, summary: () => name }
}
```

- [ ] **Step 2.3: Tests pass**

```bash
npm run test:unit -- tool-icons
```

- [ ] **Step 2.4: Commit**

```bash
git add src/features/conversations/lib/tool-icons.tsx tests/unit/conversations/tool-icons.test.tsx
git commit -m "feat(conversations): tool icon and label registry"
```

---

## Task 3: StreamingIndicator

**Files:** `src/features/conversations/components/streaming-indicator.tsx`

Replaces the existing inline "Thinking..." text in `conversation-sidebar.tsx`. Single visual language.

- [ ] **Step 3.1: Failing test**

```tsx
// tests/unit/conversations/streaming-indicator.test.tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { StreamingIndicator } from "@/features/conversations/components/streaming-indicator"

describe("StreamingIndicator", () => {
  it("renders three dots and an a11y label", () => {
    render(<StreamingIndicator />)
    expect(screen.getByRole("status")).toHaveAccessibleName(/agent thinking|streaming/i)
    const dots = screen.getAllByTestId("streaming-dot")
    expect(dots).toHaveLength(3)
  })

  it("respects custom label", () => {
    render(<StreamingIndicator label="Generating files…" />)
    expect(screen.getByRole("status")).toHaveAccessibleName("Generating files…")
  })
})
```

- [ ] **Step 3.2: Implement**

```tsx
// src/features/conversations/components/streaming-indicator.tsx
import { cn } from "@/lib/utils"

export interface StreamingIndicatorProps {
  label?: string
  className?: string
}

export const StreamingIndicator = ({
  label = "Agent thinking",
  className,
}: StreamingIndicatorProps) => {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn("inline-flex items-center gap-1.5 px-2 py-1", className)}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          data-testid="streaming-dot"
          className="size-1.5 rounded-full bg-muted-foreground/70 animate-streaming-dot"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  )
}
```

- [ ] **Step 3.3: Add `animate-streaming-dot` keyframes**

In `src/app/globals.css`:

```css
@keyframes streaming-dot {
  0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
  40% { opacity: 1; transform: translateY(-2px); }
}
.animate-streaming-dot { animation: streaming-dot 1.2s ease-in-out infinite; }
```

- [ ] **Step 3.4: Tests pass; commit**

```bash
npm run test:unit -- streaming-indicator
git add src/features/conversations/components/streaming-indicator.tsx tests/unit/conversations/streaming-indicator.test.tsx src/app/globals.css
git commit -m "feat(conversations): StreamingIndicator with bouncing dots"
```

---

## Task 4: ToolCallCard

**Files:** `src/features/conversations/components/tool-call-card.tsx`, `src/features/conversations/lib/parse-tool-calls.ts`

The `messages.toolCalls` field on a Convex message is JSON-serialized (sub-plan 01 stores it as a string for simpler streaming patches). Parse defensively.

- [ ] **Step 4.1: Define the parse helper + record type**

Failing test first:

```ts
// tests/unit/conversations/parse-tool-calls.test.ts
import { describe, expect, it } from "vitest"
import { parseToolCalls, type ToolCallRecord } from "@/features/conversations/lib/parse-tool-calls"

describe("parseToolCalls", () => {
  it("returns empty array for null/undefined/empty", () => {
    expect(parseToolCalls(null)).toEqual([])
    expect(parseToolCalls(undefined)).toEqual([])
    expect(parseToolCalls("")).toEqual([])
    expect(parseToolCalls("[]")).toEqual([])
  })

  it("parses a valid JSON array of records", () => {
    const records: ToolCallRecord[] = [
      { id: "t1", name: "write_file", input: { path: "a.ts" }, status: "running" },
    ]
    expect(parseToolCalls(JSON.stringify(records))).toEqual(records)
  })

  it("returns empty array on malformed JSON without throwing", () => {
    expect(parseToolCalls("{not json")).toEqual([])
  })

  it("filters out non-record entries", () => {
    const raw = JSON.stringify([{ id: "ok", name: "read_file", input: {}, status: "completed" }, "bad", null, 5])
    const out = parseToolCalls(raw)
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe("ok")
  })
})
```

- [ ] **Step 4.2: Implement parse helper**

```ts
// src/features/conversations/lib/parse-tool-calls.ts
export type ToolCallStatus = "running" | "completed" | "error"

export interface ToolCallRecord {
  id: string
  name: string
  input: unknown
  output?: unknown
  error?: string
  status: ToolCallStatus
  /** Optional: ms since epoch when started (for "running for 12s" indicators). */
  startedAt?: number
}

export function parseToolCalls(raw: string | null | undefined): ToolCallRecord[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isToolCallRecord)
  } catch {
    return []
  }
}

function isToolCallRecord(v: unknown): v is ToolCallRecord {
  if (typeof v !== "object" || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    "input" in o &&
    (o.status === "running" || o.status === "completed" || o.status === "error")
  )
}
```

- [ ] **Step 4.3: Failing test for ToolCallCard**

```tsx
// tests/unit/conversations/tool-call-card.test.tsx
import { render, screen, fireEvent } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ToolCallCard } from "@/features/conversations/components/tool-call-card"
import type { ToolCallRecord } from "@/features/conversations/lib/parse-tool-calls"

const running: ToolCallRecord = { id: "1", name: "write_file", input: { path: "src/app/page.tsx" }, status: "running" }
const completed: ToolCallRecord = { id: "2", name: "write_file", input: { path: "src/app/page.tsx" }, output: { bytes: 1024 }, status: "completed" }
const errored: ToolCallRecord = { id: "3", name: "run_command", input: { command: "npm test" }, error: "Command exited 1", status: "error" }

describe("ToolCallCard", () => {
  it("renders running summary with shimmer", () => {
    render(<ToolCallCard call={running} />)
    expect(screen.getByText(/writing src\/app\/page\.tsx/)).toBeInTheDocument()
    expect(screen.getByTestId("tool-shimmer")).toBeInTheDocument()
    expect(screen.getByLabelText(/running/i)).toBeInTheDocument()
  })

  it("renders completed with green check", () => {
    render(<ToolCallCard call={completed} />)
    expect(screen.getByLabelText(/completed/i)).toBeInTheDocument()
    expect(screen.queryByTestId("tool-shimmer")).not.toBeInTheDocument()
  })

  it("renders error with message and red X", () => {
    render(<ToolCallCard call={errored} />)
    expect(screen.getByText(/Command exited 1/)).toBeInTheDocument()
    expect(screen.getByLabelText(/error/i)).toBeInTheDocument()
  })

  it("toggles details on click", () => {
    render(<ToolCallCard call={completed} />)
    const trigger = screen.getByRole("button", { name: /show details/i })
    expect(screen.queryByText(/"bytes": 1024/)).not.toBeInTheDocument()
    fireEvent.click(trigger)
    expect(screen.getByText(/"bytes": 1024/)).toBeInTheDocument()
  })

  it("matches snapshot for each status", () => {
    expect(render(<ToolCallCard call={running} />).asFragment()).toMatchSnapshot("running")
    expect(render(<ToolCallCard call={completed} />).asFragment()).toMatchSnapshot("completed")
    expect(render(<ToolCallCard call={errored} />).asFragment()).toMatchSnapshot("error")
  })
})
```

- [ ] **Step 4.4: Implement ToolCallCard**

```tsx
// src/features/conversations/components/tool-call-card.tsx
"use client"

import { useState } from "react"
import { Check, ChevronRight, X, Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import {
  getToolPresentation,
} from "../lib/tool-icons"
import type { ToolCallRecord } from "../lib/parse-tool-calls"

export interface ToolCallCardProps {
  call: ToolCallRecord
  className?: string
  /** Default expanded state, otherwise click to expand. */
  defaultExpanded?: boolean
}

export const ToolCallCard = ({
  call,
  className,
  defaultExpanded = false,
}: ToolCallCardProps) => {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const { Icon, label, summary } = getToolPresentation(call.name)

  return (
    <div
      className={cn(
        "rounded-md border border-border/60 bg-card/60 text-sm",
        call.status === "error" && "border-destructive/40 bg-destructive/5",
        className,
      )}
      data-status={call.status}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? "Hide details" : "Show details"}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-90",
          )}
        />
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="font-medium text-foreground/90">{label}</span>
        <span
          className={cn(
            "truncate text-muted-foreground",
            call.status === "running" && "relative",
          )}
        >
          {summary(call.input)}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <StatusBadge status={call.status} />
        </span>
      </button>

      {call.status === "running" && (
        <div
          data-testid="tool-shimmer"
          aria-hidden
          className="h-0.5 w-full overflow-hidden rounded-b-md bg-muted"
        >
          <div className="h-full w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
        </div>
      )}

      {call.status === "error" && call.error && (
        <p className="px-3 pb-2 text-xs text-destructive" role="alert">
          {call.error}
        </p>
      )}

      {expanded && (
        <div className="border-t border-border/60 px-3 py-2 text-xs">
          <Section title="Input">
            <pre className="overflow-x-auto rounded bg-muted/60 p-2 text-[11px] leading-relaxed">
              {safeJson(call.input)}
            </pre>
          </Section>
          {call.output !== undefined && (
            <Section title="Output">
              <pre className="overflow-x-auto rounded bg-muted/60 p-2 text-[11px] leading-relaxed">
                {safeJson(call.output)}
              </pre>
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: ToolCallRecord["status"] }) {
  if (status === "running")
    return (
      <Badge variant="secondary" aria-label="running" className="gap-1">
        <Loader2 className="size-3 animate-spin" aria-hidden />
        running
      </Badge>
    )
  if (status === "completed")
    return (
      <Badge variant="secondary" aria-label="completed" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
        <Check className="size-3" aria-hidden />
        done
      </Badge>
    )
  return (
    <Badge variant="destructive" aria-label="error" className="gap-1">
      <X className="size-3" aria-hidden />
      error
    </Badge>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 last:mb-0">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  )
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}
```

- [ ] **Step 4.5: Add `animate-shimmer` keyframes** (`src/app/globals.css`)

```css
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}
.animate-shimmer { animation: shimmer 1.6s linear infinite; }
```

- [ ] **Step 4.6: Tests pass**

```bash
npm run test:unit -- tool-call-card parse-tool-calls
```

- [ ] **Step 4.7: Commit**

```bash
git add src/features/conversations/lib/parse-tool-calls.ts src/features/conversations/components/tool-call-card.tsx tests/unit/conversations/tool-call-card.test.tsx tests/unit/conversations/parse-tool-calls.test.ts src/app/globals.css
git commit -m "feat(conversations): ToolCallCard with running/completed/error states"
```

---

## Task 5: MessageBubble

**Files:** `src/features/conversations/components/message-bubble.tsx`

Renders one Convex `messages` document. Discriminates on `role` (`user` vs `assistant`) and `status` (`pending` | `streaming` | `processing` | `complete` | `error` — matching sub-plan 01's enum). Renders text, tool calls, status indicator, error state.

- [ ] **Step 5.1: Define props (mirror Convex doc shape)**

```ts
// at top of message-bubble.tsx (no separate types file needed)
import type { Doc } from "../../../../convex/_generated/dataModel"
export type MessageDoc = Doc<"messages">
```

This binds to whatever shape sub-plan 01 lands. Required fields used: `_id`, `role`, `content`, `status`, `toolCalls?: string` (JSON), `errorMessage?: string`, `_creationTime`.

- [ ] **Step 5.2: Failing tests (snapshots + behavior)**

```tsx
// tests/unit/conversations/message-bubble.test.tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { MessageBubble } from "@/features/conversations/components/message-bubble"
import type { MessageDoc } from "@/features/conversations/components/message-bubble"

const baseUser: MessageDoc = {
  _id: "m1" as MessageDoc["_id"],
  _creationTime: Date.now(),
  conversationId: "c1" as MessageDoc["conversationId"],
  role: "user",
  content: "Add a sign-in page",
  status: "complete",
} as MessageDoc

const streamingAssistant: MessageDoc = {
  ...baseUser,
  _id: "m2" as MessageDoc["_id"],
  role: "assistant",
  content: "I'll start by reading the existing layout.\n\n",
  status: "streaming",
  toolCalls: JSON.stringify([
    { id: "t1", name: "read_file", input: { path: "src/app/layout.tsx" }, status: "running" },
  ]),
} as MessageDoc

const errorAssistant: MessageDoc = {
  ...baseUser,
  _id: "m3" as MessageDoc["_id"],
  role: "assistant",
  content: "",
  status: "error",
  errorMessage: "Anthropic returned 429 rate limit. Try again in 60s.",
} as MessageDoc

describe("MessageBubble", () => {
  it("renders user message right-aligned with their text", () => {
    render(<MessageBubble message={baseUser} />)
    expect(screen.getByText("Add a sign-in page")).toBeInTheDocument()
    expect(screen.getByTestId("message-bubble")).toHaveAttribute("data-role", "user")
  })

  it("renders assistant message with markdown and tool call card while streaming", () => {
    render(<MessageBubble message={streamingAssistant} />)
    expect(screen.getByText(/reading the existing layout/i)).toBeInTheDocument()
    expect(screen.getByText(/reading src\/app\/layout\.tsx/i)).toBeInTheDocument()
    expect(screen.getByRole("status", { name: /agent thinking/i })).toBeInTheDocument()
  })

  it("renders error inline when status=error", () => {
    render(<MessageBubble message={errorAssistant} />)
    expect(screen.getByRole("alert")).toHaveTextContent(/rate limit/i)
  })

  it("snapshots", () => {
    expect(render(<MessageBubble message={baseUser} />).asFragment()).toMatchSnapshot("user")
    expect(render(<MessageBubble message={streamingAssistant} />).asFragment()).toMatchSnapshot("streaming")
    expect(render(<MessageBubble message={errorAssistant} />).asFragment()).toMatchSnapshot("error")
  })
})
```

- [ ] **Step 5.3: Implement**

```tsx
// src/features/conversations/components/message-bubble.tsx
"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Bot, User } from "lucide-react"

import { cn } from "@/lib/utils"
import type { Doc } from "../../../../convex/_generated/dataModel"

import { ToolCallCard } from "./tool-call-card"
import { StreamingIndicator } from "./streaming-indicator"
import { ErrorState } from "./error-state"
import { parseToolCalls } from "../lib/parse-tool-calls"

export type MessageDoc = Doc<"messages">

export interface MessageBubbleProps {
  message: MessageDoc
  /** Optional callback for retry on error messages. */
  onRetry?: () => void
  /** Optional callback for "New conversation" action. */
  onNewConversation?: () => void
}

export const MessageBubble = ({
  message,
  onRetry,
  onNewConversation,
}: MessageBubbleProps) => {
  const isUser = message.role === "user"
  const toolCalls = parseToolCalls(message.toolCalls)
  const isStreaming = message.status === "streaming" || message.status === "processing"
  const isError = message.status === "error"

  return (
    <div
      data-testid="message-bubble"
      data-role={message.role}
      data-status={message.status}
      className={cn(
        "flex w-full gap-3 px-3 py-2",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      <Avatar role={message.role} />
      <div className={cn("flex min-w-0 flex-1 flex-col gap-2", isUser && "items-end")}>
        {message.content && (
          <div
            className={cn(
              "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
              isUser
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-foreground",
            )}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none break-words [&_pre]:bg-background/60">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {!isUser && toolCalls.length > 0 && (
          <ul className="flex w-full max-w-[85%] flex-col gap-1.5">
            {toolCalls.map((c) => (
              <li key={c.id}>
                <ToolCallCard call={c} />
              </li>
            ))}
          </ul>
        )}

        {!isUser && isStreaming && (
          <StreamingIndicator className="text-xs text-muted-foreground" />
        )}

        {isError && message.errorMessage && (
          <ErrorState
            message={message.errorMessage}
            onRetry={onRetry}
            onNewConversation={onNewConversation}
            className="max-w-[85%]"
          />
        )}
      </div>
    </div>
  )
}

function Avatar({ role }: { role: MessageDoc["role"] }) {
  const Icon = role === "user" ? User : Bot
  return (
    <div
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full",
        role === "user" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
      )}
    >
      <Icon className="size-4" />
    </div>
  )
}
```

- [ ] **Step 5.4: Tests pass**

```bash
npm run test:unit -- message-bubble
```

- [ ] **Step 5.5: Commit**

```bash
git add src/features/conversations/components/message-bubble.tsx tests/unit/conversations/message-bubble.test.tsx
git commit -m "feat(conversations): MessageBubble with markdown, tool calls, streaming, error"
```

---

## Task 6: ErrorState

**Files:** `src/features/conversations/components/error-state.tsx`, `src/features/conversations/lib/error-classify.ts`

Per Constitution §12.5 the error UI must be **specific** — never "Something went wrong." We classify the `errorMessage` string into a category and pair each with a tailored CTA set.

- [ ] **Step 6.1: Failing test for classifier**

```ts
// tests/unit/conversations/error-classify.test.ts
import { describe, expect, it } from "vitest"
import { classifyError } from "@/features/conversations/lib/error-classify"

describe("classifyError", () => {
  it.each([
    ["Anthropic returned 429 rate limit. Try again in 60s.", "rate_limit"],
    ["E2B sandbox timed out after 300s.", "timeout"],
    ["Sandbox died — process exited 137 (OOM).", "sandbox_dead"],
    ["Loop hit hard iteration limit (50)", "hard_limit"],
    ["Quota exceeded for free tier.", "quota"],
    ["Unknown blowup", "unknown"],
  ])("classifies %s -> %s", (msg, expected) => {
    expect(classifyError(msg).kind).toBe(expected)
  })

  it("returns specific copy for rate limit", () => {
    const c = classifyError("rate limit reached")
    expect(c.title).toMatch(/rate limit/i)
    expect(c.suggestion).toMatch(/wait/i)
  })
})
```

- [ ] **Step 6.2: Implement classifier**

```ts
// src/features/conversations/lib/error-classify.ts
export type ErrorKind =
  | "rate_limit"
  | "timeout"
  | "sandbox_dead"
  | "hard_limit"
  | "quota"
  | "auth"
  | "network"
  | "unknown"

export interface ClassifiedError {
  kind: ErrorKind
  title: string
  suggestion: string
  /** Suggested primary action label. Consumer wires the handler. */
  primaryActionLabel: "Retry" | "New Conversation" | "Upgrade plan" | "Sign in again"
}

const PATTERNS: Array<{ kind: ErrorKind; re: RegExp }> = [
  { kind: "rate_limit", re: /(rate.?limit|429|too many requests)/i },
  { kind: "timeout", re: /(timed out|timeout|deadline exceeded|5 ?min)/i },
  { kind: "sandbox_dead", re: /(sandbox (died|crashed|exited|dead)|exit(ed)? 137|oom)/i },
  { kind: "hard_limit", re: /(hard (iteration|token) limit|150k tokens|50 iterations)/i },
  { kind: "quota", re: /(quota|free tier|usage limit)/i },
  { kind: "auth", re: /(unauthori[sz]ed|401|invalid api key|sign.?in)/i },
  { kind: "network", re: /(network|fetch failed|econnrefused|enotfound|socket)/i },
]

export function classifyError(message: string): ClassifiedError {
  const kind = (PATTERNS.find((p) => p.re.test(message))?.kind ?? "unknown") as ErrorKind
  return { ...COPY[kind], kind }
}

const COPY: Record<ErrorKind, Omit<ClassifiedError, "kind">> = {
  rate_limit: {
    title: "Anthropic rate limit reached",
    suggestion: "Wait about a minute, then retry. Your work is saved.",
    primaryActionLabel: "Retry",
  },
  timeout: {
    title: "The agent timed out",
    suggestion: "Long runs hit a 5-minute ceiling. Try splitting the task into smaller asks.",
    primaryActionLabel: "Retry",
  },
  sandbox_dead: {
    title: "Sandbox crashed",
    suggestion: "We'll spin up a fresh sandbox on retry. Files are safe in Convex.",
    primaryActionLabel: "Retry",
  },
  hard_limit: {
    title: "Loop hit a safety limit",
    suggestion: "The agent burned through its budget. Start a new conversation with a tighter scope.",
    primaryActionLabel: "New Conversation",
  },
  quota: {
    title: "You've used your monthly quota",
    suggestion: "Upgrade to keep building, or wait for next month's reset.",
    primaryActionLabel: "Upgrade plan",
  },
  auth: {
    title: "Authentication failed",
    suggestion: "Your session may have expired. Sign in again.",
    primaryActionLabel: "Sign in again",
  },
  network: {
    title: "Network hiccup",
    suggestion: "Could not reach our backend. Check your connection and retry.",
    primaryActionLabel: "Retry",
  },
  unknown: {
    title: "Something unexpected happened",
    suggestion: "We logged the error. Retry, or report a bug if it keeps happening.",
    primaryActionLabel: "Retry",
  },
}
```

- [ ] **Step 6.3: Failing test for ErrorState**

```tsx
// tests/unit/conversations/error-state.test.tsx
import { render, screen, fireEvent } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ErrorState } from "@/features/conversations/components/error-state"

describe("ErrorState", () => {
  it("shows specific title for rate limit", () => {
    render(<ErrorState message="Anthropic returned 429 rate limit." />)
    expect(screen.getByText(/Anthropic rate limit reached/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
  })

  it("calls onRetry when retry clicked", () => {
    const onRetry = vi.fn()
    render(<ErrorState message="rate limit" onRetry={onRetry} />)
    fireEvent.click(screen.getByRole("button", { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it("shows quota upgrade CTA for quota errors", () => {
    render(<ErrorState message="Quota exceeded for free tier." />)
    expect(screen.getByRole("button", { name: /upgrade/i })).toBeInTheDocument()
  })

  it("renders the original error in details", () => {
    render(<ErrorState message="some technical detail here" />)
    fireEvent.click(screen.getByText(/show technical detail/i))
    expect(screen.getByText(/some technical detail here/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 6.4: Implement ErrorState**

```tsx
// src/features/conversations/components/error-state.tsx
"use client"

import { useState } from "react"
import { AlertTriangle, ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { classifyError } from "../lib/error-classify"

export interface ErrorStateProps {
  message: string
  onRetry?: () => void
  onNewConversation?: () => void
  onUpgrade?: () => void
  onReportBug?: () => void
  className?: string
}

export const ErrorState = ({
  message,
  onRetry,
  onNewConversation,
  onUpgrade,
  onReportBug,
  className,
}: ErrorStateProps) => {
  const [showDetail, setShowDetail] = useState(false)
  const c = classifyError(message)

  return (
    <div
      role="alert"
      className={cn(
        "rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
        <div className="flex-1">
          <p className="font-medium text-destructive">{c.title}</p>
          <p className="mt-0.5 text-muted-foreground">{c.suggestion}</p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {c.primaryActionLabel === "Retry" && onRetry && (
              <Button size="sm" variant="default" onClick={onRetry}>
                Retry
              </Button>
            )}
            {c.primaryActionLabel === "New Conversation" && onNewConversation && (
              <Button size="sm" variant="default" onClick={onNewConversation}>
                New conversation
              </Button>
            )}
            {c.primaryActionLabel === "Upgrade plan" && onUpgrade && (
              <Button size="sm" variant="default" onClick={onUpgrade}>
                Upgrade plan
              </Button>
            )}
            {/* Always-available secondary actions */}
            {c.primaryActionLabel !== "New Conversation" && onNewConversation && (
              <Button size="sm" variant="outline" onClick={onNewConversation}>
                New conversation
              </Button>
            )}
            {onReportBug && (
              <Button size="sm" variant="ghost" onClick={onReportBug}>
                Report bug
              </Button>
            )}
          </div>

          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowDetail((v) => !v)}
            aria-expanded={showDetail}
          >
            <ChevronDown
              className={cn("size-3 transition-transform", showDetail && "rotate-180")}
              aria-hidden
            />
            {showDetail ? "Hide technical detail" : "Show technical detail"}
          </button>
          {showDetail && (
            <pre className="mt-1 overflow-x-auto rounded bg-background/60 p-2 text-[11px] text-muted-foreground">
              {message}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6.5: Tests pass**

```bash
npm run test:unit -- error-classify error-state
```

- [ ] **Step 6.6: Commit**

```bash
git add src/features/conversations/lib/error-classify.ts src/features/conversations/components/error-state.tsx tests/unit/conversations/error-classify.test.ts tests/unit/conversations/error-state.test.tsx
git commit -m "feat(conversations): ErrorState with category-specific copy and CTAs (Constitution §12.5)"
```

---

## Task 7: CancelButton (extracted, polished)

**Files:** `src/features/conversations/components/cancel-button.tsx`

Sub-plan 01 already wired the cancel API endpoint at `/api/messages/cancel` and the existing button's `onClick` calls it. We extract a reusable component and add: visible-only-when-streaming gate, optimistic disable, toast feedback, and a pending micro-animation.

- [ ] **Step 7.1: Failing test**

```tsx
// tests/unit/conversations/cancel-button.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CancelButton } from "@/features/conversations/components/cancel-button"

describe("CancelButton", () => {
  it("renders nothing when status is complete", () => {
    const { container } = render(<CancelButton status="complete" onCancel={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("renders when status is streaming", () => {
    render(<CancelButton status="streaming" onCancel={vi.fn()} />)
    expect(screen.getByRole("button", { name: /stop|cancel/i })).toBeInTheDocument()
  })

  it("disables itself once clicked and calls onCancel", async () => {
    const onCancel = vi.fn().mockResolvedValue(undefined)
    render(<CancelButton status="processing" onCancel={onCancel} />)
    const btn = screen.getByRole("button", { name: /stop|cancel/i })
    fireEvent.click(btn)
    expect(btn).toBeDisabled()
    await waitFor(() => expect(onCancel).toHaveBeenCalledOnce())
  })
})
```

- [ ] **Step 7.2: Implement**

```tsx
// src/features/conversations/components/cancel-button.tsx
"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Square } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type CancelButtonStatus = "pending" | "streaming" | "processing" | "complete" | "error"

export interface CancelButtonProps {
  status: CancelButtonStatus
  onCancel: () => Promise<void> | void
  className?: string
}

const VISIBLE_STATES: ReadonlySet<CancelButtonStatus> = new Set(["streaming", "processing", "pending"])

export const CancelButton = ({ status, onCancel, className }: CancelButtonProps) => {
  const [pending, setPending] = useState(false)
  if (!VISIBLE_STATES.has(status)) return null

  const handleClick = async () => {
    if (pending) return
    setPending(true)
    try {
      await onCancel()
      toast.success("Cancelling agent run", {
        description: "Partial work has been saved.",
      })
    } catch (e) {
      toast.error("Failed to cancel", {
        description: e instanceof Error ? e.message : "Try again",
      })
      setPending(false) // allow retry only on error
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={handleClick}
      disabled={pending}
      aria-label={pending ? "Cancelling" : "Stop agent"}
      className={cn(
        "gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10",
        pending && "opacity-60",
        className,
      )}
    >
      <Square
        className={cn("size-3 fill-current", !pending && "animate-pulse")}
        aria-hidden
      />
      {pending ? "Cancelling…" : "Stop"}
    </Button>
  )
}
```

- [ ] **Step 7.3: Tests pass; commit**

```bash
npm run test:unit -- cancel-button
git add src/features/conversations/components/cancel-button.tsx tests/unit/conversations/cancel-button.test.tsx
git commit -m "feat(conversations): extract CancelButton with toast + auto-disable"
```

---

## Task 8: Refactor ConversationSidebar to use new components

**Files:** `src/features/conversations/components/conversation-sidebar.tsx`

**Important:** Do not rewrite. Modify in place. Preserve existing input/send flow, history scroll, project selector, conversation create. Replace only:
- The custom `Message`/`MessageContent` rendering loop → `<MessageBubble>` per message.
- The inline `LoaderIcon` "Thinking…" block → drop it (StreamingIndicator now lives inside MessageBubble).
- The existing inline cancel button (if present) → `<CancelButton>` extracted.

- [ ] **Step 8.1: Read the current file end-to-end**

```bash
wc -l src/features/conversations/components/conversation-sidebar.tsx
sed -n '1,300p' src/features/conversations/components/conversation-sidebar.tsx
```

Identify these blocks:
1. The `conversationMessages.map(...)` render loop.
2. The "Thinking…" / `isProcessing` indicator.
3. Any existing cancel button onClick handler — preserve the URL it posts to (`/api/messages/cancel`).

- [ ] **Step 8.2: Write the cancel handler once, hoisted**

Inside `ConversationSidebar`, replacing or adding (next to `handleCreateConversation`):

```tsx
const handleCancel = async () => {
  if (!activeConversationId) return
  await ky.post("/api/messages/cancel", {
    json: { conversationId: activeConversationId },
  })
}

const handleRetry = async () => {
  // Resend the last user message; sub-plan 01 already idempotent on dedupe.
  const lastUser = [...(conversationMessages ?? [])].reverse().find((m) => m.role === "user")
  if (!lastUser) return
  setInput(lastUser.content)
}

const handleNewConversation = async () => {
  await handleCreateConversation()
}
```

- [ ] **Step 8.3: Replace the message render loop**

Locate the existing `<ConversationContent>` body and substitute:

```tsx
<ConversationContent>
  {(conversationMessages ?? []).map((m) => (
    <MessageBubble
      key={m._id}
      message={m}
      onRetry={handleRetry}
      onNewConversation={handleNewConversation}
    />
  ))}
  <ConversationScrollButton />
</ConversationContent>
```

Add the import at the top:

```tsx
import { MessageBubble } from "./message-bubble"
import { CancelButton } from "./cancel-button"
```

- [ ] **Step 8.4: Drop the inline "Thinking…" block**

Remove any block that reads like:

```tsx
{isProcessing && (
  <div className="...">
    <LoaderIcon className="animate-spin" />
    <span>Thinking…</span>
  </div>
)}
```

The streaming indicator now lives inside the assistant `MessageBubble` for the in-flight message.

- [ ] **Step 8.5: Mount the cancel button next to the prompt submit**

Inside the existing `<PromptInputFooter>` area, add (typically next to `<PromptInputSubmit>`):

```tsx
<CancelButton
  status={
    isProcessing
      ? "processing"
      : conversationMessages?.some((m) => m.status === "streaming")
        ? "streaming"
        : "complete"
  }
  onCancel={handleCancel}
/>
```

- [ ] **Step 8.6: Remove the now-unused imports**

Delete unused symbols: `Message`, `MessageContent`, `MessageResponse`, `MessageActions`, `MessageAction`, `LoaderIcon` if no other usage. `ky` stays (used by handleCancel).

- [ ] **Step 8.7: Manual smoke test**

```bash
npm run dev
```

Open a project, start a conversation, send a prompt. Expected: assistant bubble appears with bot avatar and `StreamingIndicator`, tool cards stream in as Convex updates, `CancelButton` appears. Click Stop → toast appears, button disables. After completion, button vanishes.

- [ ] **Step 8.8: Commit**

```bash
git add src/features/conversations/components/conversation-sidebar.tsx
git commit -m "refactor(conversations): delegate message rendering to MessageBubble + CancelButton"
```

---

## Task 9: Optimistic mutations in use-files

**Files:** `src/features/projects/hooks/use-files.ts`

Convex's `useMutation(...).withOptimisticUpdate(localStore => ...)` writes to the local query cache synchronously. On server confirmation Convex replaces with truth; on error Convex rolls back automatically (the local mutation entry is removed and queries refresh from server).

Four mutations: `createFile`, `createFolder`, `renameFile`, `deleteFile`. (`updateFile` is a content edit — typically debounced by the editor; sub-plan 01 already optimistic-updates that one. We'll add optimistic updates here for the four explicitly listed.)

The existing `getFolderContents` query is the cache target; updating it locally is what makes the file-tree feel instant.

- [ ] **Step 9.1: Inspect current Convex `files` query shapes**

```bash
sed -n '1,200p' convex/files.ts
```

Confirm `getFolderContents` returns `Doc<"files">[]` filtered by `projectId` + `parentId`. Confirm the mutation arg shapes for `createFile`, `createFolder`, `renameFile`, `deleteFile`.

- [ ] **Step 9.2: Failing test (optimistic insert + rollback on error)**

```tsx
// tests/unit/projects/use-files-optimistic.test.tsx
import { renderHook, act, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ConvexReactClient } from "convex/react"

import { withConvexTestProvider, mockConvexQuery, mockConvexMutationOnce } from "../../helpers/convex-test-provider"
import { useCreateFile, useFolderContents } from "@/features/projects/hooks/use-files"

describe("use-files optimistic mutations", () => {
  it("inserts the new file into getFolderContents synchronously", async () => {
    const projectId = "p1" as any
    mockConvexQuery("files.getFolderContents", { projectId, parentId: undefined }, [])
    mockConvexMutationOnce("files.createFile", { _id: "f-real" })

    const { result } = renderHook(
      () => ({
        contents: useFolderContents({ projectId }),
        create: useCreateFile(),
      }),
      { wrapper: withConvexTestProvider() },
    )

    await act(async () => {
      const promise = result.current.create({ projectId, name: "page.tsx", content: "" })
      // Optimistic write happened synchronously
      expect(result.current.contents?.some((f) => f.name === "page.tsx")).toBe(true)
      await promise
    })
  })

  it("rolls back on server error", async () => {
    const projectId = "p1" as any
    mockConvexQuery("files.getFolderContents", { projectId, parentId: undefined }, [])
    mockConvexMutationOnce("files.createFile", new Error("permission denied"))

    const { result } = renderHook(
      () => ({
        contents: useFolderContents({ projectId }),
        create: useCreateFile(),
      }),
      { wrapper: withConvexTestProvider() },
    )

    await act(async () => {
      await expect(
        result.current.create({ projectId, name: "page.tsx", content: "" }),
      ).rejects.toThrow(/permission denied/)
    })

    await waitFor(() => {
      expect(result.current.contents?.some((f) => f.name === "page.tsx")).toBe(false)
    })
  })
})
```

(See Task 12 for `convex-test-provider.tsx` helper implementation.)

- [ ] **Step 9.3: Implement the four optimistic mutations**

```ts
// src/features/projects/hooks/use-files.ts
import { useMutation, useQuery } from "convex/react"
import { Id } from "../../../../convex/_generated/dataModel"
import { api } from "../../../../convex/_generated/api"

export const useFile = (fileId: Id<"files"> | null) =>
  useQuery(api.files.getFile, fileId ? { id: fileId } : "skip")

export const useFilePath = (fileId: Id<"files"> | null) =>
  useQuery(api.files.getFilePath, fileId ? { id: fileId } : "skip")

export const useUpdateFile = () => useMutation(api.files.updateFile)

export const useCreateFile = () =>
  useMutation(api.files.createFile).withOptimisticUpdate((localStore, args) => {
    const key = { projectId: args.projectId, parentId: args.parentId }
    const current = localStore.getQuery(api.files.getFolderContents, key)
    if (current === undefined) return
    const optimistic = {
      _id: `optimistic_${crypto.randomUUID()}` as Id<"files">,
      _creationTime: Date.now(),
      projectId: args.projectId,
      parentId: args.parentId,
      name: args.name,
      type: "file" as const,
      content: args.content ?? "",
      updatedBy: "user" as const,
      updatedAt: Date.now(),
    }
    localStore.setQuery(api.files.getFolderContents, key, [...current, optimistic])
  })

export const useCreateFolder = () =>
  useMutation(api.files.createFolder).withOptimisticUpdate((localStore, args) => {
    const key = { projectId: args.projectId, parentId: args.parentId }
    const current = localStore.getQuery(api.files.getFolderContents, key)
    if (current === undefined) return
    const optimistic = {
      _id: `optimistic_${crypto.randomUUID()}` as Id<"files">,
      _creationTime: Date.now(),
      projectId: args.projectId,
      parentId: args.parentId,
      name: args.name,
      type: "folder" as const,
      updatedBy: "user" as const,
      updatedAt: Date.now(),
    }
    localStore.setQuery(api.files.getFolderContents, key, [...current, optimistic])
  })

export const useRenameFile = () =>
  useMutation(api.files.renameFile).withOptimisticUpdate((localStore, args) => {
    // We do not know the parentId here without a lookup, so iterate every cached folder query
    // and patch wherever the file appears. This is O(folders) — fine for v1.
    for (const q of localStore.getAllQueries(api.files.getFolderContents)) {
      if (q.value === undefined) continue
      const idx = q.value.findIndex((f) => f._id === args.id)
      if (idx === -1) continue
      const next = [...q.value]
      next[idx] = { ...next[idx], name: args.name, updatedAt: Date.now(), updatedBy: "user" }
      localStore.setQuery(api.files.getFolderContents, q.args, next)
    }
  })

export const useDeleteFile = () =>
  useMutation(api.files.deleteFile).withOptimisticUpdate((localStore, args) => {
    for (const q of localStore.getAllQueries(api.files.getFolderContents)) {
      if (q.value === undefined) continue
      if (!q.value.some((f) => f._id === args.id)) continue
      localStore.setQuery(
        api.files.getFolderContents,
        q.args,
        q.value.filter((f) => f._id !== args.id),
      )
    }
  })

export const useFolderContents = ({
  projectId,
  parentId,
  enabled = true,
}: {
  projectId: Id<"projects">
  parentId?: Id<"files">
  enabled?: boolean
}) =>
  useQuery(
    api.files.getFolderContents,
    enabled ? { projectId, parentId } : "skip",
  )
```

> Note on `getAllQueries`: this is the documented Convex API on `OptimisticLocalStore`. If the codebase pins an older Convex version that lacks it, fall back to passing the known `parentId` through the mutation args (modify `convex/files.ts` to accept `parentId` on rename/delete) and patch only that single query key. Verify before implementing.

- [ ] **Step 9.4: Tests pass**

```bash
npm run test:unit -- use-files-optimistic
```

- [ ] **Step 9.5: Commit**

```bash
git add src/features/projects/hooks/use-files.ts tests/unit/projects/use-files-optimistic.test.tsx
git commit -m "feat(files): optimistic create/createFolder/rename/delete mutations"
```

---

## Task 10: useRecentlyChangedFiles hook

**Files:** `src/features/projects/hooks/use-recently-changed-files.ts`

Subscribes to `getFolderContents` (or a dedicated `getRecentFileUpdates` query — see Step 10.1) and returns a `Set<Id<"files">>` of files whose `updatedBy === "agent"` and `updatedAt` is within the last `N` ms (default 3000). Auto-evicts entries via a ticking timer.

- [ ] **Step 10.1: Decide query strategy**

Two options:

**A. Reuse `getFolderContents`** — the file tree already subscribes; we just slice. Simple. Works only for files in currently expanded folders.

**B. Add a project-wide query `api.files.getRecentlyAgentTouched`** that filters server-side `WHERE updatedBy = 'agent' AND updatedAt > now - 60s` ordered desc, limit 50.

Choose **B** — it covers files whose folders aren't currently open in the tree, and the file tree component can still consume the same set. Add the Convex query in this task.

- [ ] **Step 10.2: Add Convex query**

```ts
// convex/files.ts (append)
export const getRecentlyAgentTouched = query({
  args: { projectId: v.id("projects"), sinceMs: v.optional(v.number()) },
  handler: async (ctx, { projectId, sinceMs }) => {
    const cutoff = Date.now() - (sinceMs ?? 60_000)
    return await ctx.db
      .query("files")
      .withIndex("by_project_updated", (q) => q.eq("projectId", projectId).gt("updatedAt", cutoff))
      .filter((q) => q.eq(q.field("updatedBy"), "agent"))
      .order("desc")
      .take(50)
  },
})
```

If the index `by_project_updated` does not exist, add it to `convex/schema.ts`:

```ts
files: defineTable({ /* …existing… */ })
  .index("by_project_updated", ["projectId", "updatedAt"])
```

(If sub-plan 01 already added this index, skip the schema change.)

- [ ] **Step 10.3: Failing test for the hook**

```tsx
// tests/unit/projects/use-recently-changed-files.test.tsx
import { renderHook, act } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

import { withConvexTestProvider, mockConvexQuery } from "../../helpers/convex-test-provider"
import { useRecentlyChangedFiles } from "@/features/projects/hooks/use-recently-changed-files"

describe("useRecentlyChangedFiles", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("returns ids of files updated by agent within the window", () => {
    const projectId = "p1" as any
    const now = Date.now()
    mockConvexQuery("files.getRecentlyAgentTouched", { projectId }, [
      { _id: "f1", updatedAt: now, updatedBy: "agent" },
      { _id: "f2", updatedAt: now - 10_000, updatedBy: "agent" },
    ])

    const { result } = renderHook(() => useRecentlyChangedFiles(projectId, 3000), {
      wrapper: withConvexTestProvider(),
    })

    expect(result.current.has("f1")).toBe(true)
    expect(result.current.has("f2")).toBe(false)
  })

  it("evicts an id after the window elapses", () => {
    const projectId = "p1" as any
    const now = Date.now()
    mockConvexQuery("files.getRecentlyAgentTouched", { projectId }, [
      { _id: "f1", updatedAt: now, updatedBy: "agent" },
    ])
    const { result } = renderHook(() => useRecentlyChangedFiles(projectId, 3000), {
      wrapper: withConvexTestProvider(),
    })
    expect(result.current.has("f1")).toBe(true)
    act(() => { vi.advanceTimersByTime(3500) })
    expect(result.current.has("f1")).toBe(false)
  })
})
```

- [ ] **Step 10.4: Implement the hook**

```ts
// src/features/projects/hooks/use-recently-changed-files.ts
import { useQuery } from "convex/react"
import { useEffect, useMemo, useState } from "react"

import { Id } from "../../../../convex/_generated/dataModel"
import { api } from "../../../../convex/_generated/api"

/**
 * Returns the set of file ids updated by the agent within the last `windowMs` ms.
 * Re-evaluates on every Convex update and on a 500ms tick to evict stale entries.
 */
export function useRecentlyChangedFiles(
  projectId: Id<"projects"> | null,
  windowMs = 3000,
): ReadonlySet<Id<"files">> {
  const recent = useQuery(
    api.files.getRecentlyAgentTouched,
    projectId ? { projectId, sinceMs: windowMs * 4 } : "skip",
  )
  const [, setTick] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 500)
    return () => clearInterval(t)
  }, [])

  return useMemo(() => {
    const cutoff = Date.now() - windowMs
    const s = new Set<Id<"files">>()
    for (const f of recent ?? []) {
      if (f.updatedAt > cutoff && f.updatedBy === "agent") s.add(f._id as Id<"files">)
    }
    return s
  }, [recent, windowMs])
}
```

- [ ] **Step 10.5: Tests pass; commit**

```bash
npm run test:unit -- use-recently-changed-files
git add src/features/projects/hooks/use-recently-changed-files.ts convex/files.ts convex/schema.ts tests/unit/projects/use-recently-changed-files.test.tsx
git commit -m "feat(files): useRecentlyChangedFiles + by_project_updated index"
```

---

## Task 11: File-tree pulse animation wiring

**Files:** `src/features/projects/components/file-explorer/tree.tsx`, `tree-item-wrapper.tsx`

The pulse class (`animate-pulse-agent`) was added to `globals.css` in Task 1. Apply it to the tree item wrapper when its file id is in the recently-changed set.

- [ ] **Step 11.1: Read both files to find props plumbing**

```bash
sed -n '1,160p' src/features/projects/components/file-explorer/tree.tsx
sed -n '1,160p' src/features/projects/components/file-explorer/tree-item-wrapper.tsx
```

Identify how the current tree threads `projectId` and how individual items receive their file `Id`.

- [ ] **Step 11.2: Subscribe at the tree root, prop-drill the set**

In `tree.tsx`, near the component body:

```tsx
import { useRecentlyChangedFiles } from "@/features/projects/hooks/use-recently-changed-files"
// …
const recentlyChanged = useRecentlyChangedFiles(projectId)
```

Pass `recentlyChanged` down to each rendered `<TreeItemWrapper>`. If the tree is recursive, thread it through the recursive prop.

- [ ] **Step 11.3: Apply the class in the wrapper**

In `tree-item-wrapper.tsx`:

```tsx
import { cn } from "@/lib/utils"

interface TreeItemWrapperProps {
  // …existing props
  recentlyChanged?: ReadonlySet<Id<"files">>
  fileId?: Id<"files">
}

// In the JSX:
<div
  className={cn(
    /* …existing classes… */,
    fileId && recentlyChanged?.has(fileId) && "animate-pulse-agent rounded-sm",
  )}
>
  {/* …existing children… */}
</div>
```

- [ ] **Step 11.4: Manual smoke**

```bash
npm run dev
```

Send a prompt that triggers `write_file`. Watch the file tree node pulse for ~2.4s after the agent completes its `appendToolResult` for that path. Verify a user-initiated rename does **not** pulse (because `updatedBy === "user"`).

- [ ] **Step 11.5: Commit**

```bash
git add src/features/projects/components/file-explorer/
git commit -m "feat(files): pulse tree node when agent recently touched it"
```

---

## Task 12: Tests — snapshot + behavior + rollback

The per-task tests above already cover most of the surface. This task adds the shared Convex test helper, runs the full suite, captures snapshots, and pins coverage.

**Files:** `tests/helpers/convex-test-provider.tsx`

- [ ] **Step 12.1: Implement the Convex test provider**

We do not run a real Convex dev backend in unit tests. Instead we mock `useQuery`/`useMutation` via `vi.mock` of `convex/react`.

```tsx
// tests/helpers/convex-test-provider.tsx
import * as React from "react"
import { vi } from "vitest"

type QueryKey = string // "files.getFolderContents"
type ArgsKey = string

const queryStore = new Map<QueryKey, Map<ArgsKey, unknown>>()
const mutationQueue = new Map<QueryKey, Array<unknown | Error>>()

function key(name: QueryKey, args: unknown): ArgsKey {
  return JSON.stringify(args ?? null)
}

export function mockConvexQuery(name: QueryKey, args: unknown, value: unknown) {
  if (!queryStore.has(name)) queryStore.set(name, new Map())
  queryStore.get(name)!.set(key(name, args), value)
}

export function mockConvexMutationOnce(name: QueryKey, result: unknown | Error) {
  if (!mutationQueue.has(name)) mutationQueue.set(name, [])
  mutationQueue.get(name)!.push(result)
}

vi.mock("convex/react", () => {
  return {
    useQuery: (ref: { _path?: string } | string, args: unknown, _opts?: unknown) => {
      const name = typeof ref === "string" ? ref : (ref._path ?? "")
      if (args === "skip") return undefined
      const m = queryStore.get(name)
      return m?.get(key(name, args)) ?? undefined
    },
    useMutation: (ref: { _path?: string } | string) => {
      const name = typeof ref === "string" ? ref : (ref._path ?? "")
      const fn = (async (_args: unknown) => {
        const next = mutationQueue.get(name)?.shift()
        if (next instanceof Error) throw next
        return next
      }) as ((args: unknown) => Promise<unknown>) & {
        withOptimisticUpdate: (cb: unknown) => typeof fn
      }
      fn.withOptimisticUpdate = () => fn
      return fn
    },
    ConvexProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    ConvexReactClient: class {},
  }
})

vi.mock("../../convex/_generated/api", () => {
  // Generated api objects carry _path strings on each accessor.
  // Build a Proxy that returns `{ _path: "<table>.<fn>" }` for any access.
  const make = (prefix: string): unknown =>
    new Proxy(
      {},
      {
        get: (_t, fn: string) =>
          prefix === "" ? make(fn) : { _path: `${prefix}.${fn}` },
      },
    )
  return { api: make("") }
}, { virtual: true })

export function withConvexTestProvider() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <>{children}</>
  }
}
```

The path mocked depends on the project's `tsconfig` "paths" — adjust the relative path if `convex/_generated/api` resolves elsewhere.

- [ ] **Step 12.2: Run the full unit suite**

```bash
npm run test:unit -- --run
```

Expected: every test in `tests/unit/conversations/**` and `tests/unit/projects/**` passes.

- [ ] **Step 12.3: Commit snapshots**

```bash
git add tests/
git commit -m "test(streaming-ui): full suite + Convex test provider + snapshots"
```

- [ ] **Step 12.4: Coverage check**

```bash
npm run test:unit:coverage
```

Acceptance: per-file ≥ 70% on `src/features/conversations/components/*.tsx`, `src/features/conversations/lib/*.ts`, `src/features/projects/hooks/use-files.ts`, `src/features/projects/hooks/use-recently-changed-files.ts`. If any file falls short, add a focused test before moving on.

---

## Task 13: Manual smoke checklist + Phase 1 DoD verification

This task is a checkpoint, not new code. Run after Task 12 is green.

- [ ] **Step 13.1: End-to-end scenario A — happy path**

Send: "Add a hello-world page under /about". Expect:
1. User bubble appears immediately (right-aligned, primary background).
2. Within 2s, assistant bubble appears with bot avatar + StreamingIndicator.
3. As the agent runs, ToolCallCards appear sequentially: `read_file → list_files → write_file`.
4. Each card transitions: running (shimmer + spinner) → completed (green check).
5. File tree pulses on `src/app/about/page.tsx` for ~2.4s.
6. Markdown text streams in above the tool cards.
7. Streaming indicator disappears when the assistant message reaches `status=complete`.
8. CancelButton vanishes when complete.

- [ ] **Step 13.2: End-to-end scenario B — cancel mid-run**

Send a long task. After 2s, click Stop. Expect:
1. Toast: "Cancelling agent run — Partial work has been saved."
2. Button immediately disabled with "Cancelling…".
3. Inngest function exits within ~1s (sub-plan 01 contract).
4. The in-flight tool call card transitions to `error` with "Cancelled by user" text.
5. Subsequent prompt is accepted normally.

- [ ] **Step 13.3: End-to-end scenario C — error surface**

Force an error (e.g., temporarily stub the Anthropic call to throw 429). Expect:
1. Assistant bubble shows ErrorState with title "Anthropic rate limit reached".
2. Suggestion: "Wait about a minute, then retry. Your work is saved."
3. Retry button visible. New conversation outlined.
4. "Show technical detail" reveals the raw error string.

- [ ] **Step 13.4: Optimistic mutation manual test**

In the file tree, right-click → New file. Type a name, hit enter. Expect: file appears **immediately** (before round-trip). Reload the page — file persists. Then trigger a server-side rejection (manually delete with concurrent rename in the dashboard) and verify the local optimistic state rolls back.

- [ ] **Step 13.5: Phase 1 DoD line items covered by this sub-plan**

From `ROADMAP.md` §7 Phase 1:
- [x] "Tool call cards visible in conversation UI as agent works" — Task 4, 5
- [x] "Cancel button works mid-run; partial work preserved" — Task 7, 8
- [x] No regression on Cmd+K / ghost text — Tasks 8 only swaps message rendering, not editor

- [ ] **Step 13.6: Cross-link & PR**

In the PR description, link this sub-plan and call out:
- New components live under `src/features/conversations/components/`
- New library helpers under `src/features/conversations/lib/`
- The 4 optimistic mutations satisfy the existing `// TODO: Add optimistic mutation` markers
- The `pulse-agent` keyframe is intentionally subtle — designers can tune duration/iteration count in `globals.css`

- [ ] **Step 13.7: Final commit + tag**

```bash
git commit --allow-empty -m "chore(streaming-ui): sub-plan 04 complete"
```

---

## Appendix A — Component contract summary

| Component | Reads from | Writes to | Side-effects |
|---|---|---|---|
| `MessageBubble` | `Doc<"messages">` prop | — | None (pure) |
| `ToolCallCard` | `ToolCallRecord` prop | local `expanded` state | None |
| `StreamingIndicator` | label prop | — | None |
| `ErrorState` | `message` prop, classifier | local `showDetail` state | Calls `onRetry` / `onNewConversation` / `onUpgrade` / `onReportBug` |
| `CancelButton` | `status` prop | local `pending` state | `sonner` toast, calls `onCancel` |
| `useRecentlyChangedFiles` | `api.files.getRecentlyAgentTouched` | — | 500ms `setInterval` (cleared on unmount) |
| `useCreateFile` (and 3 siblings) | — | `api.files.getFolderContents` cache (optimistic) | Calls Convex mutation |

Every component above is a default export-free named export. Every hook returns a referentially stable value across re-renders unless the underlying data changes (verified by the snapshot tests, which would fail on any non-deterministic render).

## Appendix B — Visual design notes (non-binding, for reviewer judgement)

- **Avatar size 28px (`size-7`)** — matches Tailwind 4 default chip scale and aligns with `prose-sm` line height.
- **Bubble max-width 85%** — leaves room for the avatar and a comfortable indent on both sides without pinning text to the edges.
- **`prose-sm` for assistant markdown** — gives consistent spacing for headings, lists, and code blocks. The `[&_pre]:bg-background/60` override ensures fenced code blocks don't visually compete with the bubble surface.
- **`Loader2` (lucide) on running badge, `Check` on completed, `X` on error** — these are the conventional shadcn affordances; do not substitute custom icons for these three states.
- **Pulse uses `color-mix(in oklab, var(--color-primary) 18%, transparent)`** — Tailwind 4 OKLab gives perceptual smoothness across themes. If `--color-primary` is not defined in the theme, the keyframe degrades gracefully to a near-no-op.
- **CancelButton placement** — to the *left* of the submit button so it sits closer to the conversation pane (the agent context) rather than appearing as another submission affordance.

## Appendix C — Why TDD matters here specifically

This sub-plan is unusually amenable to TDD because every component is either pure (props in, JSX out) or mocks cleanly through the Convex test provider. The natural temptation when building streaming UI is to spin up the dev server, send a real prompt, and eyeball the result. Resist this. Real streaming is non-deterministic — Anthropic's token rate varies, E2B's tool-call latency varies, and you will wear out the patience of the test loop. Snapshot the discrete states (`running`, `completed`, `error`) and behavior-test the transitions. Reserve the dev-server smoke (Task 13) for verification, not for feedback during build.

A second reason: the four optimistic mutations are exactly the kind of code that *looks* trivial and silently fails on rollback. The behavior test in Task 9 (`rolls back on server error`) is the single most important test in this sub-plan. If it ever flakes or is skipped, expect production reports of "I created a file and it disappeared" or "I deleted a file and it came back."

## Appendix D — What this sub-plan does **not** do

- It does not change the Convex schema except to ensure the `by_project_updated` index on `files` exists (idempotent — sub-plan 01 may already have added it).
- It does not change the Inngest function or the agent loop — those are sub-plan 01's job.
- It does not change `/api/messages/cancel` — sub-plan 01 owns that endpoint; we only call it.
- It does not modify the Monaco/CodeMirror editor or the live preview iframe — out of scope.
- It does not introduce any client-side AI calls (Article III §3.7 forbids them).
- It does not add diff visualization between agent edits (that's parking-lot O-012, post-v1).

## Open questions (must be resolved before merge)

1. **`messages.toolCalls` shape** — Sub-plan 01 documented this as JSON-string. If sub-plan 01 actually lands the field as a Convex `v.array(v.object({...}))` instead, swap `parseToolCalls(message.toolCalls)` for the array directly and delete `parse-tool-calls.ts`. Verify in `convex/schema.ts` before merging Task 4.
2. **`updatedBy` field on `files`** — Task 10/11 assume `updatedBy: "agent" | "user"`. Sub-plan 01 must add this; if naming differs (e.g. `updatedByAgent: boolean`), adapt in `getRecentlyAgentTouched` and the hook.
3. **`OptimisticLocalStore.getAllQueries`** — Verify available in installed Convex version. If not, fall back to passing parent ids through mutation args (single-query patches only).
4. **Toast library** — `sonner` is already imported in `conversation-sidebar.tsx`. Confirmed; no install needed.
