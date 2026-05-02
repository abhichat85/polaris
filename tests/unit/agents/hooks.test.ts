/**
 * Tests for the hook system — D-055 / Phase 2.2.
 */
import { describe, expect, it, vi } from "vitest"
import {
  HookRunner,
  InMemoryHookRunner,
} from "@/lib/agents/hooks/hook-runner"
import type {
  HookConfig,
  HookContext,
  HookPayload,
  HookDecision,
} from "@/lib/agents/hooks/types"

const ctx: HookContext = {
  projectId: "p1",
  userId: "u1",
  messageId: "m1",
  conversationId: "c1",
  iteration: 0,
}

const samplePayload: HookPayload = {
  event: "pre_tool_call",
  ctx,
  toolCall: { id: "t1", name: "edit_file", input: { path: "src/x.ts" } },
}

function fnHook(
  id: string,
  fn: (payload: HookPayload) => Promise<HookDecision>,
  overrides: Partial<HookConfig> = {},
): HookConfig {
  return {
    id,
    event: "pre_tool_call",
    target: { type: "function", fn },
    ...overrides,
  }
}

describe("HookRunner", () => {
  it("returns 'continue' when no hooks are registered", async () => {
    const runner = new InMemoryHookRunner()
    const r = await runner.runEvent("pre_tool_call", samplePayload)
    expect(r.decision.decision).toBe("continue")
    expect(r.invokedIds).toEqual([])
  })

  it("ignores hooks for other events", async () => {
    const fn = vi.fn(async () => ({ decision: "deny" as const, reason: "x" }))
    const runner = new InMemoryHookRunner([
      { id: "h1", event: "post_tool_call", target: { type: "function", fn } },
    ])
    const r = await runner.runEvent("pre_tool_call", samplePayload)
    expect(r.decision.decision).toBe("continue")
    expect(fn).not.toHaveBeenCalled()
  })

  it("ignores disabled hooks", async () => {
    const fn = vi.fn(async () => ({ decision: "deny" as const, reason: "x" }))
    const runner = new InMemoryHookRunner([
      fnHook("h1", fn, { enabled: false }),
    ])
    const r = await runner.runEvent("pre_tool_call", samplePayload)
    expect(r.decision.decision).toBe("continue")
    expect(fn).not.toHaveBeenCalled()
  })

  it("first 'deny' short-circuits subsequent hooks", async () => {
    const fn1 = vi.fn(async () => ({ decision: "deny" as const, reason: "blocked by policy" }))
    const fn2 = vi.fn(async () => ({ decision: "continue" as const }))
    const runner = new InMemoryHookRunner([
      fnHook("h1", fn1),
      fnHook("h2", fn2),
    ])
    const r = await runner.runEvent("pre_tool_call", samplePayload)
    expect(r.decision.decision).toBe("deny")
    expect(r.invokedIds).toEqual(["h1"])
    expect(fn2).not.toHaveBeenCalled()
  })

  it("merges 'modify' decisions across hooks", async () => {
    const fn1 = vi.fn(async () => ({
      decision: "modify" as const,
      inputPatch: { a: 1 },
    }))
    const fn2 = vi.fn(async () => ({
      decision: "modify" as const,
      inputPatch: { b: 2 },
    }))
    const runner = new InMemoryHookRunner([
      fnHook("h1", fn1),
      fnHook("h2", fn2),
    ])
    const r = await runner.runEvent("pre_tool_call", samplePayload)
    expect(r.decision.decision).toBe("modify")
    if (r.decision.decision === "modify") {
      expect(r.decision.inputPatch).toEqual({ a: 1, b: 2 })
    }
  })

  it("later modify overrides earlier modify on same field", async () => {
    const fn1 = vi.fn(async () => ({
      decision: "modify" as const,
      inputPatch: { path: "src/old.ts" },
    }))
    const fn2 = vi.fn(async () => ({
      decision: "modify" as const,
      inputPatch: { path: "src/new.ts" },
    }))
    const runner = new InMemoryHookRunner([
      fnHook("h1", fn1),
      fnHook("h2", fn2),
    ])
    const r = await runner.runEvent("pre_tool_call", samplePayload)
    if (r.decision.decision === "modify") {
      expect(r.decision.inputPatch.path).toBe("src/new.ts")
    }
  })

  it("invokedIds tracks every called hook", async () => {
    const fn = vi.fn(async () => ({ decision: "continue" as const }))
    const runner = new InMemoryHookRunner([
      fnHook("h1", fn),
      fnHook("h2", fn),
      fnHook("h3", fn),
    ])
    const r = await runner.runEvent("pre_tool_call", samplePayload)
    expect(r.invokedIds).toEqual(["h1", "h2", "h3"])
  })

  it("failMode=open continues past hook errors", async () => {
    const fn1 = vi.fn(async () => {
      throw new Error("boom")
    })
    const fn2 = vi.fn(async () => ({ decision: "continue" as const }))
    const runner = new InMemoryHookRunner([
      fnHook("h1", fn1, { failMode: "open" }),
      fnHook("h2", fn2),
    ])
    const r = await runner.runEvent("pre_tool_call", samplePayload)
    expect(r.failedIds).toEqual(["h1"])
    expect(r.invokedIds).toEqual(["h2"])
    expect(r.decision.decision).toBe("continue")
  })

  it("failMode=closed denies on hook error", async () => {
    const fn1 = vi.fn(async () => {
      throw new Error("validator service down")
    })
    const fn2 = vi.fn(async () => ({ decision: "continue" as const }))
    const runner = new InMemoryHookRunner([
      fnHook("h1", fn1, { failMode: "closed" }),
      fnHook("h2", fn2),
    ])
    const r = await runner.runEvent("pre_tool_call", samplePayload)
    expect(r.decision.decision).toBe("deny")
    expect(r.failedIds).toEqual(["h1"])
    expect(fn2).not.toHaveBeenCalled()
  })

  it("times out hooks that exceed timeoutMs", async () => {
    const slow = vi.fn(
      () => new Promise<HookDecision>((res) => setTimeout(() => res({ decision: "continue" }), 100)),
    )
    const runner = new InMemoryHookRunner([
      fnHook("slow", slow, { timeoutMs: 10, failMode: "open" }),
    ])
    const r = await runner.runEvent("pre_tool_call", samplePayload)
    expect(r.failedIds).toContain("slow")
  })

  it("HTTP hook posts payload and parses decision", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ decision: "deny", reason: "no" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    const original = globalThis.fetch
    // @ts-expect-error stub for test
    globalThis.fetch = fetchImpl
    try {
      const runner = new InMemoryHookRunner([
        {
          id: "http",
          event: "pre_tool_call",
          target: { type: "http", url: "https://hooks.example.com/policy" },
        },
      ])
      const r = await runner.runEvent("pre_tool_call", samplePayload)
      expect(r.decision.decision).toBe("deny")
      expect(fetchImpl).toHaveBeenCalledOnce()
      const [calledUrl, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
      expect(calledUrl).toBe("https://hooks.example.com/policy")
      expect(init.method).toBe("POST")
      expect(JSON.parse(init.body as string)).toMatchObject({
        event: "pre_tool_call",
      })
    } finally {
      globalThis.fetch = original
    }
  })

  it("HTTP hook returns deny on non-OK response (failMode default open)", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("bad", { status: 500, statusText: "Internal" }),
    )
    const original = globalThis.fetch
    // @ts-expect-error stub
    globalThis.fetch = fetchImpl
    try {
      const runner = new InMemoryHookRunner([
        {
          id: "http",
          event: "pre_tool_call",
          target: { type: "http", url: "https://example.com/x" },
          failMode: "open",
        },
      ])
      const r = await runner.runEvent("pre_tool_call", samplePayload)
      expect(r.failedIds).toContain("http")
      expect(r.decision.decision).toBe("continue")
    } finally {
      globalThis.fetch = original
    }
  })

  it("validates HTTP hook response shape", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ decision: "garbage" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    const original = globalThis.fetch
    // @ts-expect-error stub
    globalThis.fetch = fetchImpl
    try {
      const runner = new InMemoryHookRunner([
        {
          id: "http",
          event: "pre_tool_call",
          target: { type: "http", url: "https://example.com/x" },
          failMode: "closed",
        },
      ])
      const r = await runner.runEvent("pre_tool_call", samplePayload)
      expect(r.decision.decision).toBe("deny")
      expect(r.failedIds).toContain("http")
    } finally {
      globalThis.fetch = original
    }
  })

  it("post_tool_call: 'transform_output' replaces the output", async () => {
    const replacement = { ok: true, data: { transformed: true } } as const
    const runner = new InMemoryHookRunner([
      {
        id: "post1",
        event: "post_tool_call",
        target: {
          type: "function",
          fn: async () => ({
            decision: "transform_output",
            outputPatch: replacement,
          }),
        },
      },
    ])
    const r = await runner.runEvent("post_tool_call", {
      event: "post_tool_call",
      ctx,
      toolCall: { id: "t1", name: "read_file", input: {} },
      output: { ok: true, data: { content: "original" } },
    })
    if (r.decision.decision === "transform_output") {
      expect(r.decision.outputPatch).toBe(replacement)
    } else {
      throw new Error("expected transform_output decision")
    }
  })
})
