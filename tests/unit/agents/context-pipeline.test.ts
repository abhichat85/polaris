/**
 * Tests for multi-stage compaction pipeline — D-054 / Phase 2.3.
 */
import { describe, expect, it, vi } from "vitest"
import {
  budgetReduction,
  snip,
  microcompact,
  contextCollapse,
  autoCompact,
  runCompactionPipeline,
  estimateTokens,
  estimateMessageTokens,
  totalTokens,
  type PipelineDeps,
} from "@/lib/agents/context-pipeline"
import type { Message } from "@/lib/agents/types"

/** Build an assistant tool_use message + matching user tool_result message. */
function toolPair(toolUseId: string, name: string, content: string): Message[] {
  return [
    {
      role: "assistant",
      content: [
        { type: "tool_use", id: toolUseId, name, input: {} },
      ],
    },
    {
      role: "user",
      content: [
        { type: "tool_result", toolUseId, content },
      ],
    },
  ]
}

describe("token estimation", () => {
  it("estimates ~3.7 chars per token", () => {
    // 100 chars → ~27 tokens (100 / 3.7 = 27.03)
    const tokens = estimateTokens("a".repeat(100))
    expect(tokens).toBeGreaterThan(20)
    expect(tokens).toBeLessThan(35)
  })

  it("handles string-content messages", () => {
    const m: Message = { role: "user", content: "hello world" }
    expect(estimateMessageTokens(m)).toBeGreaterThan(0)
  })

  it("sums across content blocks", () => {
    const m: Message = {
      role: "assistant",
      content: [
        { type: "text", text: "hi" },
        { type: "tool_use", id: "x", name: "foo", input: { a: 1 } },
      ],
    }
    expect(estimateMessageTokens(m)).toBeGreaterThan(estimateTokens("hi"))
  })

  it("totalTokens sums all messages", () => {
    const ms: Message[] = [
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
    ]
    expect(totalTokens(ms)).toBe(estimateMessageTokens(ms[0]) + estimateMessageTokens(ms[1]))
  })
})

describe("budget-reduction", () => {
  it("does nothing when no old large results exist", async () => {
    const ms = [
      { role: "user" as const, content: "hi" },
      { role: "assistant" as const, content: "hello" },
    ]
    const r = await budgetReduction.apply(ms, 100, {})
    expect(r.applied).toBe(false)
    expect(r.messages).toEqual(ms)
  })

  it("strips bodies of old + large tool_results", async () => {
    // Build 12 turns; first is old (>10 ago) with a 6KB tool_result
    const old = "x".repeat(6000)
    const ms: Message[] = [
      ...toolPair("tu1", "read_file", old),
      // 11 filler turns to push the first turn out of the recency window
      ...Array.from({ length: 22 }, (_, i) => ({
        role: (i % 2 === 0 ? "assistant" : "user") as "assistant" | "user",
        content: `filler ${i}`,
      })),
    ]
    const r = await budgetReduction.apply(ms, 100, {})
    expect(r.applied).toBe(true)
    // Find the tool_result block — its content should be a stub
    const resultMsg = r.messages[1]
    if (typeof resultMsg.content === "string") throw new Error("expected blocks")
    const stub = resultMsg.content.find((b) => b.type === "tool_result")
    expect(stub?.type).toBe("tool_result")
    if (stub?.type === "tool_result") {
      expect(stub.content).toContain("truncated by budget-reduction")
      expect(stub.content).toContain("read_file")
    }
  })

  it("preserves recent tool_results even if large", async () => {
    const big = "x".repeat(6000)
    const ms: Message[] = [
      { role: "user", content: "start" },
      ...toolPair("tu1", "read_file", big),
    ]
    const r = await budgetReduction.apply(ms, 100, {})
    expect(r.applied).toBe(false)
  })
})

