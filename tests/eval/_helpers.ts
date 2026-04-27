/**
 * Eval harness helpers. Shared fixtures + scriptable adapter for quality
 * scenarios that exercise the AgentRunner end-to-end with deterministic
 * LLM responses.
 *
 * Authority: backs the "world-class agent" claim with measurable evidence.
 */

import { AgentRunner } from "@/lib/agents/agent-runner"
import { InMemoryAgentSink } from "@/lib/agents/in-memory-sink"
import { InMemoryFileService } from "@/lib/files/in-memory-file-service"
import { MockSandboxProvider } from "@/lib/sandbox/mock-provider"
import { ToolExecutor } from "@/lib/tools/executor"
import type {
  AgentStep,
  Message,
  ModelAdapter,
  RunOptions,
  ToolCall,
  ToolDefinition,
} from "@/lib/agents/types"

/** A "turn" = one full LLM response (zero or more text + tool_call + done). */
export type ScriptedTurn = AgentStep[]

/**
 * ScriptedAdapter — replays a fixed sequence of turns. Each `runWithTools`
 * call consumes the next entry. Tracks the messages it received so tests
 * can assert that tool_result blocks (Layer 2) flowed back correctly.
 */
export class ScriptedAdapter implements ModelAdapter {
  readonly name = "scripted"
  private turnIdx = 0
  receivedMessages: Message[][] = []

  constructor(private readonly script: ScriptedTurn[]) {}

  async *runWithTools(
    messages: Message[],
    _tools: ToolDefinition[],
    _opts: RunOptions,
  ): AsyncGenerator<AgentStep, void, void> {
    this.receivedMessages.push(messages.map((m) => ({ ...m })))
    if (this.turnIdx >= this.script.length) {
      throw new Error(
        `ScriptedAdapter ran out of script after ${this.turnIdx} turns. ` +
          `The agent kept iterating past what the scenario expected.`,
      )
    }
    const turn = this.script[this.turnIdx++]
    for (const step of turn) yield step
  }

  get turnsConsumed(): number {
    return this.turnIdx
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step builders — terser scenario writing.
// ─────────────────────────────────────────────────────────────────────────────

let toolCallCounter = 0
const nextToolCallId = (): string => `tu_${++toolCallCounter}`

export const text = (delta: string): AgentStep => ({ type: "text_delta", delta })

export const tool = (
  name: string,
  input: Record<string, unknown>,
  id: string = nextToolCallId(),
): AgentStep => ({
  type: "tool_call",
  toolCall: { id, name, input },
})

export const usage = (
  inputTokens: number,
  outputTokens: number,
): AgentStep => ({ type: "usage", inputTokens, outputTokens })

export const done = (
  reason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence" | "error" = "end_turn",
  errorMsg?: string,
): AgentStep => ({ type: "done", stopReason: reason, error: errorMsg })

// Convenience: full turn that calls one tool then yields.
export const turnTool = (
  name: string,
  input: Record<string, unknown>,
  id: string = nextToolCallId(),
  inputTokens = 200,
  outputTokens = 50,
): ScriptedTurn => [
  text(`Calling ${name}…`),
  tool(name, input, id),
  usage(inputTokens, outputTokens),
  done("tool_use"),
]

// Convenience: final assistant message with no tool calls.
export const turnFinish = (
  text_: string = "Done.",
  inputTokens = 100,
  outputTokens = 30,
): ScriptedTurn => [
  text(text_),
  usage(inputTokens, outputTokens),
  done("end_turn"),
]

// ─────────────────────────────────────────────────────────────────────────────
// Fixture
// ─────────────────────────────────────────────────────────────────────────────

export interface EvalFixture {
  sink: InMemoryAgentSink
  files: InMemoryFileService
  sandbox: MockSandboxProvider
  sandboxId: string
  adapter: ScriptedAdapter
  runner: AgentRunner
}

export interface FixtureOpts {
  /** Initial files in the project (path → content). */
  initialFiles?: Record<string, string>
  /** Initial conversation history. */
  conversation?: Array<{ role: "user" | "assistant"; content: string }>
  /** Override projectId. */
  projectId?: string
}

export async function makeFixture(
  script: ScriptedTurn[],
  opts: FixtureOpts = {},
): Promise<EvalFixture> {
  const sink = new InMemoryAgentSink()
  const files = new InMemoryFileService()
  const sandbox = new MockSandboxProvider()
  const sb = await sandbox.create("nextjs", {})
  const adapter = new ScriptedAdapter(script)
  const executor = new ToolExecutor({ files, sandbox })
  const runner = new AgentRunner({
    adapter,
    executor,
    sink,
    sandboxId: sb.id,
  })

  const projectId = opts.projectId ?? "proj_eval"

  // Seed files via the FileService — uses createPath since writePath
  // requires the file to exist.
  if (opts.initialFiles) {
    for (const [path, content] of Object.entries(opts.initialFiles)) {
      await files.createPath(projectId, path, content, "scaffold")
      // Also seed the sandbox so read_file / write_file paths work.
      await sandbox.writeFile(sb.id, path, content)
    }
  }

  sink.initialMessages = opts.conversation ?? [
    { role: "user", content: "Default eval prompt." },
  ]

  return { sink, files, sandbox, sandboxId: sb.id, adapter, runner }
}

// ─────────────────────────────────────────────────────────────────────────────
// Assertion helpers — terser scenario writing.
// ─────────────────────────────────────────────────────────────────────────────

export const toolCallNames = (sink: InMemoryAgentSink): string[] =>
  sink.toolCalls.map((tc) => tc.toolCall.name)

export const toolCallInputs = (
  sink: InMemoryAgentSink,
  name: string,
): Record<string, unknown>[] =>
  sink.toolCalls
    .filter((tc) => tc.toolCall.name === name)
    .map((tc) => tc.toolCall.input)

export const lastToolResult = (
  sink: InMemoryAgentSink,
  toolCallId: string,
) => sink.toolResults.find((r) => r.toolCallId === toolCallId)?.result

export const totalTokens = (sink: InMemoryAgentSink): number =>
  sink.usage.reduce((s, u) => s + u.inputTokens + u.outputTokens, 0)

// ─────────────────────────────────────────────────────────────────────────────
// Quality metrics — produced per-scenario for the report.
// ─────────────────────────────────────────────────────────────────────────────

export interface ScenarioMetrics {
  name: string
  passed: boolean
  iterations: number
  toolCallsTotal: number
  toolBreakdown: Record<string, number>
  tokensTotal: number
  failureReason?: string
  /** Free-form notes — what we measured, what we asserted. */
  notes: string[]
}

const metricsRegistry: ScenarioMetrics[] = []

export const recordMetrics = (m: ScenarioMetrics) => {
  metricsRegistry.push(m)
}

export const drainMetrics = (): ScenarioMetrics[] => {
  const out = [...metricsRegistry]
  metricsRegistry.length = 0
  return out
}

export const measureScenario = (
  sink: InMemoryAgentSink,
  name: string,
  notes: string[],
  passed: boolean,
  failureReason?: string,
): ScenarioMetrics => {
  const breakdown: Record<string, number> = {}
  for (const tc of sink.toolCalls) {
    breakdown[tc.toolCall.name] = (breakdown[tc.toolCall.name] ?? 0) + 1
  }
  const m: ScenarioMetrics = {
    name,
    passed,
    iterations: sink.checkpoints.length,
    toolCallsTotal: sink.toolCalls.length,
    toolBreakdown: breakdown,
    tokensTotal: totalTokens(sink),
    failureReason,
    notes,
  }
  recordMetrics(m)
  return m
}

export type { ToolCall }
