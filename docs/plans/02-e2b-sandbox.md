# Sub-Plan 02 — E2B Sandbox

> **Authority:** Derives from `docs/CONSTITUTION.md` (esp. Articles VI §6.2, X, XIII, XIV) and `docs/ROADMAP.md` Phase 1.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement task-by-task. Steps use checkbox (`- [ ]`) syntax. Every code-introducing step is preceded by a failing-test step (TDD).

**Goal:** Build the `SandboxProvider` abstraction (Constitution §6.2) and a complete `E2BSandboxProvider` implementation that wraps `@e2b/code-interpreter`. Provide a sandbox lifecycle module that provisions sandboxes on demand, performs a full Convex→E2B re-sync of project files, boots `npm install` and `npm run dev`, captures the public preview URL, and reconciles drift after expiry. Surface sandbox status and the live preview iframe to the user. All writes are mediated by the singleton so that sub-plan 01's `ToolExecutor` only needs to import the singleton — never the concrete class.

**Architecture:** `ToolExecutor` (sub-plan 01) → `sandboxProvider` (singleton) → `E2BSandboxProvider` → `@e2b/code-interpreter` SDK → Firecracker microVM. A separate `lifecycle.ts` orchestrates `ensureSandbox(projectId)`: it queries Convex for the cached `sandboxId`, asks the provider `isAlive`, and either reuses the existing sandbox or provisions a new one with full re-sync. An Inngest `syncFile` function listens for `file/changed` events emitted when a user types in CodeMirror and propagates the change to E2B (Convex remains source of truth — the sync is a projection per Article X §10.1). On the client, a `<PreviewPane>` component renders the iframe and a `<SandboxStatusBadge>` reflects `projects.sandboxLastAlive`. The whole subsystem treats the sandbox as ephemeral — losing it loses zero work because Convex is the source of truth (Article X §10.4).

**Tech Stack:** `@e2b/code-interpreter` (latest, installed by sub-plan 01 Task 2), `convex` (existing), `inngest` (existing, HTTP handler from sub-plan 01 Task 1), `vitest` (configured in sub-plan 01 Task 2), `@testing-library/react` (added here for the preview pane test), React 19 + Next.js 16 (existing), Allotment (already in package.json — used to add the third pane).

**Phase:** 1 — Functional Core (Days 1-3 of 17-day plan, runs in parallel with sub-plan 01 — see ROADMAP.md §8 parallelization map).

**Constitution articles you must re-read before starting:**
- Article VI §6.2 (`SandboxProvider` interface) — verbatim shape of the contract
- Article VI §6.3 (Singleton pattern) — the import surface for the rest of the codebase
- Article X (Consistency Model) — Convex first, E2B second; full re-sync on restart; reconciliation flag semantics
- Article IX (File Safety Policy) — the sandbox honours the same locked / readOnly / writable rules at the executor layer; the provider itself is policy-free
- Article XIII §13.6 (Abuse prevention) — sandbox CPU/memory ceilings; `FORBIDDEN_COMMAND_PATTERNS`
- Article XIV §14.1, §14.5 (Performance budgets) — sandbox provision + re-sync targets
- Article XV §15.3 (Metrics) — `sandbox.create.duration_ms`, `sandbox.write_file.duration_ms`
- Article XIX §19.2 Step 5 (Migration order) — this sub-plan IS Step 5, then expands into lifecycle (Step 6/7 dependencies)

---

## Table of Contents