describe("snip", () => {
  it("snips middle of long tool_results regardless of recency", async () => {
    const long = "head_section_" + "x".repeat(3000) + "_tail_section"
    const ms: Message[] = toolPair("tu1", "search_code", long)
    const r = await snip.apply(ms, 100, {})
    expect(r.applied).toBe(true)
    const msg = r.messages[1]
    if (typeof msg.content === "string") throw new Error("expected blocks")
    const block = msg.content.find((b) => b.type === "tool_result")
    if (block?.type === "tool_result") {
      expect(block.content).toContain("head_section_")
      expect(block.content).toContain("_tail_section")
      expect(block.content).toContain("elided by snip")
      expect(block.content.length).toBeLessThan(long.length)
    }
  })

  it("does nothing for short tool_results", async () => {
    const ms = toolPair("tu1", "read_file", "small output")
    const r = await snip.apply(ms, 100, {})
    expect(r.applied).toBe(false)
  })
})

describe("microcompact", () => {
  it("skips when no summarizer wired", async () => {
    const ms: Message[] = [
      ...toolPair("tu1", "read_file", "result1"),
      ...toolPair("tu2", "read_file", "result2"),
      ...toolPair("tu3", "read_file", "result3"),
    ]
    const r = await microcompact.apply(ms, 100, {})
    expect(r.applied).toBe(false)
  })

  it("collapses runs of >=3 tool turns into a single summary", async () => {
    const summarize = vi.fn(async () => "compacted summary of 3 tool calls")
    // Need to push these tool turns out of the recency window (last 10).
    // Build 10 filler turns AFTER the cluster.
    const ms: Message[] = [
      ...toolPair("tu1", "read_file", "result1"),
      ...toolPair("tu2", "read_file", "result2"),
      ...toolPair("tu3", "read_file", "result3"),
      ...Array.from({ length: 12 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `filler ${i}`,
      })),
    ]
    const r = await microcompact.apply(ms, 100, { summarize })
    expect(r.applied).toBe(true)
    expect(summarize).toHaveBeenCalledOnce()
    // Original 6 messages should now be 1 summary message
    expect(r.messages.length).toBeLessThan(ms.length)
    expect(r.messages[0].content).toContain("compacted summary")
  })

  it("does NOT touch the recency window (last 10 turns)", async () => {
    const summarize = vi.fn(async () => "should not be called")
    // 3 tool pairs (6 messages) — all within recency window
    const ms: Message[] = [
      ...toolPair("tu1", "read_file", "r1"),
      ...toolPair("tu2", "read_file", "r2"),
      ...toolPair("tu3", "read_file", "r3"),
    ]
    const r = await microcompact.apply(ms, 100, { summarize })
    expect(r.applied).toBe(false)
    expect(summarize).not.toHaveBeenCalled()
  })

  it("does NOT collapse runs shorter than 3 tool turns", async () => {
    const summarize = vi.fn(async () => "x")
    const ms: Message[] = [
      ...toolPair("tu1", "read_file", "r1"),
      ...toolPair("tu2", "read_file", "r2"),
      ...Array.from({ length: 12 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `filler ${i}`,
      })),
    ]
    // Cluster of 2 → not collapsed
    const r = await microcompact.apply(ms, 100, { summarize })
    expect(r.applied).toBe(false)
  })
})

describe("context-collapse", () => {
  it("skips when summarizer absent", async () => {
    const ms = Array.from({ length: 30 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `turn ${i}`,
    }))
    const r = await contextCollapse.apply(ms, 100, {})
    expect(r.applied).toBe(false)
  })

  it("skips when conversation shorter than threshold", async () => {
    const summarize = vi.fn(async () => "x")
    const ms = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `turn ${i}`,
    }))
    const r = await contextCollapse.apply(ms, 100, { summarize })
    expect(r.applied).toBe(false)
    expect(summarize).not.toHaveBeenCalled()
  })

  it("collapses old turns into one summary message, preserves recent 20", async () => {
    const summarize = vi.fn(async () => "story so far summary")
    const ms = Array.from({ length: 30 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `turn ${i}`,
    }))
    const r = await contextCollapse.apply(ms, 100, { summarize })
    expect(r.applied).toBe(true)
    expect(summarize).toHaveBeenCalledOnce()
    // Result: 1 summary + 20 recent = 21 messages
    expect(r.messages).toHaveLength(21)
    expect(r.messages[0].content).toContain("story so far summary")
    expect(r.messages[1].content).toBe("turn 10")
  })
})

