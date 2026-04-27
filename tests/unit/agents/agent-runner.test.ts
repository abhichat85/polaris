import { describe, it, expect, vi } from "vitest"
import { AgentRunner } from "@/lib/agents/agent-runner"
import type { VerifyResult } from "@/lib/agents/verifier"
import { InMemoryAgentSink } from "@/lib/agents/in-memory-sink"
import { InMemoryFileService } from "@/lib/files/in-memory-file-service"
import { MockSandboxProvider } from "@/lib/sandbox/mock-provider"
import { ToolExecutor } from "@/lib/tools/executor"
import type {
  AgentStep,
  Message,
  ModelAdapter,
  RunOptions,
  ToolDefinition,
} from "@/lib/agents/types"

/**
 * Scriptable adapter — yields scripted AgentStep arrays per call. Each script
 * entry is one full model "turn." When the script runs out, throws a clear
 * error so tests fail fast on overshoot.
 */
class ScriptedAdapter implements ModelAdapter {
  readonly name = "scripted"
  private scriptIdx = 0
  receivedMessages: Message[][] = []

  constructor(private readonly script: AgentStep[][]) {}

  async *runWithTools(
    messages: Message[],
    _tools: ToolDefinition[],
    _opts: RunOptions,
  ): AsyncGenerator<AgentStep, void, void> {
    this.receivedMessages.push(messages.map((m) => ({ ...m })))
    if (this.scriptIdx >= this.script.length) {
      throw new Error(`ScriptedAdapter ran out of script after ${this.scriptIdx} turns`)
    }
    const turn = this.script[this.scriptIdx++]
    for (const step of turn) yield step
  }
}

const baseInput = {
  messageId: "msg_1",
  conversationId: "conv_1",
  projectId: "proj_1",
  userId: "user_1",
  resumeFromCheckpoint: false,
}

type VerifyFn = (paths: ReadonlySet<string>) => Promise<VerifyResult>

async function makeFixture(
  script: AgentStep[][],
  opts?: { verify?: VerifyFn },
) {
  const sink = new InMemoryAgentSink()
  const files = new InMemoryFileService()
  const sandbox = new MockSandboxProvider()
  const sb = await sandbox.create("nextjs-supabase", {})
  const adapter = new ScriptedAdapter(script)
  const executor = new ToolExecutor({ files, sandbox })
  const runner = new AgentRunner({
    adapter,
    executor,
    sink,
    sandboxId: sb.id,
    verify: opts?.verify,
  })
  // Seed an initial user message
  sink.initialMessages = [{ role: "user", content: "Build me a login page" }]
  return { sink, files, sandbox, sb, adapter, runner }
}

describe("AgentRunner — happy path", () => {
  it("emits text deltas to the sink in order, then marks done as completed", async () => {
    const { sink, runner } = await makeFixture([
      [
        { type: "text_delta", delta: "Sure, " },
        { type: "text_delta", delta: "I'll do that." },
        { type: "usage", inputTokens: 10, outputTokens: 4 },
        { type: "done", stopReason: "end_turn" },
      ],
    ])

    await runner.run(baseInput)

    expect(sink.textDeltas.map((t) => t.delta)).toEqual(["Sure, ", "I'll do that."])
    expect(sink.done?.payload.status).toBe("completed")
    expect(sink.done?.payload.inputTokens).toBe(10)
    expect(sink.done?.payload.outputTokens).toBe(4)
  })

  it("records usage on the sink", async () => {
    const { sink, runner } = await makeFixture([
      [
        { type: "usage", inputTokens: 100, outputTokens: 50 },
        { type: "done", stopReason: "end_turn" },
      ],
    ])

    await runner.run(baseInput)

    expect(sink.usage).toEqual([{ userId: "user_1", inputTokens: 100, outputTokens: 50 }])
  })
})

