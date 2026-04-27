/**
 * AgentRunner — orchestrates the agent loop.
 * Authority: CONSTITUTION Article VII (loop), Article XII (4-layer error recovery),
 * sub-plan 01 Tasks 14–18.
 *
 * The runner is built against three abstractions so it has zero direct dependency
 * on Convex, Anthropic, or E2B:
 *   - ModelAdapter (yields AgentStep)
 *   - ToolExecutor (returns ToolOutput)
 *   - AgentSink    (persists side effects)
 *
 * Error recovery layers (CONSTITUTION §12):
 *   1. API retry             — handled inside the adapter
 *   2. Tool failure feedback — runner forwards ok:false results to the model as
 *                              tool_result blocks with isError=true
 *   3. Checkpoint + resume   — saved after every iteration; resumed when
 *                              `resumeFromCheckpoint` is true (Inngest retry)
 *   4. Hard limits           — 50 iterations / 150K tokens / 5 min wall clock
 */

import { AGENT_TOOLS } from "@/lib/tools/definitions"
import { ToolExecutor } from "@/lib/tools/executor"
import type { ToolOutput } from "@/lib/tools/types"
import { AGENT_SYSTEM_PROMPT } from "./system-prompt"
import { COMPACTION_THRESHOLD_TOKENS } from "./compactor"
import type { VerifyResult } from "./verifier"
import type {
  AgentCheckpoint,
  AgentDoneStatus,
  AgentSink,
  ConversationMessage,
} from "./sink"
import type {
  AgentStep,
  ContentBlock,
  Message,
  ModelAdapter,
  ToolCall,
} from "./types"

/**
 * D-025 — Run budgets are tier-aware. The original 5min/50it/150K cap was
 * a one-size-fits-all that timed out on legitimate Pro/Team workloads
 * (e.g. "build a full ecommerce site"). Each tier now has its own ceiling:
 *
 *   free  →  5min /  50 iter / 150K tokens
 *   pro   → 30min / 100 iter / 300K tokens
 *   team  →  2hr  / 200 iter / 600K tokens
 *
 * The agent loop reads the caller's plan via `customers.getByUser` and
 * passes the resolved budget into `AgentRunner`. Free-tier callers still
 * get today's behavior — no regression.
 */
export type Plan = "free" | "pro" | "team"

export interface RunBudget {
  maxIterations: number
  maxTokens: number
  maxDurationMs: number
}

const FREE_BUDGET: RunBudget = {
  maxIterations: 50,
  maxTokens: 150_000,
  maxDurationMs: 5 * 60_000,
}
const PRO_BUDGET: RunBudget = {
  maxIterations: 100,
  maxTokens: 300_000,
  maxDurationMs: 30 * 60_000,
}
const TEAM_BUDGET: RunBudget = {
  maxIterations: 200,
  maxTokens: 600_000,
  maxDurationMs: 2 * 60 * 60_000,
}

export function runBudget(plan: Plan): RunBudget {
  if (plan === "team") return TEAM_BUDGET
  if (plan === "pro") return PRO_BUDGET
  return FREE_BUDGET
}

// Back-compat exports — existing callers/tests reference these directly.
export const MAX_ITERATIONS = FREE_BUDGET.maxIterations
export const MAX_TOKENS = FREE_BUDGET.maxTokens
export const MAX_DURATION_MS = FREE_BUDGET.maxDurationMs

const DEFAULT_MAX_OUTPUT_TOKENS = 8_000
const DEFAULT_TURN_TIMEOUT_MS = 60_000

/**
 * D-036 — Cap on auto-fix attempts before surfacing verification errors
 * to the user. After 3 failed verifier rounds we stop trying and mark
 * the run as `error` with the latest residual errors as the message.
 */
const MAX_AUTO_FIX_ATTEMPTS = 3

/**
 * D-027 — Compactor handler. The runner calls this when the running token
 * total crosses the compaction threshold. Returns the handoff artifact;
 * the runner then resets `state.messages` to a single user message
 * carrying the artifact and continues.
 */
export type CompactFn = (messages: Message[]) => Promise<{
  artifact: string
  inputTokens: number
  outputTokens: number
}>