describe("auto-compact (legacy)", () => {
  it("delegates to deps.compact and replaces conversation", async () => {
    const compact = vi.fn(async () => ({
      artifact: "full conversation summary",
      inputTokens: 1000,
      outputTokens: 200,
    }))
    const ms: Message[] = [
      { role: "user", content: "build me X" },
      { role: "assistant", content: "ok" },
    ]
    const r = await autoCompact.apply(ms, 100, { compact })
    expect(r.applied).toBe(true)
    expect(compact).toHaveBeenCalledOnce()
    expect(r.messages).toHaveLength(1)
    expect(r.messages[0].content).toContain("full conversation summary")
  })

  it("skips when deps.compact absent", async () => {
    const r = await autoCompact.apply(
      [{ role: "user", content: "x" }],
      100,
      {},
    )
    expect(r.applied).toBe(false)
  })
})

describe("runCompactionPipeline", () => {
  it("returns unchanged when already under target", async () => {
    const ms: Message[] = [{ role: "user", content: "tiny" }]
    const r = await runCompactionPipeline(ms, 1000, {})
    expect(r.applied).toEqual([])
    expect(r.messages).toEqual(ms)
  })

  it("exits early after free strategies if they suffice", async () => {
    const summarize = vi.fn(async () => "summary")
    const compact = vi.fn(async () => ({
      artifact: "x",
      inputTokens: 0,
      outputTokens: 0,
    }))
    // Build a conversation where snip alone gets us under target.
    // Pre-snip: 5000-byte tool_result → ~1352 tokens
    // Post-snip: ~1000 chars head+tail+marker → ~270 tokens
    const long = "x".repeat(5000)
    const ms: Message[] = [
      { role: "user", content: "start" },
      ...toolPair("tu1", "read_file", long),
    ]
    // Target = 400 tokens. Pre-snip > 400, post-snip < 400 → stop at snip.
    const r = await runCompactionPipeline(ms, 400, { summarize, compact })
    expect(r.applied).toContain("snip")
    expect(summarize).not.toHaveBeenCalled()
    expect(compact).not.toHaveBeenCalled()
  })

  it("falls through to auto-compact for pathological cases", async () => {
    // Conversation of N short messages — too small to snip, no tool clusters.
    // Still over target → eventually auto-compact fires.
    const summarize = vi.fn(async () => "summary")
    const compact = vi.fn(async () => ({
      artifact: "compacted",
      inputTokens: 0,
      outputTokens: 0,
    }))
    const ms: Message[] = Array.from({ length: 100 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: "moderately long message ".repeat(20),
    }))
    const r = await runCompactionPipeline(ms, 50, { summarize, compact })
    expect(r.applied).toContain("auto-compact")
    expect(r.messages).toHaveLength(1)
  })

  it("records every applied strategy in order", async () => {
    const summarize = vi.fn(async () => "S")
    const compact = vi.fn(async () => ({
      artifact: "C",
      inputTokens: 0,
      outputTokens: 0,
    }))
    // Build a conversation that triggers budget-reduction + snip but then
    // is small enough to stop.
    const old = "x".repeat(8000)
    const ms: Message[] = [
      ...toolPair("tu0", "read_file", old),
      ...Array.from({ length: 30 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: "short " + i,
      })),
    ]
    const r = await runCompactionPipeline(ms, 200, { summarize, compact })
    expect(r.applied[0]).toBe("budget-reduction")
  })
})