- [File Structure](#file-structure)
- [Task 1: SandboxProvider Interface and Types](#task-1-sandboxprovider-interface-and-types)
- [Task 2: Mock SandboxProvider Test Helper](#task-2-mock-sandboxprovider-test-helper)
- [Task 3: E2BSandboxProvider — Failing Tests First](#task-3-e2bsandboxprovider--failing-tests-first)
- [Task 4: E2BSandboxProvider — Implementation](#task-4-e2bsandboxprovider--implementation)
- [Task 5: Singleton Export](#task-5-singleton-export)
- [Task 6: Forbidden Command Pattern Enforcement](#task-6-forbidden-command-pattern-enforcement)
- [Task 7: Schema Additions for Sandbox State](#task-7-schema-additions-for-sandbox-state)
- [Task 8: Convex Mutations and Queries for Sandbox State](#task-8-convex-mutations-and-queries-for-sandbox-state)
- [Task 9: Sandbox Lifecycle — Failing Tests First](#task-9-sandbox-lifecycle--failing-tests-first)
- [Task 10: Sandbox Lifecycle — Implementation](#task-10-sandbox-lifecycle--implementation)
- [Task 11: Inngest ensureSandbox Function](#task-11-inngest-ensuresandbox-function)
- [Task 12: Inngest syncFile Function](#task-12-inngest-syncfile-function)
- [Task 13: File-Change Event Emission Hook](#task-13-file-change-event-emission-hook)
- [Task 14: Preview Iframe Component](#task-14-preview-iframe-component)
- [Task 15: Sandbox Status Badge](#task-15-sandbox-status-badge)
- [Task 16: useSandbox Client Hook](#task-16-usesandbox-client-hook)
- [Task 17: Project Layout Integration](#task-17-project-layout-integration)
- [Task 18: ToolExecutor Wiring](#task-18-toolexecutor-wiring)
- [Task 19: End-to-End Smoke Test](#task-19-end-to-end-smoke-test)
- [Task 20: Documentation and Constitutional Review](#task-20-documentation-and-constitutional-review)
- [Self-Review Checklist](#self-review-checklist)
- [Deferred to Other Sub-Plans](#deferred-to-other-sub-plans)

---

## File Structure

### Files to create

```
src/lib/sandbox/types.ts                                  ← NEW: SandboxProvider interface + types
src/lib/sandbox/e2b-provider.ts                           ← NEW: E2BSandboxProvider impl
src/lib/sandbox/index.ts                                  ← NEW: singleton export
src/lib/sandbox/lifecycle.ts                              ← NEW: ensureSandbox, syncProjectFiles, bootApp
src/lib/sandbox/forbidden-commands.ts                     ← NEW: deny-list patterns
src/lib/sandbox/path-utils.ts                             ← NEW: POSIX path helpers + parent dir creation

src/features/sandbox/inngest/ensure-sandbox.ts            ← NEW: Inngest wrapper for ensureSandbox
src/features/sandbox/inngest/sync-file.ts                 ← NEW: Inngest "file/changed" handler
src/features/sandbox/components/preview-pane.tsx          ← NEW: live preview iframe
src/features/sandbox/components/sandbox-status.tsx        ← NEW: status badge
src/features/sandbox/hooks/use-sandbox.ts                 ← NEW: client-side query + ensure trigger

tests/unit/sandbox/e2b-provider.test.ts                   ← NEW: provider unit tests w/ E2B SDK mocked
tests/unit/sandbox/forbidden-commands.test.ts             ← NEW
tests/unit/sandbox/path-utils.test.ts                     ← NEW
tests/unit/sandbox/lifecycle.test.ts                      ← NEW: ensureSandbox scenarios
tests/unit/sandbox/mock-sandbox-provider.ts               ← NEW: shared MockSandboxProvider helper
```

### Files to modify

```
convex/schema.ts                                          ← Add sandboxId/sandboxLastAlive/sandboxNeedsResync to projects
convex/projects.ts                                        ← Add setSandbox / clearSandbox / markNeedsResync mutations + getSandbox query
convex/files.ts                                           ← Emit "file/changed" Inngest event on user-origin write (Task 13)
src/app/api/inngest/route.ts                              ← Register ensureSandbox + syncFile functions
src/lib/tools/executor.ts                                 ← Replace stub sandbox calls with `sandboxProvider` (Task 18)
src/features/projects/components/project-id-layout.tsx    ← Add third pane: PreviewPane
src/features/projects/components/project-id-view.tsx      ← Mount useSandbox + SandboxStatusBadge
.env.example                                              ← Add E2B_API_KEY (sub-plan 01 may already include)
```

---

## Task 1: SandboxProvider Interface and Types

**Why first:** Sub-plan 01's `ToolExecutor` already imports `SandboxProvider` from `@/lib/sandbox/types`. Until this file exists, sub-plan 01 has a broken type import. This is the unblock.

**Files:**
- Create: `src/lib/sandbox/types.ts`

- [ ] **Step 1.1: Author the interface verbatim from CONSTITUTION §6.2**

The interface shape is constitutionally locked. Do not invent additional methods. Do not omit any. Per CONSTITUTION §6.2 rule 1, no method names a vendor.

```typescript
// src/lib/sandbox/types.ts

/**
 * SandboxProvider — the abstraction between Polaris and any cloud sandbox.
 * Locked by CONSTITUTION §6.2. Adding a method requires Constitutional amendment.
 *
 * Implementation rules (CONSTITUTION §6.2):
 *  1. Provider-agnostic. No method references E2B/Northflank/etc.
 *  2. All paths are POSIX-style ("/", not "\\").
 *  3. writeFile creates parent directories as needed.
 *  4. exec is synchronous; execDetached is for long-running processes.
 *  5. getPreviewUrl returns an immediately-reachable URL.
 *  6. isAlive is fast (<500ms). Used on every project open.
 *  7. The provider never reads or writes Convex.
 *  8. Adding a new provider is one file plus configuration.
 */

export type SandboxTemplate = "nextjs-supabase" | "nextjs" | "node" | "python"

export interface SandboxOptions {
  /** Sandbox lifetime; default 24h (24 * 60 * 60 * 1000). */
  timeoutMs?: number
  /** Memory; default "512mb". */
  ram?: "512mb" | "2gb" | "8gb"
  /** Sandbox tags for observability. */
  metadata?: Record<string, string>
}

export interface SandboxHandle {
  id: string
  createdAt: number
}

export interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number
  durationMs: number
}

export interface ExecOptions {
  cwd?: string
  timeoutMs?: number
}

export interface SandboxProvider {
  readonly name: string

  create(template: SandboxTemplate, opts: SandboxOptions): Promise<SandboxHandle>

  writeFile(id: string, path: string, content: string): Promise<void>
  readFile(id: string, path: string): Promise<string>
  listFiles(id: string, dir: string): Promise<string[]>
  deleteFile(id: string, path: string): Promise<void>

  exec(id: string, cmd: string, opts?: ExecOptions): Promise<ExecResult>

  /** Long-running command (e.g., npm run dev). Returns immediately. */
  execDetached(id: string, cmd: string, opts?: { cwd?: string }): Promise<{ pid: number }>

  /** Public URL for a port inside the sandbox. */
  getPreviewUrl(id: string, port: number): Promise<string>

  isAlive(id: string): Promise<boolean>
  kill(id: string): Promise<void>
}
```

- [ ] **Step 1.2: Verify typecheck**

```bash
npm run typecheck
```

Expected: passes. Sub-plan 01's executor stub now resolves its `import type { SandboxProvider } from "@/lib/sandbox/types"`.

- [ ] **Step 1.3: Commit**

```bash
git add src/lib/sandbox/types.ts
git commit -m "feat(sandbox): add SandboxProvider interface (CONSTITUTION §6.2)"
```

---

## Task 2: Mock SandboxProvider Test Helper

**Why now:** Per CONSTITUTION §16.5 we maintain a `MockSandboxProvider` for unit-testing higher layers (agent runner, tool executor, lifecycle). Building it before the real provider establishes the contract our real provider must satisfy.

**Files:**
- Create: `tests/unit/sandbox/mock-sandbox-provider.ts`

- [ ] **Step 2.1: Implement an in-memory mock that obeys the interface**

```typescript
// tests/unit/sandbox/mock-sandbox-provider.ts
import type {
  SandboxProvider,
  SandboxTemplate,
  SandboxOptions,
  SandboxHandle,
  ExecResult,
  ExecOptions,
} from "@/lib/sandbox/types"

interface MockSandboxState {
  id: string
  createdAt: number
  template: SandboxTemplate
  files: Map<string, string>
  alive: boolean
  detached: Array<{ pid: number; cmd: string }>
  lastPid: number
}

export interface MockExecHandler {
  (cmd: string, opts?: ExecOptions): ExecResult | Promise<ExecResult>
}

export class MockSandboxProvider implements SandboxProvider {
  readonly name = "mock"
  readonly sandboxes = new Map<string, MockSandboxState>()
  private idCounter = 0
  execHandler: MockExecHandler | null = null

  async create(template: SandboxTemplate, _opts: SandboxOptions): Promise<SandboxHandle> {
    this.idCounter += 1
    const id = `mock-sbx-${this.idCounter}`
    const createdAt = Date.now()
    this.sandboxes.set(id, {
      id,
      createdAt,
      template,
      files: new Map(),
      alive: true,
      detached: [],
      lastPid: 0,
    })
    return { id, createdAt }
  }

  async writeFile(id: string, path: string, content: string): Promise<void> {
    const sbx = this.must(id)
    sbx.files.set(this.normalize(path), content)
  }

  async readFile(id: string, path: string): Promise<string> {
    const sbx = this.must(id)
    const v = sbx.files.get(this.normalize(path))
    if (v === undefined) throw new Error(`ENOENT: ${path}`)
    return v
  }

  async listFiles(id: string, dir: string): Promise<string[]> {
    const sbx = this.must(id)
    const prefix = this.normalize(dir).replace(/\/$/, "") + "/"
    const out: string[] = []
    for (const p of sbx.files.keys()) {
      if (p.startsWith(prefix)) out.push(p)
    }
    return out
  }

  async deleteFile(id: string, path: string): Promise<void> {
    const sbx = this.must(id)
    if (!sbx.files.delete(this.normalize(path))) {
      throw new Error(`ENOENT: ${path}`)
    }
  }

  async exec(id: string, cmd: string, opts?: ExecOptions): Promise<ExecResult> {
    this.must(id)
    if (this.execHandler) return this.execHandler(cmd, opts)
    return { stdout: "", stderr: "", exitCode: 0, durationMs: 5 }
  }

  async execDetached(id: string, cmd: string): Promise<{ pid: number }> {
    const sbx = this.must(id)
    sbx.lastPid += 1
    sbx.detached.push({ pid: sbx.lastPid, cmd })
    return { pid: sbx.lastPid }
  }

  async getPreviewUrl(id: string, port: number): Promise<string> {
    this.must(id)
    return `https://${port}-${id}.mock.e2b.dev`
  }

  async isAlive(id: string): Promise<boolean> {
    return this.sandboxes.get(id)?.alive === true
  }

  async kill(id: string): Promise<void> {
    const sbx = this.sandboxes.get(id)
    if (sbx) sbx.alive = false
  }

  // Test helpers
  killExternally(id: string): void {
    const sbx = this.sandboxes.get(id)
    if (sbx) sbx.alive = false
  }

  private must(id: string): MockSandboxState {
    const sbx = this.sandboxes.get(id)
    if (!sbx || !sbx.alive) throw new Error(`Sandbox ${id} is not alive`)
    return sbx
  }

  private normalize(p: string): string {
    return p.replace(/^\/+/, "").replace(/\\/g, "/")
  }
}
```

- [ ] **Step 2.2: Smoke-test the mock against the interface**

Create a tiny test that ensures the mock structurally implements `SandboxProvider`.

```typescript
// tests/unit/sandbox/mock-sandbox-provider.test.ts (new, alongside helper)
import { describe, it, expect } from "vitest"
import { MockSandboxProvider } from "./mock-sandbox-provider"
import type { SandboxProvider } from "@/lib/sandbox/types"

describe("MockSandboxProvider", () => {
  it("conforms to SandboxProvider", async () => {
    const p: SandboxProvider = new MockSandboxProvider()
    const h = await p.create("nextjs-supabase", {})
    expect(h.id).toMatch(/^mock-sbx-/)
    await p.writeFile(h.id, "src/app/page.tsx", "export default () => null")
    expect(await p.readFile(h.id, "src/app/page.tsx")).toContain("export default")
    expect(await p.isAlive(h.id)).toBe(true)
    await p.kill(h.id)
    expect(await p.isAlive(h.id)).toBe(false)
  })
})
```

- [ ] **Step 2.3: Run test (must pass)**

```bash
npm run test:unit -- mock-sandbox-provider
```

- [ ] **Step 2.4: Commit**

```bash
git add tests/unit/sandbox/mock-sandbox-provider.ts tests/unit/sandbox/mock-sandbox-provider.test.ts
git commit -m "test(sandbox): add MockSandboxProvider helper conforming to interface"
```

---

## Task 3: E2BSandboxProvider — Failing Tests First

**TDD:** Per CONSTITUTION §4.1 the sandbox provider is mandatory-TDD. Write the failing tests now; implementation follows in Task 4.

**Files:**
- Create: `tests/unit/sandbox/e2b-provider.test.ts`

- [ ] **Step 3.1: Stub a typed mock of the `@e2b/code-interpreter` SDK**

The E2B SDK exposes a `Sandbox` class with static `create`/`connect` and instance methods `files.write`, `files.read`, `files.list`, `files.remove`, `commands.run`, `getHost`, `kill`. Our test mocks these via Vitest's `vi.mock`.

```typescript
// tests/unit/sandbox/e2b-provider.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

const mockE2B = {
  files: {
    write: vi.fn().mockResolvedValue(undefined),
    read: vi.fn(),
    list: vi.fn(),
    remove: vi.fn().mockResolvedValue(undefined),
  },
  commands: {
    run: vi.fn(),
  },
  getHost: vi.fn().mockReturnValue("3000-abc.e2b.dev"),
  kill: vi.fn().mockResolvedValue(undefined),
  isRunning: vi.fn().mockResolvedValue(true),
  sandboxId: "abc",
}

vi.mock("@e2b/code-interpreter", () => ({
  Sandbox: {
    create: vi.fn().mockResolvedValue(mockE2B),
    connect: vi.fn().mockResolvedValue(mockE2B),
  },
}))

import { E2BSandboxProvider } from "@/lib/sandbox/e2b-provider"
import { Sandbox as E2B } from "@e2b/code-interpreter"

beforeEach(() => {
  vi.clearAllMocks()
  ;(E2B.create as any).mockResolvedValue(mockE2B)
  ;(E2B.connect as any).mockResolvedValue(mockE2B)
})

describe("E2BSandboxProvider", () => {
  const provider = new E2BSandboxProvider({ apiKey: "test-key" })

  describe("create", () => {
    it("provisions a sandbox with the nextjs-supabase template", async () => {
      const h = await provider.create("nextjs-supabase", {})
      expect(E2B.create).toHaveBeenCalledWith(
        "nextjs-supabase",
        expect.objectContaining({ apiKey: "test-key" }),
      )
      expect(h.id).toBe("abc")
      expect(h.createdAt).toBeTypeOf("number")
    })

    it("forwards timeoutMs and metadata", async () => {
      await provider.create("nextjs-supabase", {
        timeoutMs: 60_000,
        metadata: { projectId: "p1" },
      })
      expect(E2B.create).toHaveBeenCalledWith(
        "nextjs-supabase",
        expect.objectContaining({
          timeoutMs: 60_000,
          metadata: { projectId: "p1" },
        }),
      )
    })

    it("defaults timeoutMs to 24h when omitted", async () => {
      await provider.create("nextjs-supabase", {})
      const call = (E2B.create as any).mock.calls[0]
      expect(call[1].timeoutMs).toBe(24 * 60 * 60 * 1000)
    })
  })

  describe("writeFile", () => {
    it("normalizes leading slash and writes via files.write", async () => {
      await provider.writeFile("abc", "/src/app/page.tsx", "X")
      expect(mockE2B.files.write).toHaveBeenCalledWith("/src/app/page.tsx", "X")
    })

    it("creates parent directories implicitly (E2B handles)", async () => {
      await provider.writeFile("abc", "deeply/nested/new/file.ts", "Y")
      expect(mockE2B.files.write).toHaveBeenCalledWith("/deeply/nested/new/file.ts", "Y")
    })

    it("throws SandboxDeadError when underlying SDK errors with sandbox-not-found", async () => {
      mockE2B.files.write.mockRejectedValueOnce(new Error("sandbox not found"))
      await expect(provider.writeFile("abc", "src/x.ts", "z")).rejects.toMatchObject({
        name: "SandboxDeadError",
      })
    })
  })

  describe("readFile", () => {
    it("returns string content", async () => {
      mockE2B.files.read.mockResolvedValueOnce("hello")
      expect(await provider.readFile("abc", "src/x.ts")).toBe("hello")
    })
  })

  describe("listFiles", () => {
    it("returns POSIX paths from E2B entries", async () => {
      mockE2B.files.list.mockResolvedValueOnce([
        { name: "page.tsx", path: "/src/app/page.tsx", type: "file" },
        { name: "layout.tsx", path: "/src/app/layout.tsx", type: "file" },
      ])
      expect(await provider.listFiles("abc", "/src/app")).toEqual([
        "/src/app/page.tsx",
        "/src/app/layout.tsx",
      ])
    })
  })

  describe("exec", () => {
    it("returns stdout/stderr/exitCode/durationMs", async () => {
      mockE2B.commands.run.mockResolvedValueOnce({
        stdout: "ok\n",
        stderr: "",
        exitCode: 0,
      })
      const t0 = Date.now()
      const r = await provider.exec("abc", "echo ok")
      expect(r.stdout).toBe("ok\n")
      expect(r.exitCode).toBe(0)
      expect(r.durationMs).toBeGreaterThanOrEqual(0)
      expect(Date.now() - t0).toBeLessThan(2000)
    })

    it("applies a 60s default timeout", async () => {
      mockE2B.commands.run.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
      await provider.exec("abc", "true")
      expect(mockE2B.commands.run).toHaveBeenCalledWith(
        "true",
        expect.objectContaining({ timeoutMs: 60_000 }),
      )
    })
  })

  describe("execDetached", () => {
    it("runs command in background mode", async () => {
      mockE2B.commands.run.mockResolvedValueOnce({ pid: 1234 })
      const r = await provider.execDetached("abc", "npm run dev", { cwd: "/" })
      expect(mockE2B.commands.run).toHaveBeenCalledWith(
        "npm run dev",
        expect.objectContaining({ background: true, cwd: "/" }),
      )
      expect(r.pid).toBe(1234)
    })
  })

  describe("getPreviewUrl", () => {
    it("calls getHost(port) and prepends https://", async () => {
      const url = await provider.getPreviewUrl("abc", 3000)
      expect(mockE2B.getHost).toHaveBeenCalledWith(3000)
      expect(url).toBe("https://3000-abc.e2b.dev")
    })
  })

  describe("isAlive", () => {
    it("returns false when connect rejects", async () => {
      ;(E2B.connect as any).mockRejectedValueOnce(new Error("not found"))
      expect(await provider.isAlive("ghost")).toBe(false)
    })

    it("returns true when sandbox is reachable and isRunning", async () => {
      expect(await provider.isAlive("abc")).toBe(true)
    })
  })

  describe("kill", () => {
    it("invokes underlying kill", async () => {
      await provider.kill("abc")
      expect(mockE2B.kill).toHaveBeenCalled()
    })
  })
})
```

- [ ] **Step 3.2: Run — expect failure**

```bash
npm run test:unit -- e2b-provider
```

Expected: every test fails with "Cannot find module `@/lib/sandbox/e2b-provider`". Good — that defines what we must build.

- [ ] **Step 3.3: Commit failing tests**

```bash
git add tests/unit/sandbox/e2b-provider.test.ts
git commit -m "test(sandbox): failing tests for E2BSandboxProvider (TDD red)"
```

---

## Task 4: E2BSandboxProvider — Implementation

**Files:**
- Create: `src/lib/sandbox/e2b-provider.ts`
- Create: `src/lib/sandbox/path-utils.ts`

- [ ] **Step 4.1: Path utilities (POSIX + leading-slash normalization)**

Per CONSTITUTION §6.2 rule 2 paths are always POSIX, and rule 3 says `writeFile` creates parents. E2B's `files.write` already creates parent directories. We still normalize so the agent's relative paths and any user-typed leading slash both map cleanly.

```typescript
// src/lib/sandbox/path-utils.ts

/** Normalize to a leading-slash POSIX path. Strips backslashes and collapses doubles. */
export function toPosix(path: string): string {
  if (!path) return "/"
  let p = path.replace(/\\/g, "/")
  if (!p.startsWith("/")) p = "/" + p
  p = p.replace(/\/+/g, "/")
  return p
}

/** Strip leading slash for storage in Convex `files.path` (which is "src/app/page.tsx"). */
export function toRelative(path: string): string {
  return toPosix(path).replace(/^\//, "")
}

/** Collect all parent directories of a path (excluding root). */
export function parentDirs(path: string): string[] {
  const parts = toRelative(path).split("/")
  parts.pop() // drop the filename
  const out: string[] = []
  let cur = ""
  for (const seg of parts) {
    cur = cur ? `${cur}/${seg}` : seg
    out.push(cur)
  }
  return out
}
```

- [ ] **Step 4.2: Path utilities test**

```typescript
// tests/unit/sandbox/path-utils.test.ts
import { describe, it, expect } from "vitest"
import { toPosix, toRelative, parentDirs } from "@/lib/sandbox/path-utils"

describe("path-utils", () => {
  it("toPosix normalizes leading slash", () => {
    expect(toPosix("src/app/page.tsx")).toBe("/src/app/page.tsx")
    expect(toPosix("/src/app/page.tsx")).toBe("/src/app/page.tsx")
    expect(toPosix("\\src\\app\\page.tsx")).toBe("/src/app/page.tsx")
    expect(toPosix("//src///app//page.tsx")).toBe("/src/app/page.tsx")
  })
  it("toRelative strips leading slash", () => {
    expect(toRelative("/a/b.ts")).toBe("a/b.ts")
    expect(toRelative("a/b.ts")).toBe("a/b.ts")
  })
  it("parentDirs lists ancestors", () => {
    expect(parentDirs("src/app/page.tsx")).toEqual(["src", "src/app"])
    expect(parentDirs("/foo/bar/baz/x.ts")).toEqual(["foo", "foo/bar", "foo/bar/baz"])
    expect(parentDirs("x.ts")).toEqual([])
  })
})
```

```bash
npm run test:unit -- path-utils
```

- [ ] **Step 4.3: Implement E2BSandboxProvider**

```typescript
// src/lib/sandbox/e2b-provider.ts
import { Sandbox } from "@e2b/code-interpreter"
import type {
  SandboxProvider,
  SandboxTemplate,
  SandboxOptions,
  SandboxHandle,
  ExecResult,
  ExecOptions,
} from "./types"
import { toPosix } from "./path-utils"

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000
const DEFAULT_EXEC_TIMEOUT_MS = 60_000

export class SandboxDeadError extends Error {
  readonly name = "SandboxDeadError"
  constructor(message: string, readonly cause?: unknown) {
    super(message)
  }
}

interface E2BProviderConfig {
  apiKey: string
}

interface E2BSandboxLike {
  sandboxId: string
  files: {
    write(path: string, content: string): Promise<void>
    read(path: string): Promise<string>
    list(path: string): Promise<Array<{ name: string; path: string; type: "file" | "dir" }>>
    remove(path: string): Promise<void>
  }
  commands: {
    run(cmd: string, opts?: { cwd?: string; timeoutMs?: number; background?: boolean }): Promise<{
      stdout?: string
      stderr?: string
      exitCode?: number
      pid?: number
    }>
  }
  getHost(port: number): string
  kill(): Promise<void>
  isRunning?(): Promise<boolean>
}

function isSandboxNotFound(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /not found|expired|terminated|404/i.test(msg)
}

export class E2BSandboxProvider implements SandboxProvider {
  readonly name = "e2b"
  private readonly apiKey: string

  constructor(cfg: E2BProviderConfig) {
    if (!cfg.apiKey) throw new Error("E2BSandboxProvider requires apiKey")
    this.apiKey = cfg.apiKey
  }

  async create(template: SandboxTemplate, opts: SandboxOptions): Promise<SandboxHandle> {
    const t0 = Date.now()
    const sbx = (await Sandbox.create(template, {
      apiKey: this.apiKey,
      timeoutMs: opts.timeoutMs ?? TWENTY_FOUR_HOURS_MS,
      metadata: opts.metadata,
      // RAM is template-defined in E2B; we map opts.ram into metadata for visibility.
    })) as unknown as E2BSandboxLike
    return { id: sbx.sandboxId, createdAt: t0 }
  }

  private async connect(id: string): Promise<E2BSandboxLike> {
    try {
      return (await Sandbox.connect(id, { apiKey: this.apiKey })) as unknown as E2BSandboxLike
    } catch (err) {
      throw new SandboxDeadError(`Sandbox ${id} unreachable: ${(err as Error).message}`, err)
    }
  }

  async writeFile(id: string, path: string, content: string): Promise<void> {
    const sbx = await this.connect(id)
    try {
      await sbx.files.write(toPosix(path), content)
    } catch (err) {
      if (isSandboxNotFound(err)) throw new SandboxDeadError(`writeFile failed: ${(err as Error).message}`, err)
      throw err
    }
  }

  async readFile(id: string, path: string): Promise<string> {
    const sbx = await this.connect(id)
    return await sbx.files.read(toPosix(path))
  }

  async listFiles(id: string, dir: string): Promise<string[]> {
    const sbx = await this.connect(id)
    const entries = await sbx.files.list(toPosix(dir))
    return entries.map((e) => e.path)
  }

  async deleteFile(id: string, path: string): Promise<void> {
    const sbx = await this.connect(id)
    try {
      await sbx.files.remove(toPosix(path))
    } catch (err) {
      if (isSandboxNotFound(err)) throw new SandboxDeadError(`deleteFile failed: ${(err as Error).message}`, err)
      throw err
    }
  }

  async exec(id: string, cmd: string, opts: ExecOptions = {}): Promise<ExecResult> {
    const sbx = await this.connect(id)
    const t0 = Date.now()
    const r = await sbx.commands.run(cmd, {
      cwd: opts.cwd ?? "/",
      timeoutMs: opts.timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS,
    })
    return {
      stdout: r.stdout ?? "",
      stderr: r.stderr ?? "",
      exitCode: r.exitCode ?? 0,
      durationMs: Date.now() - t0,
    }
  }

  async execDetached(id: string, cmd: string, opts: { cwd?: string } = {}): Promise<{ pid: number }> {
    const sbx = await this.connect(id)
    const r = await sbx.commands.run(cmd, {
      cwd: opts.cwd ?? "/",
      background: true,
    })
    if (typeof r.pid !== "number") {
      throw new Error("execDetached: provider did not return a pid")
    }
    return { pid: r.pid }
  }

  async getPreviewUrl(id: string, port: number): Promise<string> {
    const sbx = await this.connect(id)
    const host = sbx.getHost(port)
    return `https://${host}`
  }

  async isAlive(id: string): Promise<boolean> {
    try {
      const sbx = await this.connect(id)
      if (typeof sbx.isRunning === "function") {
        return await sbx.isRunning()
      }
      return true
    } catch {
      return false
    }
  }

  async kill(id: string): Promise<void> {
    const sbx = await this.connect(id)
    await sbx.kill()
  }
}
```

- [ ] **Step 4.4: Run all sandbox tests — expect green**

```bash
npm run test:unit -- sandbox
```

All tests in Task 3 must pass. If any fail, the implementation is wrong (not the tests).

- [ ] **Step 4.5: Commit**

```bash
git add src/lib/sandbox/e2b-provider.ts src/lib/sandbox/path-utils.ts tests/unit/sandbox/path-utils.test.ts
git commit -m "feat(sandbox): E2BSandboxProvider implementation conforming to §6.2"
```

---

## Task 5: Singleton Export

**Why:** Per CONSTITUTION §6.3 the rest of the codebase imports the singleton, never the class. Sub-plan 01's `ToolExecutor` already imports `sandboxProvider` from `@/lib/sandbox`.

**Files:**
- Create: `src/lib/sandbox/index.ts`

- [ ] **Step 5.1: Implement the singleton**

```typescript
// src/lib/sandbox/index.ts
import type { SandboxProvider } from "./types"
import { E2BSandboxProvider } from "./e2b-provider"

let _provider: SandboxProvider | null = null

function getProvider(): SandboxProvider {
  if (_provider) return _provider
  const apiKey = process.env.E2B_API_KEY
  if (!apiKey) {
    throw new Error(
      "E2B_API_KEY is not set. The sandbox provider cannot initialize. See .env.example.",
    )
  }
  _provider = new E2BSandboxProvider({ apiKey })
  return _provider
}

/**
 * The single sandbox provider used by the entire codebase.
 * Lazy: only the first read constructs it (so unit tests that don't touch sandbox
 * don't need E2B_API_KEY in the env).
 */
export const sandboxProvider: SandboxProvider = new Proxy({} as SandboxProvider, {
  get(_t, prop) {
    return Reflect.get(getProvider() as object, prop)
  },
})

export type { SandboxProvider } from "./types"
export { SandboxDeadError } from "./e2b-provider"

/** TEST-ONLY: replace the live provider with a mock. */
export function __setSandboxProviderForTests(p: SandboxProvider | null): void {
  _provider = p
}
```

- [ ] **Step 5.2: Add typecheck step**

```bash
npm run typecheck
```

Must pass. Sub-plan 01's `import { sandboxProvider } from "@/lib/sandbox"` now resolves.

- [ ] **Step 5.3: Commit**

```bash
git add src/lib/sandbox/index.ts
git commit -m "feat(sandbox): singleton sandboxProvider export (CONSTITUTION §6.3)"
```

---

## Task 6: Forbidden Command Pattern Enforcement

**Why:** CONSTITUTION §8.4 says `run_command` must reject `npm run dev` (already running), `sudo`, and `rm -rf /`. Sub-plan 01's executor will call this helper before delegating to `sandboxProvider.exec`. Centralizing it here keeps the rule next to the sandbox subsystem.

**Files:**
- Create: `src/lib/sandbox/forbidden-commands.ts`

- [ ] **Step 6.1: Failing tests**

```typescript
// tests/unit/sandbox/forbidden-commands.test.ts
import { describe, it, expect } from "vitest"
import { isForbiddenCommand, FORBIDDEN_COMMAND_PATTERNS } from "@/lib/sandbox/forbidden-commands"

describe("FORBIDDEN_COMMAND_PATTERNS", () => {
  it("rejects sudo", () => {
    expect(isForbiddenCommand("sudo apt-get install foo")).toBe(true)
  })
  it("rejects rm -rf /", () => {
    expect(isForbiddenCommand("rm -rf /")).toBe(true)
    expect(isForbiddenCommand("rm -rf  /")).toBe(true)
    expect(isForbiddenCommand("cd / && rm -rf /")).toBe(true)
  })
  it("rejects npm run dev variations (already running)", () => {
    expect(isForbiddenCommand("npm run dev")).toBe(true)
    expect(isForbiddenCommand("pnpm run dev")).toBe(true)
    expect(isForbiddenCommand("yarn dev")).toBe(true)
    expect(isForbiddenCommand("npm  run   dev")).toBe(true)
  })
  it("allows safe commands", () => {
    expect(isForbiddenCommand("npm install lodash")).toBe(false)
    expect(isForbiddenCommand("npm test")).toBe(false)
    expect(isForbiddenCommand("npm run build")).toBe(false)
    expect(isForbiddenCommand("npm run lint")).toBe(false)
    expect(isForbiddenCommand("ls -la")).toBe(false)
  })
})
```

```bash
npm run test:unit -- forbidden-commands
```

Expected: red.

- [ ] **Step 6.2: Implementation**

```typescript
// src/lib/sandbox/forbidden-commands.ts

/**
 * Patterns the agent may NEVER execute via run_command.
 * Per CONSTITUTION §8.4. Adding a pattern is allowed; removing requires an amendment.
 */
export const FORBIDDEN_COMMAND_PATTERNS: RegExp[] = [
  /(^|\s|;|&&|\|\|)\s*sudo\b/i,
  /\brm\s+-rf\s+\/(\s|$|;|&|\|)/i,
  /(^|\s|;|&&|\|\|)\s*(npm|pnpm|yarn|bun)\s+(run\s+)?dev\b/i,
]

export function isForbiddenCommand(cmd: string): boolean {
  return FORBIDDEN_COMMAND_PATTERNS.some((re) => re.test(cmd))
}
```

- [ ] **Step 6.3: Run — expect green**

```bash
npm run test:unit -- forbidden-commands
```

- [ ] **Step 6.4: Commit**

```bash
git add tests/unit/sandbox/forbidden-commands.test.ts src/lib/sandbox/forbidden-commands.ts
git commit -m "feat(sandbox): forbidden command deny-list (CONSTITUTION §8.4)"
```

---

## Task 7: Schema Additions for Sandbox State

**Why:** CONSTITUTION §11.1 requires three new fields on `projects`: `sandboxId`, `sandboxLastAlive`, `sandboxNeedsResync`. They are owned by the lifecycle module.

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 7.1: Read current schema**

```bash
cat convex/schema.ts
```

Confirm the `projects` table is the existing shape; sub-plan 01 may have already added other unrelated fields (e.g. message expansions).

- [ ] **Step 7.2: Add sandbox fields to projects**

```typescript
// convex/schema.ts (relevant excerpt)
projects: defineTable({
  name: v.string(),
  ownerId: v.string(),
  updatedAt: v.number(),
  importStatus: v.optional(
    v.union(v.literal("importing"), v.literal("completed"), v.literal("failed")),
  ),
  exportStatus: v.optional(
    v.union(
      v.literal("exporting"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
  ),
  exportRepoUrl: v.optional(v.string()),

  // Sandbox state — added by sub-plan 02 per CONSTITUTION §11.1
  sandboxId: v.optional(v.string()),
  sandboxLastAlive: v.optional(v.number()),
  sandboxNeedsResync: v.optional(v.boolean()),
}).index("by_owner", ["ownerId"]),
```

- [ ] **Step 7.3: Convex generates types**

```bash
npx convex dev --once
```

The Convex CLI regenerates `convex/_generated/dataModel.d.ts` with the new optional fields. Optional fields are backward-compatible — no migration script needed for existing rows.

- [ ] **Step 7.4: Commit**

```bash
git add convex/schema.ts convex/_generated
git commit -m "feat(schema): add sandboxId/sandboxLastAlive/sandboxNeedsResync (CONSTITUTION §11.1)"
```

---

## Task 8: Convex Mutations and Queries for Sandbox State

**Files:**
- Modify: `convex/projects.ts`

- [ ] **Step 8.1: Read existing projects.ts**

```bash
cat convex/projects.ts
```

Note the existing exports and conventions (`mutation` vs `internalMutation`, auth patterns).

- [ ] **Step 8.2: Add the new mutations and queries**

Append (do not replace):

```typescript
// convex/projects.ts — appended

import { internalMutation, internalQuery, mutation, query } from "./_generated/server"
import { v } from "convex/values"

export const setSandbox = internalMutation({
  args: {
    projectId: v.id("projects"),
    sandboxId: v.string(),
    sandboxLastAlive: v.number(),
  },
  handler: async (ctx, { projectId, sandboxId, sandboxLastAlive }) => {
    await ctx.db.patch(projectId, {
      sandboxId,
      sandboxLastAlive,
      sandboxNeedsResync: false,
    })
  },
})

export const clearSandbox = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await ctx.db.patch(projectId, {
      sandboxId: undefined,
      sandboxLastAlive: undefined,
    })
  },
})

export const markNeedsResync = internalMutation({
  args: { projectId: v.id("projects"), value: v.boolean() },
  handler: async (ctx, { projectId, value }) => {
    await ctx.db.patch(projectId, { sandboxNeedsResync: value })
  },
})

export const touchSandbox = internalMutation({
  args: { projectId: v.id("projects"), at: v.number() },
  handler: async (ctx, { projectId, at }) => {
    await ctx.db.patch(projectId, { sandboxLastAlive: at })
  },
})

export const getSandbox = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const p = await ctx.db.get(projectId)
    if (!p) return null
    return {
      sandboxId: p.sandboxId ?? null,
      sandboxLastAlive: p.sandboxLastAlive ?? null,
      sandboxNeedsResync: p.sandboxNeedsResync ?? false,
    }
  },
})

/**
 * Public-facing read for the UI (gated by ownerId match).
 * Returns only the fields needed by the status badge / preview pane.
 */
export const getSandboxStatusForOwner = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Unauthorized")
    const p = await ctx.db.get(projectId)
    if (!p || p.ownerId !== identity.subject) return null
    return {
      sandboxId: p.sandboxId ?? null,
      sandboxLastAlive: p.sandboxLastAlive ?? null,
      sandboxNeedsResync: p.sandboxNeedsResync ?? false,
    }
  },
})
```

- [ ] **Step 8.3: Type-regenerate**

```bash
npx convex dev --once
```

- [ ] **Step 8.4: Commit**

```bash
git add convex/projects.ts convex/_generated
git commit -m "feat(convex): sandbox state mutations + getSandboxStatusForOwner query"
```

---

## Task 9: Sandbox Lifecycle — Failing Tests First

**TDD:** The lifecycle is the non-trivial logic — three branches (existing+alive, existing+dead, missing) plus the `needsResync` branch. Test all four.

**Files:**
- Create: `tests/unit/sandbox/lifecycle.test.ts`

- [ ] **Step 9.1: Write the test fixtures and scenarios**

```typescript
// tests/unit/sandbox/lifecycle.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest"
import { MockSandboxProvider } from "./mock-sandbox-provider"
import { ensureSandbox, syncProjectFiles } from "@/lib/sandbox/lifecycle"
import { __setSandboxProviderForTests } from "@/lib/sandbox"

interface MockConvex {
  files: Array<{ path: string; content: string }>
  project: {
    _id: string
    sandboxId?: string | null
    sandboxLastAlive?: number | null
    sandboxNeedsResync?: boolean
  }
  setSandbox: ReturnType<typeof vi.fn>
  clearSandbox: ReturnType<typeof vi.fn>
  markNeedsResync: ReturnType<typeof vi.fn>
  touchSandbox: ReturnType<typeof vi.fn>
  listAll: ReturnType<typeof vi.fn>
  getSandbox: ReturnType<typeof vi.fn>
}

function makeConvex(): MockConvex {
  const project = { _id: "p1", sandboxId: null, sandboxLastAlive: null, sandboxNeedsResync: false }
  const files = [
    { path: "src/app/page.tsx", content: "export default () => null" },
    { path: "src/app/layout.tsx", content: "export default ({children}) => children" },
    { path: "package.json", content: '{"name":"app"}' },
  ]
  return {
    files,
    project,
    setSandbox: vi.fn(async ({ sandboxId, sandboxLastAlive }) => {
      project.sandboxId = sandboxId
      project.sandboxLastAlive = sandboxLastAlive
      project.sandboxNeedsResync = false
    }),
    clearSandbox: vi.fn(async () => {
      project.sandboxId = null
      project.sandboxLastAlive = null
    }),
    markNeedsResync: vi.fn(async ({ value }) => {
      project.sandboxNeedsResync = value
    }),
    touchSandbox: vi.fn(async ({ at }) => {
      project.sandboxLastAlive = at
    }),
    listAll: vi.fn(async () => files),
    getSandbox: vi.fn(async () => ({
      sandboxId: project.sandboxId,
      sandboxLastAlive: project.sandboxLastAlive,
      sandboxNeedsResync: project.sandboxNeedsResync,
    })),
  }
}

describe("ensureSandbox", () => {
  let mock: MockSandboxProvider
  let convex: MockConvex

  beforeEach(() => {
    mock = new MockSandboxProvider()
    __setSandboxProviderForTests(mock)
    convex = makeConvex()
  })

  it("creates a new sandbox when project has no sandboxId", async () => {
    const handle = await ensureSandbox(convex as any, "p1" as any)
    expect(handle.id).toMatch(/^mock-sbx-/)
    expect(convex.setSandbox).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "p1", sandboxId: handle.id }),
    )
    // Files were synced
    const sbx = mock.sandboxes.get(handle.id)!
    expect(sbx.files.size).toBe(3)
    expect(sbx.files.get("src/app/page.tsx")).toContain("export default")
    // npm install + npm run dev launched
    expect(sbx.detached.length).toBeGreaterThanOrEqual(1)
    expect(sbx.detached.some((d) => d.cmd.includes("dev"))).toBe(true)
  })

  it("reuses an alive sandbox without re-syncing", async () => {
    const first = await mock.create("nextjs-supabase", {})
    convex.project.sandboxId = first.id
    convex.project.sandboxLastAlive = Date.now()
    convex.project.sandboxNeedsResync = false

    const handle = await ensureSandbox(convex as any, "p1" as any)
    expect(handle.id).toBe(first.id)
    // No re-sync: file count untouched
    expect(mock.sandboxes.get(handle.id)!.files.size).toBe(0)
    expect(convex.touchSandbox).toHaveBeenCalled()
  })

  it("provisions a new sandbox when the cached one is dead", async () => {
    const dead = await mock.create("nextjs-supabase", {})
    mock.killExternally(dead.id)
    convex.project.sandboxId = dead.id

    const handle = await ensureSandbox(convex as any, "p1" as any)
    expect(handle.id).not.toBe(dead.id)
    expect(convex.setSandbox).toHaveBeenCalled()
    expect(mock.sandboxes.get(handle.id)!.files.size).toBe(3)
  })

  it("re-syncs when sandboxNeedsResync is true (alive sandbox, drift detected)", async () => {
    const sbx = await mock.create("nextjs-supabase", {})
    convex.project.sandboxId = sbx.id
    convex.project.sandboxNeedsResync = true

    const handle = await ensureSandbox(convex as any, "p1" as any)
    expect(handle.id).toBe(sbx.id) // same sandbox
    expect(mock.sandboxes.get(sbx.id)!.files.size).toBe(3) // re-synced
    expect(convex.markNeedsResync).toHaveBeenCalledWith(
      expect.objectContaining({ value: false }),
    )
  })
})

describe("syncProjectFiles", () => {
  let mock: MockSandboxProvider
  let convex: MockConvex

  beforeEach(() => {
    mock = new MockSandboxProvider()
    __setSandboxProviderForTests(mock)
    convex = makeConvex()
  })

  it("writes every file to the sandbox in batches", async () => {
    const sbx = await mock.create("nextjs-supabase", {})
    await syncProjectFiles(convex as any, "p1" as any, sbx.id)
    expect(mock.sandboxes.get(sbx.id)!.files.size).toBe(3)
  })

  it("marks needsResync if a file write throws SandboxDeadError", async () => {
    const sbx = await mock.create("nextjs-supabase", {})
    mock.killExternally(sbx.id)
    await expect(syncProjectFiles(convex as any, "p1" as any, sbx.id)).rejects.toThrow()
    expect(convex.markNeedsResync).toHaveBeenCalledWith(
      expect.objectContaining({ value: true }),
    )
  })
})
```

- [ ] **Step 9.2: Run — expect failure**

```bash
npm run test:unit -- lifecycle
```

Expected: tests fail because `lifecycle.ts` does not exist yet.

- [ ] **Step 9.3: Commit failing tests**

```bash
git add tests/unit/sandbox/lifecycle.test.ts
git commit -m "test(sandbox): failing tests for ensureSandbox + syncProjectFiles (TDD red)"
```

---

## Task 10: Sandbox Lifecycle — Implementation

**Files:**
- Create: `src/lib/sandbox/lifecycle.ts`

- [ ] **Step 10.1: Implement `syncProjectFiles`, `bootApp`, `ensureSandbox`**

The Convex client passed in is a `ConvexHttpClient`-like object — in production it is the same `ConvexHttpClient` sub-plan 01 instantiates inside the Inngest function with `POLARIS_CONVEX_INTERNAL_KEY`. We accept any object with `query`, `mutation`, and an `api` namespace via duck-typing rather than tightly coupling to the generated types so the lifecycle can be tested with the mock above.

```typescript
// src/lib/sandbox/lifecycle.ts
import { sandboxProvider, SandboxDeadError } from "."
import type { SandboxHandle } from "./types"

const SYNC_BATCH_SIZE = 10
const NEXTJS_DEV_PORT = 3000

export interface ConvexLike {
  // Existing convex/files.ts function — sub-plan 01 adds files_by_path:listAll
  listAll(args: { projectId: string }): Promise<Array<{ path: string; content: string }>>
  // convex/projects.ts (Task 8)
  getSandbox(args: { projectId: string }): Promise<{
    sandboxId: string | null
    sandboxLastAlive: number | null
    sandboxNeedsResync: boolean
  } | null>
  setSandbox(args: { projectId: string; sandboxId: string; sandboxLastAlive: number }): Promise<void>
  clearSandbox(args: { projectId: string }): Promise<void>
  markNeedsResync(args: { projectId: string; value: boolean }): Promise<void>
  touchSandbox(args: { projectId: string; at: number }): Promise<void>
}

/**
 * Bulk-write every Convex file into the sandbox. Per CONSTITUTION §10.4 batch
 * 10-at-a-time. On any SandboxDeadError, mark needsResync and rethrow.
 */
export async function syncProjectFiles(
  convex: ConvexLike,
  projectId: string,
  sandboxId: string,
): Promise<void> {
  const files = await convex.listAll({ projectId })
  for (let i = 0; i < files.length; i += SYNC_BATCH_SIZE) {
    const batch = files.slice(i, i + SYNC_BATCH_SIZE)
    try {
      await Promise.all(
        batch.map((f) => sandboxProvider.writeFile(sandboxId, f.path, f.content)),
      )
    } catch (err) {
      if (err instanceof SandboxDeadError || /not alive|not found/i.test((err as Error).message)) {
        await convex.markNeedsResync({ projectId, value: true })
      }
      throw err
    }
  }
}

/**
 * Run npm install (background) and npm run dev (detached).
 * Per CONSTITUTION §8.5 the agent never executes npm run dev — the lifecycle does.
 */
export async function bootApp(sandboxId: string): Promise<void> {
  // npm install — background so we don't block on it; agent's first run_command
  // will likely call `npm install <pkg>` later, which serializes naturally.
  await sandboxProvider.execDetached(sandboxId, "npm install --no-audit --no-fund", { cwd: "/" })
  await sandboxProvider.execDetached(sandboxId, "npm run dev", { cwd: "/" })
}

/**
 * The single entry point. Returns a handle whose .id is safe to write to.
 * Per CONSTITUTION §10.4 / §10.6 this function is also the reconciler.
 */
export async function ensureSandbox(
  convex: ConvexLike,
  projectId: string,
): Promise<SandboxHandle> {
  const state = await convex.getSandbox({ projectId })

  // Branch 1: cached sandbox exists. Verify it's alive.
  if (state?.sandboxId) {
    const alive = await sandboxProvider.isAlive(state.sandboxId).catch(() => false)
    if (alive) {
      // Branch 1a: alive but flagged for resync (drift was detected by a previous
      // tool failure or a checkpoint resume per §10.6).
      if (state.sandboxNeedsResync) {
        await syncProjectFiles(convex, projectId, state.sandboxId)
        await convex.markNeedsResync({ projectId, value: false })
      }
      await convex.touchSandbox({ projectId, at: Date.now() })
      return { id: state.sandboxId, createdAt: state.sandboxLastAlive ?? Date.now() }
    }
    // Dead. Clear and fall through to provisioning.
    await convex.clearSandbox({ projectId })
  }

  // Branch 2: provision new sandbox.
  const handle = await sandboxProvider.create("nextjs-supabase", {
    timeoutMs: 24 * 60 * 60 * 1000,
    metadata: { projectId },
  })

  // Per CONSTITUTION §10.4: full re-sync on creation.
  await syncProjectFiles(convex, projectId, handle.id)

  // Boot npm install + npm run dev (the lifecycle owns this — never the agent, §8.5).
  await bootApp(handle.id)

  await convex.setSandbox({
    projectId,
    sandboxId: handle.id,
    sandboxLastAlive: Date.now(),
  })

  return handle
}
```

- [ ] **Step 10.2: Run all sandbox tests — expect green**

```bash
npm run test:unit -- sandbox
```

All four `ensureSandbox` scenarios + both `syncProjectFiles` tests pass. If any fail, fix the implementation, not the tests.

- [ ] **Step 10.3: Commit**

```bash
git add src/lib/sandbox/lifecycle.ts
git commit -m "feat(sandbox): lifecycle (ensureSandbox/syncProjectFiles/bootApp) per §10.4-10.6"
```

---

## Task 11: Inngest ensureSandbox Function

**Why:** Provisioning happens server-side (no E2B from the browser). The lifecycle is wrapped as an Inngest function so it can be triggered from `/api/sandbox/ensure` (when the user opens a project) and yields automatic retries.

**Files:**
- Create: `src/features/sandbox/inngest/ensure-sandbox.ts`
- Modify: `src/app/api/inngest/route.ts`

- [ ] **Step 11.1: Implement the Inngest function**

```typescript
// src/features/sandbox/inngest/ensure-sandbox.ts
import { inngest } from "@/inngest/client"
import { ConvexHttpClient } from "convex/browser"
import { api } from "@/../convex/_generated/api"
import { ensureSandbox } from "@/lib/sandbox/lifecycle"
import type { Id } from "@/../convex/_generated/dataModel"

interface EnsureSandboxEvent {
  data: {
    projectId: Id<"projects">
    userId: string
  }
}

export const ensureSandboxFn = inngest.createFunction(
  {
    id: "ensure-sandbox",
    name: "Ensure Sandbox",
    retries: 2,
    concurrency: { limit: 1, key: "event.data.projectId" },
  },
  { event: "sandbox/ensure" },
  async ({ event, step }: { event: EnsureSandboxEvent; step: any }) => {
    const { projectId } = event.data

    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
    convex.setAuth(process.env.POLARIS_CONVEX_INTERNAL_KEY!)

    const adapter = {
      listAll: (args: { projectId: string }) =>
        convex.query(api.files_by_path.listAll, args as any),
      getSandbox: (args: { projectId: string }) =>
        convex.query(api.projects.getSandbox, args as any),
      setSandbox: (args: any) => convex.mutation(api.projects.setSandbox, args),
      clearSandbox: (args: any) => convex.mutation(api.projects.clearSandbox, args),
      markNeedsResync: (args: any) => convex.mutation(api.projects.markNeedsResync, args),
      touchSandbox: (args: any) => convex.mutation(api.projects.touchSandbox, args),
    }

    const handle = await step.run("ensure-sandbox", () =>
      ensureSandbox(adapter as any, projectId as any),
    )

    return { sandboxId: handle.id, createdAt: handle.createdAt }
  },
)
```

- [ ] **Step 11.2: Register in the Inngest HTTP handler**

```typescript
// src/app/api/inngest/route.ts (modified)
import { serve } from "inngest/next"
import { inngest } from "@/inngest/client"
import { processMessage } from "@/features/conversations/inngest/process-message"
import { ensureSandboxFn } from "@/features/sandbox/inngest/ensure-sandbox"
import { syncFileFn } from "@/features/sandbox/inngest/sync-file" // Task 12

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processMessage, ensureSandboxFn, syncFileFn],
})
```

- [ ] **Step 11.3: Add public API route to trigger the event**

```typescript
// src/app/api/sandbox/ensure/route.ts
import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { inngest } from "@/inngest/client"

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { projectId } = await req.json()
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 })
  await inngest.send({ name: "sandbox/ensure", data: { projectId, userId } })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 11.4: Commit**

```bash
git add src/features/sandbox/inngest/ensure-sandbox.ts src/app/api/inngest/route.ts src/app/api/sandbox/ensure/route.ts
git commit -m "feat(sandbox): Inngest ensureSandbox function + /api/sandbox/ensure"
```

---

## Task 12: Inngest syncFile Function

**Why:** When a user types in CodeMirror, sub-plan 01's `convex/files.ts` writes Convex (source of truth). E2B is a projection. We propagate the change here. Per CONSTITUTION §10.7 the user's edit wins; the sandbox catches up.

**Files:**
- Create: `src/features/sandbox/inngest/sync-file.ts`

- [ ] **Step 12.1: Implement**

```typescript
// src/features/sandbox/inngest/sync-file.ts
import { inngest } from "@/inngest/client"
import { sandboxProvider, SandboxDeadError } from "@/lib/sandbox"
import { ConvexHttpClient } from "convex/browser"
import { api } from "@/../convex/_generated/api"
import type { Id } from "@/../convex/_generated/dataModel"

interface SyncFileEvent {
  data: {
    projectId: Id<"projects">
    path: string
    op: "write" | "delete"
    content?: string
  }
}

export const syncFileFn = inngest.createFunction(
  {
    id: "sync-file",
    name: "Sync File to Sandbox",
    retries: 2,
    concurrency: { limit: 4, key: "event.data.projectId" },
  },
  { event: "file/changed" },
  async ({ event, step }: { event: SyncFileEvent; step: any }) => {
    const { projectId, path, op, content } = event.data

    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
    convex.setAuth(process.env.POLARIS_CONVEX_INTERNAL_KEY!)

    const state = await step.run("get-sandbox", () =>
      convex.query(api.projects.getSandbox, { projectId } as any),
    )
    if (!state?.sandboxId) {
      // No sandbox yet — nothing to sync. Will be picked up on next ensureSandbox.
      return { skipped: "no-sandbox" }
    }

    try {
      await step.run("apply", async () => {
        if (op === "delete") {
          await sandboxProvider.deleteFile(state.sandboxId!, path)
        } else if (op === "write") {
          if (typeof content !== "string") throw new Error("write requires content")
          await sandboxProvider.writeFile(state.sandboxId!, path, content)
        }
      })
      return { ok: true }
    } catch (err) {
      if (err instanceof SandboxDeadError) {
        await convex.mutation(api.projects.markNeedsResync, {
          projectId,
          value: true,
        } as any)
        return { skipped: "sandbox-dead" }
      }
      throw err
    }
  },
)
```

- [ ] **Step 12.2: Commit**

```bash
git add src/features/sandbox/inngest/sync-file.ts
git commit -m "feat(sandbox): Inngest syncFile listener for file/changed events"
```

---

## Task 13: File-Change Event Emission Hook

**Why:** Sub-plan 01 had the agent's `ToolExecutor` write Convex first then E2B (Article X). User-driven edits from CodeMirror only hit Convex; we need to emit `file/changed` from `convex/files.ts` whenever the writer is `"user"`.

**Files:**
- Modify: `convex/files.ts`

- [ ] **Step 13.1: Read existing files.ts**

```bash
cat convex/files.ts
```

Identify the editor-side write mutation (likely `updateFileContent` or similar; sub-plan 01 may have introduced `files_by_path:writePath` for the agent — that path skips this hook because the agent has *already* written to E2B in the executor).

- [ ] **Step 13.2: Add helper to emit Inngest event from a mutation**

Convex mutations cannot directly call Inngest; instead the mutation schedules an action that does. Add an action wrapper.

```typescript
// convex/files.ts — appended
import { internal } from "./_generated/api"
import { internalAction } from "./_generated/server"
import { v } from "convex/values"

/**
 * Action that POSTs an Inngest event. Called via ctx.scheduler.runAfter
 * from any user-origin write or delete mutation.
 */
export const emitFileChangedAction = internalAction({
  args: {
    projectId: v.id("projects"),
    path: v.string(),
    op: v.union(v.literal("write"), v.literal("delete")),
    content: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const eventKey = process.env.INNGEST_EVENT_KEY
    if (!eventKey) {
      // In tests / local without Inngest configured, no-op.
      return
    }
    await fetch(`https://inn.gs/e/${eventKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "file/changed", data: args }),
    })
  },
})
```

In whichever editor-write mutation exists (e.g. an existing `update` mutation), schedule this action right before returning:

```typescript
// inside the user-origin write mutation
await ctx.scheduler.runAfter(0, internal.files.emitFileChangedAction, {
  projectId,
  path,
  op: "write",
  content,
})
```

> Note: agent-origin writes (via `files_by_path:writePath` in sub-plan 01) MUST NOT emit this event — the agent's executor already writes to E2B itself per §10.2. Only the `updatedBy: "user"` path emits.

- [ ] **Step 13.3: Manual smoke (deferred to Task 19)**

We verify the round-trip in Task 19. Here, just typecheck:

```bash
npx convex dev --once
npm run typecheck
```

- [ ] **Step 13.4: Commit**

```bash
git add convex/files.ts convex/_generated
git commit -m "feat(convex): emit file/changed Inngest event on user-origin file mutations"
```

---

## Task 14: Preview Iframe Component

**Why:** Per CONSTITUTION §1.2.4 the preview URL is "real, served HTTP, hot-reloads on change." This component renders the iframe and surfaces three states: loading, ready, dead. P95 < 60s on first paint after a sandbox restart per §14.5.

**Files:**
- Create: `src/features/sandbox/components/preview-pane.tsx`

- [ ] **Step 14.1: Failing UI test**

We do not unit-test rendering per §16.4, but we do test the URL-builder logic. Carve it out:

```typescript
// tests/unit/sandbox/preview-url.test.ts
import { describe, it, expect } from "vitest"
import { buildPreviewState } from "@/features/sandbox/components/preview-pane"

describe("buildPreviewState", () => {
  it("returns loading when sandboxId is null", () => {
    expect(buildPreviewState(null, false)).toEqual({ kind: "loading" })
  })
  it("returns dead when needsResync is true", () => {
    expect(buildPreviewState("abc", true)).toEqual({ kind: "reconciling", sandboxId: "abc" })
  })
  it("returns ready when sandbox is healthy", () => {
    expect(buildPreviewState("abc", false)).toEqual({ kind: "ready", sandboxId: "abc" })
  })
})
```

- [ ] **Step 14.2: Implement the component**

```tsx
// src/features/sandbox/components/preview-pane.tsx
"use client"

import { useEffect, useState } from "react"
import { useQuery } from "convex/react"
import { api } from "@/../convex/_generated/api"
import type { Id } from "@/../convex/_generated/dataModel"

export type PreviewState =
  | { kind: "loading" }
  | { kind: "reconciling"; sandboxId: string }
  | { kind: "ready"; sandboxId: string }

export function buildPreviewState(
  sandboxId: string | null,
  needsResync: boolean,
): PreviewState {
  if (!sandboxId) return { kind: "loading" }
  if (needsResync) return { kind: "reconciling", sandboxId }
  return { kind: "ready", sandboxId }
}

interface PreviewPaneProps {
  projectId: Id<"projects">
}

export function PreviewPane({ projectId }: PreviewPaneProps) {
  const status = useQuery(api.projects.getSandboxStatusForOwner, { projectId })
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const state = buildPreviewState(
    status?.sandboxId ?? null,
    status?.sandboxNeedsResync ?? false,
  )

  useEffect(() => {
    if (state.kind !== "ready") {
      setPreviewUrl(null)
      return
    }
    let cancelled = false
    setError(null)
    fetch(`/api/sandbox/preview-url?projectId=${projectId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { url: string }) => {
        if (!cancelled) setPreviewUrl(j.url)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [state.kind, state.kind === "ready" ? state.sandboxId : null, projectId])

  if (state.kind === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Provisioning sandbox…
      </div>
    )
  }

  if (state.kind === "reconciling") {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Reconciling files with sandbox…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        Preview unavailable: {error}
      </div>
    )
  }

  if (!previewUrl) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Waiting for dev server…
      </div>
    )
  }

  return (
    <iframe
      src={previewUrl}
      className="h-full w-full border-0 bg-white"
      title="App preview"
      sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
    />
  )
}
```

- [ ] **Step 14.3: Add the preview-url API route**

```typescript
// src/app/api/sandbox/preview-url/route.ts
import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { ConvexHttpClient } from "convex/browser"
import { api } from "@/../convex/_generated/api"
import { sandboxProvider } from "@/lib/sandbox"

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const projectId = url.searchParams.get("projectId")
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 })

  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
  convex.setAuth(process.env.POLARIS_CONVEX_INTERNAL_KEY!)
  const status = await convex.query(api.projects.getSandbox, { projectId } as any)
  if (!status?.sandboxId) return NextResponse.json({ error: "no sandbox" }, { status: 404 })

  const previewUrl = await sandboxProvider.getPreviewUrl(status.sandboxId, 3000)
  return NextResponse.json({ url: previewUrl })
}
```

- [ ] **Step 14.4: Commit**

```bash
git add src/features/sandbox/components/preview-pane.tsx src/app/api/sandbox/preview-url/route.ts tests/unit/sandbox/preview-url.test.ts
git commit -m "feat(sandbox): PreviewPane component + /api/sandbox/preview-url"
```

---

## Task 15: Sandbox Status Badge

**Why:** Per CONSTITUTION §2.5 ("Agent is visible") and §2.6 ("Failures are honest") the user always sees the sandbox state. Badge subscribes to `projects.sandboxLastAlive` and surfaces four states.

**Files:**
- Create: `src/features/sandbox/components/sandbox-status.tsx`

- [ ] **Step 15.1: Write the component**

```tsx
// src/features/sandbox/components/sandbox-status.tsx
"use client"

import { useQuery } from "convex/react"
import { api } from "@/../convex/_generated/api"
import type { Id } from "@/../convex/_generated/dataModel"
import { Loader2, CheckCircle, AlertCircle, AlertTriangle } from "lucide-react"

export type SandboxBadgeState = "starting" | "installing" | "ready" | "dead" | "reconciling"

export function deriveBadgeState(args: {
  sandboxId: string | null
  sandboxLastAlive: number | null
  sandboxNeedsResync: boolean
  now: number
}): SandboxBadgeState {
  const { sandboxId, sandboxLastAlive, sandboxNeedsResync, now } = args
  if (!sandboxId) return "starting"
  if (sandboxNeedsResync) return "reconciling"
  if (!sandboxLastAlive) return "installing"
  // 24h hard expiry per CONSTITUTION §10.4.
  if (now - sandboxLastAlive > 24 * 60 * 60 * 1000) return "dead"
  // First 30s after sandboxLastAlive treated as installing per §14.1.
  if (now - sandboxLastAlive < 30_000) return "installing"
  return "ready"
}

interface Props {
  projectId: Id<"projects">
}

export function SandboxStatusBadge({ projectId }: Props) {
  const status = useQuery(api.projects.getSandboxStatusForOwner, { projectId })
  if (!status) return null

  const state = deriveBadgeState({
    sandboxId: status.sandboxId,
    sandboxLastAlive: status.sandboxLastAlive,
    sandboxNeedsResync: status.sandboxNeedsResync,
    now: Date.now(),
  })

  const ui: Record<SandboxBadgeState, { label: string; Icon: typeof Loader2; className: string }> = {
    starting:    { label: "Starting sandbox",    Icon: Loader2,        className: "text-blue-500 animate-spin" },
    installing:  { label: "Installing deps",     Icon: Loader2,        className: "text-amber-500 animate-spin" },
    ready:       { label: "Sandbox ready",       Icon: CheckCircle,    className: "text-green-500" },
    dead:        { label: "Sandbox expired",     Icon: AlertCircle,    className: "text-red-500" },
    reconciling: { label: "Reconciling files",   Icon: AlertTriangle,  className: "text-amber-500" },
  }
  const { label, Icon, className } = ui[state]

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="sandbox-status">
      <Icon className={`h-3.5 w-3.5 ${className}`} />
      <span>{label}</span>
    </div>
  )
}
```

- [ ] **Step 15.2: Unit test the state derivation**

```typescript
// tests/unit/sandbox/sandbox-status.test.ts
import { describe, it, expect } from "vitest"
import { deriveBadgeState } from "@/features/sandbox/components/sandbox-status"

describe("deriveBadgeState", () => {
  const NOW = 1_700_000_000_000
  it("returns starting when no sandboxId", () => {
    expect(
      deriveBadgeState({ sandboxId: null, sandboxLastAlive: null, sandboxNeedsResync: false, now: NOW }),
    ).toBe("starting")
  })
  it("returns reconciling when needsResync", () => {
    expect(
      deriveBadgeState({ sandboxId: "x", sandboxLastAlive: NOW, sandboxNeedsResync: true, now: NOW }),
    ).toBe("reconciling")
  })
  it("returns installing within first 30s", () => {
    expect(
      deriveBadgeState({ sandboxId: "x", sandboxLastAlive: NOW - 5000, sandboxNeedsResync: false, now: NOW }),
    ).toBe("installing")
  })
  it("returns ready after 30s and within 24h", () => {
    expect(
      deriveBadgeState({ sandboxId: "x", sandboxLastAlive: NOW - 60_000, sandboxNeedsResync: false, now: NOW }),
    ).toBe("ready")
  })
  it("returns dead after 24h", () => {
    expect(
      deriveBadgeState({
        sandboxId: "x",
        sandboxLastAlive: NOW - 25 * 60 * 60 * 1000,
        sandboxNeedsResync: false,
        now: NOW,
      }),
    ).toBe("dead")
  })
})
```

```bash
npm run test:unit -- sandbox-status
```

- [ ] **Step 15.3: Commit**

```bash
git add src/features/sandbox/components/sandbox-status.tsx tests/unit/sandbox/sandbox-status.test.ts
git commit -m "feat(sandbox): SandboxStatusBadge with derived state"
```

---

## Task 16: useSandbox Client Hook

**Files:**
- Create: `src/features/sandbox/hooks/use-sandbox.ts`

- [ ] **Step 16.1: Implement**

```typescript
// src/features/sandbox/hooks/use-sandbox.ts
"use client"

import { useEffect, useRef } from "react"
import { useQuery } from "convex/react"
import { api } from "@/../convex/_generated/api"
import type { Id } from "@/../convex/_generated/dataModel"

/**
 * Subscribes to sandbox status for a project and triggers ensureSandbox on mount
 * if no sandbox is provisioned yet (or if the cached one is dead).
 */
export function useSandbox(projectId: Id<"projects">) {
  const status = useQuery(api.projects.getSandboxStatusForOwner, { projectId })
  const triggered = useRef(false)

  useEffect(() => {
    if (!status) return
    if (triggered.current) return

    const stale =
      !status.sandboxId ||
      (status.sandboxLastAlive !== null &&
        Date.now() - status.sandboxLastAlive > 24 * 60 * 60 * 1000)

    if (stale) {
      triggered.current = true
      void fetch("/api/sandbox/ensure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      })
    }
  }, [status, projectId])

  return {
    status: status ?? null,
    isReady: !!status?.sandboxId && !status?.sandboxNeedsResync,
  }
}
```

- [ ] **Step 16.2: Commit**

```bash
git add src/features/sandbox/hooks/use-sandbox.ts
git commit -m "feat(sandbox): useSandbox hook (queries status + triggers ensure on mount)"
```

---

## Task 17: Project Layout Integration

**Why:** Today the project layout is two panes (conversation + editor). Per ROADMAP.md Phase 1 DoD the user must see the live preview. We add a third pane.

**Files:**
- Modify: `src/features/projects/components/project-id-layout.tsx`
- Modify: `src/features/projects/components/project-id-view.tsx`

- [ ] **Step 17.1: Read current layout**

```bash
cat src/features/projects/components/project-id-layout.tsx
cat src/features/projects/components/project-id-view.tsx
```

The layout uses Allotment (already in package.json). Note the existing pane sizing.

- [ ] **Step 17.2: Add the third Allotment pane**

```tsx
// src/features/projects/components/project-id-layout.tsx (modified excerpt)
import { Allotment } from "allotment"
import { PreviewPane } from "@/features/sandbox/components/preview-pane"
import type { Id } from "@/../convex/_generated/dataModel"

interface ProjectIdLayoutProps {
  projectId: Id<"projects">
  conversation: React.ReactNode
  editor: React.ReactNode
}

export function ProjectIdLayout({ projectId, conversation, editor }: ProjectIdLayoutProps) {
  return (
    <Allotment defaultSizes={[300, 500, 400]}>
      <Allotment.Pane minSize={240}>{conversation}</Allotment.Pane>
      <Allotment.Pane minSize={320}>{editor}</Allotment.Pane>
      <Allotment.Pane minSize={300}>
        <PreviewPane projectId={projectId} />
      </Allotment.Pane>
    </Allotment>
  )
}
```

- [ ] **Step 17.3: Mount useSandbox + status badge in the view**

```tsx
// src/features/projects/components/project-id-view.tsx (modified excerpt)
"use client"
import { useSandbox } from "@/features/sandbox/hooks/use-sandbox"
import { SandboxStatusBadge } from "@/features/sandbox/components/sandbox-status"
import type { Id } from "@/../convex/_generated/dataModel"

export function ProjectIdView({ projectId }: { projectId: Id<"projects"> }) {
  useSandbox(projectId)
  // ...existing rendering...
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        {/* existing nav */}
        <SandboxStatusBadge projectId={projectId} />
      </div>
      {/* ProjectIdLayout invocation, now passing projectId */}
    </div>
  )
}
```

- [ ] **Step 17.4: Manual smoke**

```bash
npm run dev
```

Open a project. Verify:
- Three panes render (conversation + editor + preview).
- Status badge shows "Starting sandbox" → "Installing deps" → "Sandbox ready".
- The preview iframe paints (white at minimum if sandbox boots; if E2B unreachable in dev, badge stays at "Starting" — that's the honest failure).

- [ ] **Step 17.5: Commit**

```bash
git add src/features/projects/components/project-id-layout.tsx src/features/projects/components/project-id-view.tsx
git commit -m "feat(sandbox): integrate PreviewPane + SandboxStatusBadge into project layout"
```

---

## Task 18: ToolExecutor Wiring

**Why:** Sub-plan 01's `ToolExecutor` (`src/lib/tools/executor.ts`) imports `sandboxProvider` and uses it to fulfil `write_file` / `create_file` / `delete_file` / `run_command`. Sub-plan 01 ships those handlers as no-ops or throws. Now that the singleton works, light up the real sandbox calls and add the `ensureSandbox` precondition + `isForbiddenCommand` check.

**Files:**
- Modify: `src/lib/tools/executor.ts`

- [ ] **Step 18.1: Read sub-plan 01's executor**

```bash
cat src/lib/tools/executor.ts
```

Identify the `runCommand` handler and the file-write handlers.

- [ ] **Step 18.2: Wire the sandbox calls**

Inside `runCommand` (after the permission check sub-plan 01 added):

```typescript
import { sandboxProvider, SandboxDeadError } from "@/lib/sandbox"
import { ensureSandbox } from "@/lib/sandbox/lifecycle"
import { isForbiddenCommand } from "@/lib/sandbox/forbidden-commands"

// inside runCommand handler:
if (isForbiddenCommand(input.command)) {
  return {
    ok: false,
    error: `Command is forbidden: ${input.command}. See CONSTITUTION §8.4.`,
    errorCode: "PATH_LOCKED",
  } as const
}

const handle = await ensureSandbox(convexAdapter, ctx.projectId)
try {
  const r = await sandboxProvider.exec(handle.id, input.command, { cwd: input.cwd ?? "/" })
  return {
    ok: true,
    data: {
      stdout: r.stdout.slice(0, 4000),
      stderr: r.stderr.slice(0, 4000),
      exitCode: r.exitCode,
      durationMs: r.durationMs,
    },
  } as const
} catch (err) {
  if (err instanceof SandboxDeadError) {
    return { ok: false, error: err.message, errorCode: "SANDBOX_DEAD" } as const
  }
  if ((err as Error).message?.includes("timed out")) {
    return { ok: false, error: "Command timed out", errorCode: "COMMAND_TIMEOUT" } as const
  }
  throw err
}
```

For `write_file` / `create_file` / `delete_file` (Convex first per §10.2, then E2B):

```typescript
// after the Convex mutation succeeds:
try {
  await sandboxProvider.writeFile(handle.id, input.path, input.content)
} catch (err) {
  if (err instanceof SandboxDeadError) {
    await convexAdapter.markNeedsResync({ projectId: ctx.projectId, value: true })
    return { ok: false, error: err.message, errorCode: "SANDBOX_DEAD" } as const
  }
  throw err
}
return { ok: true, data: {} } as const
```

- [ ] **Step 18.3: Run all unit tests — expect green**

```bash
npm run test:unit
```

The executor tests in sub-plan 01 used `__setSandboxProviderForTests(mockProvider)` — confirm they still pass with the new code path.

- [ ] **Step 18.4: Commit**

```bash
git add src/lib/tools/executor.ts
git commit -m "feat(tools): wire ToolExecutor to sandboxProvider with §10.2 ordering"
```

---

## Task 19: End-to-End Smoke Test

This is verification only — no commit unless bugs are found.

- [ ] **Step 19.1: Boot all services**

```bash
# Terminal 1
npm run dev
# Terminal 2
npx convex dev
# Terminal 3
npx inngest-cli dev
```

- [ ] **Step 19.2: Manual run — happy path**

1. Sign in.
2. Create a new project (or open an existing one with at least a `package.json` and `src/app/page.tsx`).
3. Watch the badge progression: `Starting sandbox` → `Installing deps` → `Sandbox ready`.
4. Watch the preview pane: provisioning → reconciling → iframe paints.
5. In the editor, edit `src/app/page.tsx`. Verify:
   - Convex `files` row updates.
   - Inngest dashboard shows a `file/changed` event.
   - `syncFile` function runs successfully.
   - The preview iframe HMRs (no full reload; the dev server picks up the new content).

- [ ] **Step 19.3: Manual run — sandbox restart**

In Convex dashboard, manually clear `projects[…].sandboxId` (or wait for E2B to reap a 24h sandbox in production). Open the project again. Verify:
- Badge says "Starting sandbox".
- After ~10-30s, badge → "Sandbox ready", iframe loads.
- All previously-saved files appear in the new sandbox (full re-sync per §10.4).

- [ ] **Step 19.4: Manual run — drift recovery**

Manually set `projects[…].sandboxNeedsResync = true` on a project with a live sandbox. Trigger an `ensureSandbox` (re-open the project). Verify:
- Badge briefly shows "Reconciling files".
- All files are re-pushed to E2B.
- `sandboxNeedsResync` is cleared back to `false`.

- [ ] **Step 19.5: Manual run — forbidden command**

Trigger a chat message that pushes the agent to call `run_command` with `npm run dev`. Verify the tool result is `{ ok: false, errorCode: "PATH_LOCKED", error: "Command is forbidden: ..." }` and surfaces in the conversation UI.

- [ ] **Step 19.6: Performance check**

Per CONSTITUTION §14.1 and §14.5:
- Sandbox provision (alive sandbox): <500ms (the `isAlive` round-trip).
- Sandbox provision (cold): P50 <30s.
- Single file write to live sandbox: P50 <500ms.

If any P50 budget is missed by >2x, file an issue. P95 misses are tolerated for v1 per ROADMAP §6 R11.

- [ ] **Step 19.7: No commit (verification step)**

Document failures as follow-ups within the sub-plan if observed.

---

## Task 20: Documentation and Constitutional Review

**Files:**
- Modify: `.env.example` (add E2B-related entries if not yet present from sub-plan 01)

- [ ] **Step 20.1: Confirm `.env.example` lists every sandbox env var**

```bash
grep -E '^E2B_API_KEY|^NEXT_PUBLIC_CONVEX_URL|^POLARIS_CONVEX_INTERNAL_KEY|^INNGEST_EVENT_KEY|^INNGEST_SIGNING_KEY' .env.example
```

If any line missing, add per ROADMAP.md §5:

```bash
# Sandbox
E2B_API_KEY=...
```

- [ ] **Step 20.2: Constitutional re-read pass**

Open `docs/CONSTITUTION.md` and check that every Article-VI / Article-X / Article-XIII rule referenced in this plan is satisfied by the merged code:

- §6.2 rule 1: search the codebase for `e2b`, `E2B`, `Sandbox.create`, `Sandbox.connect` — they must appear ONLY in `src/lib/sandbox/e2b-provider.ts` and `tests/unit/sandbox/e2b-provider.test.ts`.

```bash
grep -rn "@e2b/code-interpreter\|Sandbox\.create\|Sandbox\.connect" src/ convex/ \
  | grep -v "src/lib/sandbox/e2b-provider.ts"
```

Expected: empty output.

- §6.3: search for `new E2BSandboxProvider` — must appear ONLY in `src/lib/sandbox/index.ts`.

```bash
grep -rn "new E2BSandboxProvider" src/
```

Expected: one line (`src/lib/sandbox/index.ts`).

- §10.2 ordering: verify `ToolExecutor.write_file` writes to Convex *before* calling `sandboxProvider.writeFile`. Read sub-plan 01's executor and confirm the `await convex.mutation(...)` call appears before `await sandboxProvider.writeFile(...)`.

- §8.4 forbidden patterns: verify `isForbiddenCommand` is called inside `run_command` before sandbox dispatch.

- §13.6 ceilings: confirm `SandboxOptions.ram` defaults are constrained (we only ship the three enum values). Sandbox cost ceilings per user/day are out of scope for this sub-plan — they live in sub-plan 09 (Hardening). Note this in the deferred section below.

- [ ] **Step 20.3: Commit if anything changed**

```bash
git add .env.example
git commit -m "docs(sandbox): record E2B_API_KEY in .env.example"
```

---

## Self-Review Checklist

Before marking this sub-plan complete, verify:

- [ ] All 20 tasks have green commits.
- [ ] `npm run test:unit` passes (path-utils, mock-sandbox-provider, e2b-provider, forbidden-commands, lifecycle, sandbox-status, preview-url).
- [ ] `npm run typecheck` passes.
- [ ] Manual end-to-end smoke (Task 19) passed all five scenarios.
- [ ] No `// TODO` placeholders or `throw new Error("Not implemented")` in any sandbox file.
- [ ] No imports from `@e2b/code-interpreter` outside `src/lib/sandbox/e2b-provider.ts` (verified with grep, see Task 20.2).
- [ ] No `new E2BSandboxProvider(...)` outside `src/lib/sandbox/index.ts`.
- [ ] All paths flowing into the provider are POSIX (verified via `path-utils.test.ts`).
- [ ] `SandboxProvider` interface is byte-identical to CONSTITUTION §6.2 (no extra methods, none missing).
- [ ] `MockSandboxProvider` implements every interface method.
- [ ] `ensureSandbox` covers all four scenarios (no-cache, alive-clean, alive-dirty, dead).
- [ ] `syncProjectFiles` batches 10-at-a-time and sets `sandboxNeedsResync` on `SandboxDeadError`.
- [ ] `bootApp` runs `npm install` and `npm run dev` both as `execDetached` (CONSTITUTION §8.5).
- [ ] `isForbiddenCommand` rejects `npm run dev`, `sudo`, `rm -rf /` and is exercised by the executor before dispatch.
- [ ] `convex/projects.ts` exports `setSandbox`, `clearSandbox`, `markNeedsResync`, `touchSandbox`, `getSandbox`, `getSandboxStatusForOwner`.
- [ ] Inngest functions `ensureSandboxFn` and `syncFileFn` are registered in `src/app/api/inngest/route.ts`.
- [ ] Project layout shows three panes (conversation + editor + preview).
- [ ] `SandboxStatusBadge` renders five distinguishable states.
- [ ] CONSTITUTION conformance pass: re-read Articles VI, X, XIII §13.6, XIV §14.1/§14.5; spot-check that every cited rule maps to code.

---

## Open Questions Flagged During Authoring

These are not blockers for this sub-plan but should be reviewed during the Phase 1 demo (ROADMAP.md Day 4 coordination):

1. **`SandboxOptions.ram` is interface-level only.** E2B selects RAM at the template level rather than per-`Sandbox.create` call as of the SDK version pinned by sub-plan 01 Task 2. The `ram` parameter in our interface is currently routed through `metadata` for visibility only. If a future provider supports per-sandbox RAM, the implementation already accepts the parameter — no interface change required.
2. **Inngest event firing from Convex actions.** Task 13 uses `fetch` to Inngest's HTTP ingest endpoint. If Convex environment lacks outbound `fetch` to `inn.gs`, switch to a Vercel-hosted relay route. This is a known Convex constraint to verify Day 1 of execution.
3. **Sandbox cost ceiling per user/day** (CONSTITUTION §13.6, §17.4) is deferred to sub-plan 09 (Hardening). The hooks (`metadata.userId` on sandbox creation) are present so the Hardening sub-plan can wire ceilings without re-touching sandbox code.
4. **CodeMirror debounce timing.** The user-edit → Convex → `file/changed` → E2B chain inherits whatever debounce sub-plan 01 (or the existing editor code) sets. If the debounce is shorter than the E2B write latency (~200-500ms), bursts of typing could queue many `syncFile` Inngest runs. The `concurrency.key: event.data.projectId` config in Task 12 caps parallelism per project at 4; observed hot-reload behaviour in Task 19 will tell us whether this is enough.

---

## Deferred to Sub-Plan 01 (Agent Loop)

This sub-plan assumes sub-plan 01 has already created:
- `src/lib/tools/executor.ts` with the six-tool dispatch (Task 18 only wires the sandbox calls into existing handlers).
- `convex/files_by_path.ts` with a `listAll` query returning `{ path, content }[]` for a projectId (lifecycle Task 10 calls it).
- `POLARIS_CONVEX_INTERNAL_KEY` env var set up so the Inngest functions can call internal mutations.
- The Inngest HTTP handler at `src/app/api/inngest/route.ts` (sub-plan 01 Task 1; this sub-plan Task 11 extends the function list).
- The Convex schema migration that introduces `files.path` and `files.updatedBy` (sub-plan 01 Task 12).

If any of those are missing when this sub-plan executes, halt and finish sub-plan 01 first.

## Deferred to Sub-Plan 03 (Scaffolding)

The first agent run of a brand-new project requires the scaffolder to bulk-write the initial Next.js + Supabase file tree to Convex. This sub-plan's `ensureSandbox` then picks up those files on first invocation. The scaffolder itself (prompt → file tree → Convex bulk-write) is sub-plan 03's responsibility.

## Deferred to Sub-Plan 04 (Streaming UI)

The conversation-side rendering of tool call cards that show sandbox operations (e.g. "Running `npm install lodash` in sandbox abc…") is sub-plan 04. This sub-plan ensures the *data* is correct in Convex — sub-plan 04 makes the UI for tool cards beautiful.

## Deferred to Sub-Plan 09 (Hardening)

- Sentry breadcrumbs and metrics for `sandbox.create.duration_ms`, `sandbox.write_file.duration_ms`, `sandbox.exec.duration_ms` (CONSTITUTION §15.3).
- Sandbox cost ceiling enforcement per user/day ($20 Pro, $100 Team — §17.4).
- Circuit breakers around the E2B SDK in case E2B itself returns sustained 5xx.
- Rate limiting `/api/sandbox/ensure` and `/api/sandbox/preview-url` per user.
- Pre-warmed sandbox pool integration (CONSTITUTION §14.1) — currently the lifecycle hits a cold sandbox every time.

## Deferred to Sub-Plan 10 (Launch Prep)

Status-page probes for E2B (CONSTITUTION §15.5) — handled by the launch sub-plan, not here.