export interface AgentRunnerDeps {
  adapter: ModelAdapter
  executor: ToolExecutor
  sink: AgentSink
  /** Sandbox to run tool calls against. May be null in dev/no-sandbox mode. */
  sandboxId: string | null
  /**
   * D-025 — Tier-aware run budget. Caller passes the resolved budget for
   * the user's plan. Defaults to FREE for callers that haven't been
   * updated yet (no behaviour regression).
   */
  budget?: RunBudget
  /**
   * D-027 — Optional compactor. When provided, the runner calls it once
   * the token total crosses COMPACTION_THRESHOLD_TOKENS, replaces
   * `state.messages` with the handoff artifact, and continues. When
   * absent, the existing behaviour (hard-fail at maxTokens) applies.
   */
  compact?: CompactFn
  /**
   * D-030 — optional system prompt override. agent-loop.ts builds this
   * by appending the project's `/AGENTS.md` (if present) to the
   * canonical AGENT_SYSTEM_PROMPT. Defaults to AGENT_SYSTEM_PROMPT alone.
   */
  systemPrompt?: string
  /**
   * D-036 — Optional verifier. When provided, the runner runs tsc+eslint
   * against the agent's changed paths whenever the model stops emitting
   * tool calls. On verification errors, the runner injects a synthetic
   * user message with the errors and continues, up to 3 auto-fix
   * attempts. When absent, behaviour is identical to pre-D-036.
   */
  verify?: (changedPaths: ReadonlySet<string>) => Promise<VerifyResult>
  /** Test seam — defaults to Date.now(). */
  now?: () => number
}

export interface AgentRunInput {
  messageId: string
  conversationId: string
  projectId: string
  userId: string
  resumeFromCheckpoint: boolean
}

interface RunState {
  messages: Message[]
  iterationCount: number
  totalInputTokens: number
  totalOutputTokens: number
  /** D-027 — set true after the first auto-compaction; only one per run. */
  compacted?: boolean
  /**
   * D-036 — verification loop state. Tracks paths the agent has mutated
   * since the last verification pass + how many auto-fix attempts have
   * been spent in this run. Reset after each verification cycle.
   */
  pendingChangedPaths: Set<string>
  autoFixCount: number
}

export class AgentRunner {
  constructor(private readonly deps: AgentRunnerDeps) {}

  async run(input: AgentRunInput): Promise<void> {
    const startedAt = (this.deps.now ?? Date.now)()
    const state = await this.initState(input)
    // D-025 — resolve budget; legacy callers get FREE.
    const budget = this.deps.budget ?? FREE_BUDGET

    while (true) {
      // ── Layer 4: hard limits (tier-aware per D-025) ────────────────────────
      if (state.iterationCount >= budget.maxIterations) {
        return this.markDone(
          input,
          state,
          "error",
          `Agent reached iteration limit (${budget.maxIterations}). Latest changes are saved.`,
        )
      }
      // D-027 — auto-compact at COMPACTION_THRESHOLD if compactor present.
      // Only triggers ONCE before the hard cap, so a runaway agent that
      // somehow blows through the post-compact budget will still hit the
      // hard wall.
      const totalTokens = state.totalInputTokens + state.totalOutputTokens
      if (
        this.deps.compact &&
        totalTokens >= COMPACTION_THRESHOLD_TOKENS &&
        !state.compacted
      ) {
        const result = await this.deps.compact(state.messages)
        // Replace the conversation with the handoff seed.
        state.messages = [
          {
            role: "user",
            content:
              `[Continuing from compaction. Use this handoff artifact to ` +
              `pick up the work cleanly.]\n\n${result.artifact}`,
          },
        ]
        // Don't reset iterationCount — the loop has done real work.
        // Token totals carry forward so we still respect the hard cap.
        state.compacted = true
        // Tell the sink so the chat UI can render a "compacted" banner.
        if (this.deps.sink.appendText) {
          await this.deps.sink.appendText(
            input.messageId,
            `\n\n_(context compacted at ${totalTokens.toLocaleString()} tokens)_\n\n`,
          )
        }
      }

      if (totalTokens >= budget.maxTokens) {
        return this.markDone(
          input,
          state,
          "error",
          `Context limit reached (${budget.maxTokens.toLocaleString()} tokens). Start a new conversation to continue.`,
        )
      }
      if ((this.deps.now ?? Date.now)() - startedAt >= budget.maxDurationMs) {
        const minutes = Math.round(budget.maxDurationMs / 60_000)
        return this.markDone(
          input,
          state,
          "error",
          `Agent timed out at ${minutes} minutes. Latest changes are saved.`,
        )
      }

      // Cancellation check — stop cleanly between iterations.
      if (await this.deps.sink.isCancelled(input.messageId)) {
        return this.markDone(input, state, "cancelled")
      }

      // D-033 — steering check between iterations. If the user queued a
      // follow-up while the agent was working, inject it as a user
      // message before the next adapter call.
      if (this.deps.sink.pullPendingSteer) {
        const steer = await this.deps.sink.pullPendingSteer(input.messageId)
        if (steer) {
          state.messages.push({ role: "user", content: steer })
        }
      }

      const turn = await this.runTurn(input, state)

      // Adapter-level error → mark errored and stop.
      if (turn.errored) {
        return this.markDone(input, state, "error", turn.errorMessage)
      }

      // No tool calls — model is done with this turn. Run verification
      // (D-036) before declaring the conversation complete. If
      // verification fails and we have auto-fix budget left, inject the
      // errors as a synthetic user message and continue. Otherwise
      // mark done.
      if (turn.toolCalls.length === 0) {
        const verifyOutcome = await this.maybeVerify(input, state)
        if (verifyOutcome === "continue") {
          // Synthetic message already pushed. Loop again.
          // NOTE: state isn't checkpointed on this iteration since
          // there were no tool calls. If Inngest retries between this
          // synthetic-push and the next iteration, the synthetic
          // message is lost — but the verifier will simply re-run on
          // resume and re-push. Acceptable for v1.
          state.iterationCount++
          continue
        }
        if (verifyOutcome === "error") {
          return // markDone already called inside maybeVerify
        }
        return this.markDone(input, state, "completed")
      }

      // ── Layer 2: feed tool results back to the model ───────────────────────
      const resultBlocks = await this.executeTools(input, state, turn.toolCalls)

      // Append the assistant turn (with tool_use blocks) and the tool results
      // to the message history for the next iteration.
      state.messages.push({
        role: "assistant",
        content: turn.toolCalls.map<ContentBlock>((tc) => ({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: tc.input,
        })),
      })
      state.messages.push({ role: "tool", content: resultBlocks })

      state.iterationCount++

      // ── Layer 3: checkpoint after each iteration ─────────────────────────
      const checkpoint: AgentCheckpoint = {
        messageId: input.messageId,
        projectId: input.projectId,
        messages: state.messages,
        iterationCount: state.iterationCount,
        totalInputTokens: state.totalInputTokens,
        totalOutputTokens: state.totalOutputTokens,
        lastToolCallName: turn.toolCalls.at(-1)?.name,
        savedAt: (this.deps.now ?? Date.now)(),
      }
      await this.deps.sink.saveCheckpoint(checkpoint)
    }
  }

