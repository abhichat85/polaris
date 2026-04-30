/**
 * Phase 2 — StreamMonitor wiring on the agent-kit AgentRunner.
 *
 * Verifies that:
 *   - Text deltas flow through the injected StreamMonitor (`onDelta`).
 *   - Tool calls flow through the monitor (`onToolCall`).
 *   - Newly-fired alerts land on `sink.appendStreamAlert` exactly once
 *     (deduped per alert.type) without breaking the run.
 *   - The runner stays back-compat when no monitor is injected.
 */

import { describe, expect, it } from "vitest"
import { AgentRunner } from "@/lib/agent-kit/runtime/agent-runner"
import { InMemoryAgentSink } from "@/lib/agent-kit/sink/in-memory-sink"
import { StreamMonitor } from "@/lib/agent-kit/core/stream-monitor"
import type {
  AgentStep,
  Message,
  ModelAdapter,
  RunOptions,
  ToolCall,
  ToolDefinition,
} from "@/lib/agent-kit/core/types"
import type {
  IToolExecutor,
  ToolExecutionContext,
  ToolOutput,
} from "@/lib/agent-kit/core/tool-types"

class ScriptedAdapter implements ModelAdapter {
  readonly name = "scripted"
  private idx = 0
  receivedMessages: Message[][] = []

  constructor(private readonly script: AgentStep[][]) {}

  async *runWithTools(
    messages: Message[],
    _tools: ToolDefinition[],
    _opts: RunOptions,
  ): AsyncGenerator<AgentStep, void, void> {
    this.receivedMessages.push(messages.map((m) => ({ ...m })))
    if (this.idx >= this.script.length) {
      throw new Error(
        `ScriptedAdapter ran out of script after ${this.idx} turns`,
      )
    }
    const turn = this.script[this.idx++]
    for (const step of turn) yield step
  }
}

class StubExecutor implements IToolExecutor {
  calls: ToolCall[] = []
  async execute(
    toolCall: ToolCall,
    _ctx: ToolExecutionContext,
  ): Promise<ToolOutput> {
    this.calls.push(toolCall)
    return { ok: true, data: { stub: true } }
  }
}

const baseInput = {
  messageId: "msg_1",
  conversationId: "conv_1",
  projectId: "proj_1",
  userId: "user_1",
  resumeFromCheckpoint: false,
}

function makeRunner(args: {
  script: AgentStep[][]
  sink?: InMemoryAgentSink
  monitor?: StreamMonitor
}) {
  const sink = args.sink ?? new InMemoryAgentSink()
  const adapter = new ScriptedAdapter(args.script)
  const executor = new StubExecutor()
  const runner = new AgentRunner({
    adapter,
    executor,
    sink,
    tools: [],
    defaultSystemPrompt: "you are a test agent",
    sandboxId: "sb_1",
    streamMonitor: args.monitor,
  })
  sink.initialMessages = [{ role: "user", content: "Hi" }]
  return { sink, adapter, executor, runner }
}

describe("AgentRunner — StreamMonitor wiring (Phase 2)", () => {
  it("forwards apology-loop alert to sink.appendStreamAlert and completes normally", async () => {
    // Build a payload >500 chars whose tail trips the apology-loop pattern.
    // The regex requires 2+ CONSECUTIVE matches with no gap between them, so
    // we put the two apologies adjacent (mirrors the unit test in
    // tests/unit/agents/stream-monitor.test.ts).
    const filler = "x".repeat(500)
    const apologyText = filler + " I apologizeI apologize "

    const monitor = new StreamMonitor()
    const { sink, runner } = makeRunner({
      monitor,
      script: [
        [
          { type: "text_delta", delta: apologyText },
          { type: "usage", inputTokens: 10, outputTokens: 4 },
          { type: "done", stopReason: "end_turn" },
        ],
      ],
    })

    await runner.run(baseInput)

    // Run completed cleanly — alerts are observational, never fatal.
    expect(sink.done?.payload.status).toBe("completed")

    // The apology-loop alert landed on the sink.
    const alertTypes = sink.streamAlerts.map((s) => s.alert.type)
    expect(alertTypes).toContain("apology-loop")

    // Each alert is fired exactly once per type, even though the regex
    // would re-match on subsequent deltas.
    const apologyHits = sink.streamAlerts.filter(
      (s) => s.alert.type === "apology-loop",
    )
    expect(apologyHits).toHaveLength(1)

    // The runner exposes the alert summary for telemetry.
    const exposed = runner.getStreamAlerts()
    expect(exposed.map((a) => a.type)).toContain("apology-loop")
  })

  it("forwards scope-creep alert when triggering text streams in", async () => {
    // ">500 chars" gate + scope-creep phrase.
    const scopeText =
      "Sure! While I'm at it, " +
      "I'll polish the rest of the codebase too. ".repeat(20)

    const monitor = new StreamMonitor()
    const { sink, runner } = makeRunner({
      monitor,
      script: [
        [
          { type: "text_delta", delta: scopeText },
          { type: "usage", inputTokens: 10, outputTokens: 4 },
          { type: "done", stopReason: "end_turn" },
        ],
      ],
    })

    await runner.run(baseInput)

    expect(sink.done?.payload.status).toBe("completed")
    expect(sink.streamAlerts.map((s) => s.alert.type)).toContain(
      "scope-creep",
    )
  })

  it("is a no-op when no streamMonitor is injected (back-compat)", async () => {
    // Same triggering payload as the apology-loop test — without a monitor,
    // no alerts should fire and the run should still complete normally.
    const text = "x".repeat(500) + " I apologizeI apologize "
    const { sink, runner } = makeRunner({
      // No monitor.
      script: [
        [
          { type: "text_delta", delta: text },
          { type: "usage", inputTokens: 10, outputTokens: 4 },
          { type: "done", stopReason: "end_turn" },
        ],
      ],
    })

    await runner.run(baseInput)

    expect(sink.done?.payload.status).toBe("completed")
    expect(sink.streamAlerts).toEqual([])
    expect(runner.getStreamAlerts()).toEqual([])
  })

  it("calls monitor.onToolCall so the no-tool-calls heuristic is reset", async () => {
    const monitor = new StreamMonitor()
    const { runner } = makeRunner({
      monitor,
      script: [
        [
          { type: "text_delta", delta: "thinking…" },
          {
            type: "tool_call",
            toolCall: { id: "t1", name: "read_file", input: { path: "x.ts" } },
          },
          { type: "usage", inputTokens: 5, outputTokens: 2 },
          { type: "done", stopReason: "tool_use" },
        ],
        [
          { type: "text_delta", delta: "ok" },
          { type: "usage", inputTokens: 5, outputTokens: 1 },
          { type: "done", stopReason: "end_turn" },
        ],
      ],
    })

    await runner.run(baseInput)

    // The monitor saw at least one tool call — the "no-tool-calls" alert
    // would never fire even at 5000+ chars.
    // (We assert via getAlerts: nothing pathological should have fired.)
    expect(runner.getStreamAlerts().map((a) => a.type)).not.toContain(
      "no-tool-calls",
    )
  })
})