describe("AgentRunner — tool calls (Layer 2: failures fed back to model)", () => {
  it("executes a tool call and feeds the result back to the model on next turn", async () => {
    const { sink, runner, files } = await makeFixture([
      // Turn 1: model wants to read a file
      [
        { type: "text_delta", delta: "Reading…" },
        {
          type: "tool_call",
          toolCall: { id: "toolu_1", name: "read_file", input: { path: "src/x.ts" } },
        },
        { type: "usage", inputTokens: 10, outputTokens: 5 },
        { type: "done", stopReason: "tool_use" },
      ],
      // Turn 2: model finishes
      [
        { type: "text_delta", delta: "Done." },
        { type: "usage", inputTokens: 20, outputTokens: 3 },
        { type: "done", stopReason: "end_turn" },
      ],
    ])
    await files.createPath("proj_1", "src/x.ts", "const x = 1", "user")

    await runner.run(baseInput)

    expect(sink.toolCalls).toHaveLength(1)
    expect(sink.toolResults).toHaveLength(1)
    expect(sink.toolResults[0].result).toMatchObject({
      ok: true,
      data: { content: "const x = 1" },
    })
    expect(sink.done?.payload.status).toBe("completed")
  })

  it("feeds tool errors back to the model so it can adapt (Layer 2)", async () => {
    const { sink, runner, adapter } = await makeFixture([
      // Turn 1: model tries to write package.json (PATH_LOCKED)
      [
        {
          type: "tool_call",
          toolCall: {
            id: "toolu_1",
            name: "write_file",
            input: { path: "package.json", content: "{}" },
          },
        },
        { type: "usage", inputTokens: 10, outputTokens: 5 },
        { type: "done", stopReason: "tool_use" },
      ],
      // Turn 2: model uses run_command instead
      [
        {
          type: "tool_call",
          toolCall: {
            id: "toolu_2",
            name: "run_command",
            input: { command: "npm install lodash" },
          },
        },
        { type: "usage", inputTokens: 20, outputTokens: 5 },
        { type: "done", stopReason: "tool_use" },
      ],
      // Turn 3: model finishes
      [
        { type: "text_delta", delta: "Done." },
        { type: "usage", inputTokens: 30, outputTokens: 3 },
        { type: "done", stopReason: "end_turn" },
      ],
    ])

    await runner.run(baseInput)

    // Turn 1: PATH_LOCKED error result captured
    expect(sink.toolResults[0].result).toMatchObject({
      ok: false,
      errorCode: "PATH_LOCKED",
    })

    // Turn 2 model received messages: should include the tool_result with isError
    const turn2Messages = adapter.receivedMessages[1]
    const toolResultMessage = turn2Messages.find(
      (m) =>
        m.role === "tool" &&
        Array.isArray(m.content) &&
        m.content.some((b: any) => b.type === "tool_result" && b.isError),
    )
    expect(toolResultMessage).toBeDefined()

    expect(sink.done?.payload.status).toBe("completed")
  })
})

describe("AgentRunner — Layer 3 (checkpoints)", () => {
  it("saves a checkpoint after each tool-using iteration", async () => {
    const { sink, runner, files } = await makeFixture([
      [
        {
          type: "tool_call",
          toolCall: { id: "t1", name: "read_file", input: { path: "src/x.ts" } },
        },
        { type: "usage", inputTokens: 5, outputTokens: 2 },
        { type: "done", stopReason: "tool_use" },
      ],
      [
        { type: "text_delta", delta: "ok" },
        { type: "usage", inputTokens: 5, outputTokens: 1 },
        { type: "done", stopReason: "end_turn" },
      ],
    ])
    await files.createPath("proj_1", "src/x.ts", "x", "user")

    await runner.run(baseInput)

    expect(sink.checkpoints.length).toBeGreaterThanOrEqual(1)
    const last = sink.checkpoints.at(-1)!
    expect(last.iterationCount).toBeGreaterThanOrEqual(1)
    expect(last.messageId).toBe("msg_1")
    expect(last.lastToolCallName).toBe("read_file")
  })

  it("resumes from a checkpoint when resumeFromCheckpoint=true", async () => {
    const { sink, runner, adapter } = await makeFixture([
      // Only one turn — after resume we should immediately hit end_turn
      [
        { type: "text_delta", delta: "Resuming." },
        { type: "usage", inputTokens: 5, outputTokens: 2 },
        { type: "done", stopReason: "end_turn" },
      ],
    ])

    sink.preloadedCheckpoint = {
      messageId: "msg_1",
      projectId: "proj_1",
      messages: [
        { role: "user", content: "do thing" },
        {
          role: "assistant",
          content: [{ type: "tool_use", id: "t_old", name: "list_files", input: { directory: "/" } }],
        },
        {
          role: "tool",
          content: [{ type: "tool_result", toolUseId: "t_old", content: '{"files":[]}' }],
        },
      ],
      iterationCount: 1,
      totalInputTokens: 100,
      totalOutputTokens: 30,
      lastToolCallName: "list_files",
      savedAt: Date.now(),
    }

    await runner.run({ ...baseInput, resumeFromCheckpoint: true })

    // Adapter received the checkpointed messages, NOT the initial conversation
    expect(adapter.receivedMessages[0]).toEqual(sink.preloadedCheckpoint!.messages)
    expect(sink.done?.payload.status).toBe("completed")
  })
})