  // ── Setup ────────────────────────────────────────────────────────────────────

  private async initState(input: AgentRunInput): Promise<RunState> {
    if (input.resumeFromCheckpoint) {
      const cp = await this.deps.sink.loadCheckpoint(input.messageId)
      if (cp) {
        return {
          messages: cp.messages.map((m) => ({ ...m })),
          iterationCount: cp.iterationCount,
          totalInputTokens: cp.totalInputTokens,
          totalOutputTokens: cp.totalOutputTokens,
          // D-036 — verifier state never resumed; verification re-runs
          // cleanly against whatever changes the resumed turn produces.
          pendingChangedPaths: new Set<string>(),
          autoFixCount: 0,
        }
      }
    }
    const initial = await this.deps.sink.loadInitialMessages(input.conversationId)
    return {
      messages: initial.map(messageFromConversation),
      iterationCount: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      pendingChangedPaths: new Set<string>(),
      autoFixCount: 0,
    }
  }

  // ── Single turn — drives the adapter generator until it yields done ─────────

  private async runTurn(
    input: AgentRunInput,
    state: RunState,
  ): Promise<{
    toolCalls: ToolCall[]
    errored: boolean
    errorMessage?: string
  }> {
    const toolCalls: ToolCall[] = []
    let errored = false
    let errorMessage: string | undefined

    const stream = this.deps.adapter.runWithTools(state.messages, AGENT_TOOLS, {
      // D-030 — agent-loop may augment the prompt with /AGENTS.md.
      systemPrompt: this.deps.systemPrompt ?? AGENT_SYSTEM_PROMPT,
      maxTokens: DEFAULT_MAX_OUTPUT_TOKENS,
      timeoutMs: DEFAULT_TURN_TIMEOUT_MS,
    })

    for await (const step of stream) {
      switch (step.type) {
        case "text_delta":
          await this.deps.sink.appendText(input.messageId, step.delta)
          break

        case "tool_call":
          toolCalls.push(step.toolCall)
          await this.deps.sink.appendToolCall(input.messageId, step.toolCall)
          break

        case "usage":
          state.totalInputTokens += step.inputTokens
          state.totalOutputTokens += step.outputTokens
          // D-023 — pipe cache breakdown through to billing.
          await this.deps.sink.recordUsage(
            input.userId,
            step.inputTokens,
            step.outputTokens,
            step.cacheCreationInputTokens,
            step.cacheReadInputTokens,
          )
          break

        // D-024 — extended thinking events. We persist deltas via the sink
        // so the chat UI can render the collapsible "Thinking" block live.
        // start/end carry no payload — we just route the delta.
        case "thinking_start":
          break
        case "thinking_delta":
          if (this.deps.sink.appendThinking) {
            await this.deps.sink.appendThinking(input.messageId, step.delta)
          }
          break
        case "thinking_end":
          break

        case "done":
          if (step.stopReason === "error") {
            errored = true
            errorMessage = step.error ?? "Model returned an error."
          }
          break
      }
    }

    return { toolCalls, errored, errorMessage }
  }

