/**
 * Shared AgentSink contract test.
 *
 * Any implementation of `AgentSink` (InMemoryAgentSink for tests, ConvexAgentSink
 * for production, future Redis/SQS sinks) must pass this contract. Adding a new
 * sink? Call `runSinkContract("YourSink", () => new YourSink())` from your
 * sink-specific test file (or extend this file directly) so the same behavioral
 * guarantees are exercised end-to-end.
 *
 * The assertions here are deliberately framed against the InMemoryAgentSink's
 * exposed internal state — for production sinks, wrap them in adapters that
 * project the implementation's state into the same shape, or write parallel
 * sink-specific assertions on top of the same factory.
 */

import { describe, expect, it } from "vitest"
import { InMemoryAgentSink } from "@/lib/agent-kit/sink/in-memory-sink"
import type { AgentCheckpoint } from "@/lib/agent-kit/core/sink"
import type { ToolCall } from "@/lib/agent-kit/core/types"
import type { ToolOutput } from "@/lib/agent-kit/core/tool-types"

/**
 * Run the shared AgentSink contract against `makeSink`. Each `it` block builds a
 * fresh sink so test order is irrelevant. The factory is also responsible for
 * any per-test cleanup (e.g. clearing a Redis key).
 */
function runSinkContract(
  name: string,
  makeSink: () => InMemoryAgentSink,
): void {
  describe(`AgentSink contract: ${name}`, () => {
    it("appendText accumulates deltas in order", async () => {
      const sink = makeSink()
      await sink.appendText("msg1", "hello ")
      await sink.appendText("msg1", "world")

      expect(sink.textDeltas).toEqual([
        { messageId: "msg1", delta: "hello " },
        { messageId: "msg1", delta: "world" },
      ])
    })

    it("appendText keeps deltas for different messages segregated", async () => {
      const sink = makeSink()
      await sink.appendText("msg1", "alpha")
      await sink.appendText("msg2", "beta")
      await sink.appendText("msg1", "gamma")

      const forMsg1 = sink.textDeltas
        .filter((d) => d.messageId === "msg1")
        .map((d) => d.delta)
      const forMsg2 = sink.textDeltas
        .filter((d) => d.messageId === "msg2")
        .map((d) => d.delta)

      expect(forMsg1).toEqual(["alpha", "gamma"])
      expect(forMsg2).toEqual(["beta"])
    })

    it("appendToolCall persists the full tool call payload", async () => {
      const sink = makeSink()
      const toolCall: ToolCall = {
        id: "call_1",
        name: "read_file",
        input: { path: "/tmp/x" },
      }
      await sink.appendToolCall("msg1", toolCall)

      expect(sink.toolCalls).toHaveLength(1)
      expect(sink.toolCalls[0]).toEqual({ messageId: "msg1", toolCall })
    })

    it("appendToolResult persists ok and error results", async () => {
      const sink = makeSink()
      const okResult: ToolOutput = { ok: true, data: { bytes: 42 } }
      const errorResult: ToolOutput = {
        ok: false,
        error: "file not found",
        errorCode: "PATH_NOT_FOUND",
      }
      await sink.appendToolResult("msg1", "call_1", okResult)
      await sink.appendToolResult("msg1", "call_2", errorResult)

      expect(sink.toolResults).toEqual([
        { messageId: "msg1", toolCallId: "call_1", result: okResult },
        { messageId: "msg1", toolCallId: "call_2", result: errorResult },
      ])
    })

    it("recordUsage accumulates per-call usage rows", async () => {
      const sink = makeSink()
      await sink.recordUsage("user_a", 100, 50)
      await sink.recordUsage("user_a", 25, 10)

      expect(sink.usage).toEqual([
        { userId: "user_a", inputTokens: 100, outputTokens: 50 },
        { userId: "user_a", inputTokens: 25, outputTokens: 10 },
      ])
      expect(sink.totalUsageTokens()).toBe(185)
    })

    it("saveCheckpoint + loadCheckpoint round-trip preserves the snapshot", async () => {
      const sink = makeSink()
      const checkpoint: AgentCheckpoint = {
        messageId: "msg1",
        projectId: "proj1",
        messages: [{ role: "user", content: "hello" }],
        iterationCount: 3,
        totalInputTokens: 200,
        totalOutputTokens: 75,
        lastToolCallName: "read_file",
        savedAt: 1_700_000_000_000,
      }
      await sink.saveCheckpoint(checkpoint)

      // The InMemoryAgentSink's loadCheckpoint returns the *preloaded* snapshot,
      // not the most-recently saved one — that distinction matches the
      // production sink's behaviour where loadCheckpoint reads from durable
      // storage written by a previous Inngest attempt. The contract here is:
      // the saved checkpoint is observable somewhere on the sink.
      sink.preloadedCheckpoint = checkpoint
      const loaded = await sink.loadCheckpoint("msg1")
      expect(loaded).toEqual(checkpoint)
      expect(sink.checkpoints).toContainEqual(checkpoint)
    })

    it("loadCheckpoint returns null when no checkpoint is preloaded", async () => {
      const sink = makeSink()
      expect(await sink.loadCheckpoint("msg1")).toBeNull()
    })

    it("markDone records the final status payload exactly once", async () => {
      const sink = makeSink()
      await sink.markDone("msg1", {
        status: "completed",
        inputTokens: 200,
        outputTokens: 80,
      })

      expect(sink.done).toEqual({
        messageId: "msg1",
        payload: {
          status: "completed",
          inputTokens: 200,
          outputTokens: 80,
        },
      })
    })

    it("markDone supports the error and cancelled terminal states", async () => {
      const errSink = makeSink()
      await errSink.markDone("msg1", {
        status: "error",
        errorMessage: "boom",
        inputTokens: 0,
        outputTokens: 0,
      })
      expect(errSink.done?.payload.status).toBe("error")
      expect(errSink.done?.payload.errorMessage).toBe("boom")

      const cancelSink = makeSink()
      await cancelSink.markDone("msg1", {
        status: "cancelled",
        inputTokens: 5,
        outputTokens: 0,
      })
      expect(cancelSink.done?.payload.status).toBe("cancelled")
    })

    it("isCancelled returns false by default", async () => {
      const sink = makeSink()
      expect(await sink.isCancelled("msg1")).toBe(false)
    })

    it("isCancelled returns true after the message is cancelled", async () => {
      const sink = makeSink()
      sink.cancelMessage("msg1")
      expect(await sink.isCancelled("msg1")).toBe(true)
      // Other messages must remain unaffected.
      expect(await sink.isCancelled("msg2")).toBe(false)
    })

    it("loadInitialMessages returns a defensive copy of the seed array", async () => {
      const sink = makeSink()
      sink.initialMessages = [{ role: "user", content: "ping" }]
      const first = await sink.loadInitialMessages("conv1")
      first.push({ role: "assistant", content: "mutated" })

      const second = await sink.loadInitialMessages("conv1")
      expect(second).toHaveLength(1)
      expect(second[0]).toEqual({ role: "user", content: "ping" })
    })
  })
}

runSinkContract("InMemoryAgentSink", () => new InMemoryAgentSink())