describe("AgentRunner — Layer 4 (hard limits)", () => {
  it("stops at MAX_ITERATIONS with errorMessage about iteration limit", async () => {
    // Adapter that always returns a tool call (so the loop never naturally ends).
    const looping: AgentStep[][] = Array.from({ length: 60 }, (_, i) => [
      {
        type: "tool_call" as const,
        toolCall: { id: `t_${i}`, name: "list_files", input: { directory: "/" } },
      },
      { type: "usage" as const, inputTokens: 1, outputTokens: 1 },
      { type: "done" as const, stopReason: "tool_use" as const },
    ])

    const { sink, runner } = await makeFixture(looping)

    await runner.run(baseInput)

    expect(sink.done?.payload.status).toBe("error")
    expect(sink.done?.payload.errorMessage).toMatch(/iteration limit/i)
  })

  it("stops at MAX_TOKENS with errorMessage about context limit", async () => {
    const burnTokens: AgentStep[][] = Array.from({ length: 5 }, (_, i) => [
      {
        type: "tool_call" as const,
        toolCall: { id: `t_${i}`, name: "list_files", input: { directory: "/" } },
      },
      { type: "usage" as const, inputTokens: 80_000, outputTokens: 0 },
      { type: "done" as const, stopReason: "tool_use" as const },
    ])

    const { sink, runner } = await makeFixture(burnTokens)

    await runner.run(baseInput)

    expect(sink.done?.payload.status).toBe("error")
    expect(sink.done?.payload.errorMessage).toMatch(/(context|token)/i)
  })
})

describe("AgentRunner — cancellation", () => {
  it("stops cleanly when sink reports cancellation between iterations", async () => {
    const { sink, runner } = await makeFixture([
      [
        {
          type: "tool_call",
          toolCall: { id: "t1", name: "list_files", input: { directory: "/" } },
        },
        { type: "usage", inputTokens: 5, outputTokens: 2 },
        { type: "done", stopReason: "tool_use" },
      ],
    ])
    sink.cancelMessage("msg_1")

    await runner.run(baseInput)

    expect(sink.done?.payload.status).toBe("cancelled")
  })
})

describe("AgentRunner — adapter errors", () => {
  it("marks the run errored when the adapter emits stopReason=error", async () => {
    const { sink, runner } = await makeFixture([
      [
        { type: "text_delta", delta: "Trying..." },
        { type: "usage", inputTokens: 5, outputTokens: 1 },
        { type: "done", stopReason: "error", error: "anthropic 529" },
      ],
    ])

    await runner.run(baseInput)

    expect(sink.done?.payload.status).toBe("error")
    expect(sink.done?.payload.errorMessage).toContain("anthropic 529")
  })
})