  // ── Tool execution loop (Layer 2 lives here) ────────────────────────────────

  private async executeTools(
    input: AgentRunInput,
    state: RunState,
    toolCalls: ToolCall[],
  ): Promise<ContentBlock[]> {
    const sandboxId = this.deps.sandboxId
    const ctx = { projectId: input.projectId, sandboxId, userId: input.userId }
    const blocks: ContentBlock[] = []
    for (const tc of toolCalls) {
      const result = await this.deps.executor.execute(tc, ctx)
      await this.deps.sink.appendToolResult(input.messageId, tc.id, result)
      // D-036 — track changed paths so the verifier can target them.
      this.recordChangedPath(state, tc, result)
      blocks.push({
        type: "tool_result",
        toolUseId: tc.id,
        content: serializeToolResult(result),
        isError: !result.ok,
      })
    }
    return blocks
  }

  /** D-036 — push the path of a successful mutating tool call into state. */
  private recordChangedPath(
    state: RunState,
    tc: ToolCall,
    result: ToolOutput,
  ): void {
    if (!result.ok) return
    const mutating = [
      "write_file",
      "edit_file",
      "multi_edit",
      "create_file",
      "delete_file",
    ]
    if (!mutating.includes(tc.name)) return
    const path = (tc.input as { path?: unknown }).path
    if (typeof path === "string" && path.length > 0) {
      state.pendingChangedPaths.add(path)
    }
  }

  /**
   * D-036 — Run the verifier (if wired) over the agent's pending changed
   * paths. Returns:
   *   "completed" → all clear, caller should mark the run done
   *   "continue"  → errors found and we have auto-fix budget; synthetic
   *                  user message has been pushed onto state.messages
   *   "error"     → errors found and budget exhausted; markDone(error)
   *                  has already been called by this method
   */
  private async maybeVerify(
    input: AgentRunInput,
    state: RunState,
  ): Promise<"completed" | "continue" | "error"> {
    if (!this.deps.verify) return "completed"
    if (state.pendingChangedPaths.size === 0) return "completed"

    const result = await this.deps.verify(state.pendingChangedPaths)
    if (result.ok) {
      state.pendingChangedPaths.clear()
      return "completed"
    }

    // Hit the cap — surface to the user.
    if (state.autoFixCount >= MAX_AUTO_FIX_ATTEMPTS) {
      await this.markDone(
        input,
        state,
        "error",
        `Auto-verification (${result.stage}) failed after ${MAX_AUTO_FIX_ATTEMPTS} fix attempts. Latest errors:\n\n${result.errors}`,
      )
      return "error"
    }

    // Inject errors as a synthetic user message and continue.
    state.messages.push({
      role: "user",
      content: `Auto-verification (${result.stage}) found errors in your last edit batch. Fix them before reporting completion:\n\n${result.errors}\n\n(This is auto-fix attempt ${state.autoFixCount + 1}/${MAX_AUTO_FIX_ATTEMPTS}.)`,
    })
    state.pendingChangedPaths.clear()
    state.autoFixCount++
    return "continue"
  }

  // ── Termination helpers ─────────────────────────────────────────────────────

  private async markDone(
    input: AgentRunInput,
    state: RunState,
    status: AgentDoneStatus,
    errorMessage?: string,
  ): Promise<void> {
    await this.deps.sink.markDone(input.messageId, {
      status,
      errorMessage,
      inputTokens: state.totalInputTokens,
      outputTokens: state.totalOutputTokens,
    })
  }
}

function messageFromConversation(m: ConversationMessage): Message {
  return { role: m.role, content: m.content }
}

function serializeToolResult(result: ToolOutput): string {
  // The model receives a JSON string. Successful results include the data; failures
  // include the error message + errorCode so the model can recover (Layer 2).
  if (result.ok) {
    return JSON.stringify({ ok: true, data: result.data })
  }
  return JSON.stringify({
    ok: false,
    error: result.error,
    errorCode: result.errorCode,
  })
}