describe("AgentRunner — D-036 verification loop", () => {
  it("no verifier supplied → behavior unchanged (no regression)", async () => {
    const { sink, runner } = await makeFixture([
      [
        { type: "text_delta", delta: "All done." },
        { type: "usage", inputTokens: 5, outputTokens: 1 },
        { type: "done", stopReason: "end_turn" },
      ],
    ])

    await runner.run(baseInput)

    expect(sink.done?.payload.status).toBe("completed")
  })

  it("verifier passes → marks completed, called once with changed path", async () => {
    const seenPaths: string[] = []
    const verify = vi.fn<VerifyFn>(async (paths) => {
      seenPaths.push(...paths)
      return { ok: true }
    })
    const { sink, runner, files } = await makeFixture(
      [
        // Turn 1: edit file
        [
          {
            type: "tool_call",
            toolCall: {
              id: "t1",
              name: "edit_file",
              input: {
                path: "src/x.ts",
                search: "const x = 1",
                replace: "const x = 2",
              },
            },
          },
          { type: "usage", inputTokens: 10, outputTokens: 5 },
          { type: "done", stopReason: "tool_use" },
        ],
        // Turn 2: model says done — verification fires here
        [
          { type: "text_delta", delta: "Done." },
          { type: "usage", inputTokens: 5, outputTokens: 2 },
          { type: "done", stopReason: "end_turn" },
        ],
      ],
      { verify },
    )
    await files.createPath("proj_1", "src/x.ts", "const x = 1", "user")

    await runner.run(baseInput)

    expect(verify).toHaveBeenCalledTimes(1)
    expect(seenPaths).toContain("src/x.ts")
    expect(sink.done?.payload.status).toBe("completed")
  })

  it("verifier fails once, agent fixes, completes — synthetic message injected", async () => {
    const verify = vi
      .fn<VerifyFn>()
      .mockResolvedValueOnce({
        ok: false,
        stage: "tsc",
        errors: "src/app/page.tsx(12,5): error TS2345: bad type",
      })
      .mockResolvedValueOnce({ ok: true })

    const { sink, runner, files, adapter } = await makeFixture(
      [
        // Turn 1: first edit
        [
          {
            type: "tool_call",
            toolCall: {
              id: "t1",
              name: "edit_file",
              input: {
                path: "src/app/page.tsx",
                search: "const x = 1",
                replace: "const x = 2",
              },
            },
          },
          { type: "usage", inputTokens: 5, outputTokens: 2 },
          { type: "done", stopReason: "tool_use" },
        ],
        // Turn 2: model claims done → verifier injects errors
        [
          { type: "text_delta", delta: "Done." },
          { type: "usage", inputTokens: 5, outputTokens: 2 },
          { type: "done", stopReason: "end_turn" },
        ],
        // Turn 3: model responds to synthetic, edits again
        [
          {
            type: "tool_call",
            toolCall: {
              id: "t2",
              name: "edit_file",
              input: {
                path: "src/app/page.tsx",
                search: "const x = 2",
                replace: "const x: number = 2",
              },
            },
          },
          { type: "usage", inputTokens: 5, outputTokens: 2 },
          { type: "done", stopReason: "tool_use" },
        ],
        // Turn 4: model claims done, verifier passes
        [
          { type: "text_delta", delta: "Fixed." },
          { type: "usage", inputTokens: 5, outputTokens: 2 },
          { type: "done", stopReason: "end_turn" },
        ],
      ],
      { verify },
    )
    await files.createPath("proj_1", "src/app/page.tsx", "const x = 1", "user")

    await runner.run(baseInput)

    expect(verify).toHaveBeenCalledTimes(2)
    expect(sink.done?.payload.status).toBe("completed")

    // Turn 3 input messages should contain the synthetic auto-verification user message.
    const turn3Messages = adapter.receivedMessages[2]
    const synthetic = turn3Messages.find(
      (m) =>
        m.role === "user" &&
        typeof m.content === "string" &&
        m.content.includes("Auto-verification") &&
        m.content.includes("error TS2345"),
    )
    expect(synthetic).toBeDefined()
  })

  it("verifier fails 3 times → marks error with latest verifier output", async () => {
    const verify = vi.fn<VerifyFn>(async () => ({
      ok: false,
      stage: "tsc",
      errors: "src/x.ts(1,1): error TS9999: still broken",
    }))

    // Build 4 paired edit-then-done turn pairs (= 8 turns total)
    const script: AgentStep[][] = []
    for (let i = 0; i < 4; i++) {
      script.push([
        {
          type: "tool_call",
          toolCall: {
            id: `t_${i}`,
            name: "edit_file",
            input: {
              path: "src/x.ts",
              search: i === 0 ? "x" : `x${i}`,
              replace: `x${i + 1}`,
            },
          },
        },
        { type: "usage", inputTokens: 5, outputTokens: 2 },
        { type: "done", stopReason: "tool_use" },
      ])
      script.push([
        { type: "text_delta", delta: `done ${i}` },
        { type: "usage", inputTokens: 5, outputTokens: 2 },
        { type: "done", stopReason: "end_turn" },
      ])
    }

    const { sink, runner, files } = await makeFixture(script, { verify })
    await files.createPath("proj_1", "src/x.ts", "x", "user")

    await runner.run(baseInput)

    // 3 auto-fix attempts + 1 final → 4 verify calls; surface as error.
    // (After the 4th call, autoFixCount has reached MAX, so we mark error.)
    // Implementation triggers verify on every "no tool calls" iteration:
    //   call 1 → fail (attempt 1/3, push synthetic)
    //   call 2 → fail (attempt 2/3, push synthetic)
    //   call 3 → fail (attempt 3/3, push synthetic)
    //   call 4 → fail (autoFixCount === MAX → markDone error)
    expect(verify.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(sink.done?.payload.status).toBe("error")
    expect(sink.done?.payload.errorMessage).toContain("Auto-verification")
    expect(sink.done?.payload.errorMessage).toContain("still broken")
  })

  it("no changed paths → verify NOT called", async () => {
    const verify = vi.fn<VerifyFn>(async () => ({ ok: true }))
    const { sink, runner } = await makeFixture(
      [
        [
          { type: "text_delta", delta: "Nothing to change." },
          { type: "usage", inputTokens: 5, outputTokens: 1 },
          { type: "done", stopReason: "end_turn" },
        ],
      ],
      { verify },
    )

    await runner.run(baseInput)

    expect(verify).not.toHaveBeenCalled()
    expect(sink.done?.payload.status).toBe("completed")
  })
})
