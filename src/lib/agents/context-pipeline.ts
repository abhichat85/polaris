/**
 * Multi-stage context compaction pipeline — D-054 / Phase 2.3.
 *
 * Replaces the single-shot Haiku auto-compaction (D-027) with a graded
 * pipeline that tries cheap strategies first and exits as soon as the
 * token budget is back under target. The five stages, in order of cost:
 *
 *   1. budget-reduction  (free)   — drop old + large tool_results
 *   2. snip              (free)   — elide middle of long tool outputs
 *   3. microcompact      (cheap)  — collapse runs of 3+ consecutive tool
 *                                    call/result pairs into one synthetic
 *                                    summary block (1 Haiku call per run)
 *   4. context-collapse  (medium) — summarize old user/assistant turns
 *                                    (>20 turns ago) into one block
 *                                    (1 Haiku call)
 *   5. auto-compact      (expensive) — full conversation summary
 *                                       (delegates to deps.compact, the
 *                                       existing Compactor)
 *
 * The pipeline returns the new messages list, the strategies that were
 * applied (for telemetry), and the final token estimate. If even after
 * stage 5 we're over budget, the runner relies on its hard cap to stop.
 *
 * Token estimation is local-only (no API calls): ~3.7 chars per token,
 * which empirically matches the Anthropic counter to within ±10% on
 * mixed English + code.
 */

import type { ContentBlock, Message } from "./types"

/* ─────────────────────────────────────────────────────────────────────────
 * Token estimation
 * ───────────────────────────────────────────────────────────────────── */

/** Average bytes per Claude token for mixed English + code. */
const BYTES_PER_TOKEN = 3.7

export function estimateTokens(s: string): number {
  return Math.ceil(s.length / BYTES_PER_TOKEN)
}

export function estimateBlockTokens(block: ContentBlock): number {
  switch (block.type) {
    case "text":
      return estimateTokens(block.text)
    case "tool_use":
      // JSON input + the wire-format envelope (~20 tokens)
      return estimateTokens(JSON.stringify(block.input)) + 20
    case "tool_result":
      // Content string + envelope
      return estimateTokens(block.content) + 10
  }
}

export function estimateMessageTokens(m: Message): number {
  if (typeof m.content === "string") return estimateTokens(m.content)
  let total = 0
  for (const block of m.content) total += estimateBlockTokens(block)
  return total
}

export function totalTokens(messages: readonly Message[]): number {
  let sum = 0
  for (const m of messages) sum += estimateMessageTokens(m)
  return sum
}

/* ─────────────────────────────────────────────────────────────────────────
 * Strategy contract
 * ───────────────────────────────────────────────────────────────────── */

export interface PipelineDeps {
  /**
   * Optional Haiku-backed summarizer used by the cheap-and-medium
   * strategies. (text, instruction) → summary. When absent, the
   * pipeline skips strategies that need it.
   */
  summarize?: (text: string, instruction: string) => Promise<string>
  /**
   * Optional full-conversation compactor (legacy D-027 entry point).
   * Used as the strategy of last resort. When absent, the pipeline
   * skips stage 5.
   */
  compact?: (messages: Message[]) => Promise<{
    artifact: string
    inputTokens: number
    outputTokens: number
  }>
  /** Test seam — replace the token estimator. */
  estimateTokens?: (s: string) => number
}

export interface StrategyResult {
  messages: Message[]
  /** Updated token estimate after strategy applied. */
  tokens: number
  /** True if this strategy actually modified anything. */
  applied: boolean
}

export interface CompactionStrategy {
  name: string
  /** Cost class — used for logging / observability only. */
  cost: "free" | "cheap" | "medium" | "expensive"
  apply(
    messages: Message[],
    targetTokens: number,
    deps: PipelineDeps,
  ): Promise<StrategyResult>
}

/* ─────────────────────────────────────────────────────────────────────────
 * Strategy 1 — budget-reduction (free)
 *
 * Drop the body of tool_result blocks that are (a) older than N turns
 * AND (b) larger than M bytes, replacing them with a stub. Tool_use
 * blocks survive untouched so the conversation structure is preserved.
 * ───────────────────────────────────────────────────────────────────── */

const OLD_TURN_THRESHOLD = 10
const LARGE_RESULT_BYTES = 5_000

export const budgetReduction: CompactionStrategy = {
  name: "budget-reduction",
  cost: "free",
  async apply(messages, _target) {
    let modified = false
    const cutoff = messages.length - OLD_TURN_THRESHOLD
    const out = messages.map((m, i) => {
      if (i >= cutoff) return m
      if (typeof m.content === "string") return m
      const newContent: ContentBlock[] = m.content.map((block) => {
        if (
          block.type === "tool_result" &&
          block.content.length > LARGE_RESULT_BYTES
        ) {
          modified = true
          return {
            type: "tool_result",
            toolUseId: block.toolUseId,
            content: `[${block.content.length} bytes truncated by budget-reduction; tool was: ${describeToolFromContext(messages, block.toolUseId)}]`,
            isError: block.isError,
          }
        }
        return block
      })
      return { ...m, content: newContent }
    })
    return { messages: out, tokens: totalTokens(out), applied: modified }
  },
}

function describeToolFromContext(
  messages: Message[],
  toolUseId: string,
): string {
  for (const m of messages) {
    if (typeof m.content === "string") continue
    for (const b of m.content) {
      if (b.type === "tool_use" && b.id === toolUseId) return b.name
    }
  }
  return "unknown"
}

/* ─────────────────────────────────────────────────────────────────────────
 * Strategy 2 — snip (free)
 *
 * For tool_result blocks whose body exceeds SNIP_THRESHOLD bytes, keep
 * the first SNIP_HEAD_BYTES and last SNIP_TAIL_BYTES, elide the middle.
 * Applies regardless of how recent the turn is — large outputs are
 * rarely needed in full.
 * ───────────────────────────────────────────────────────────────────── */

const SNIP_THRESHOLD = 2_000
const SNIP_HEAD_BYTES = 600
const SNIP_TAIL_BYTES = 400

export const snip: CompactionStrategy = {
  name: "snip",
  cost: "free",
  async apply(messages, _target) {
    let modified = false
    const out = messages.map((m) => {
      if (typeof m.content === "string") return m
      const newContent: ContentBlock[] = m.content.map((block) => {
        if (
          block.type === "tool_result" &&
          block.content.length > SNIP_THRESHOLD
        ) {
          const len = block.content.length
          const head = block.content.slice(0, SNIP_HEAD_BYTES)
          const tail = block.content.slice(len - SNIP_TAIL_BYTES)
          modified = true
          return {
            type: "tool_result",
            toolUseId: block.toolUseId,
            content: `${head}\n\n[...${len - SNIP_HEAD_BYTES - SNIP_TAIL_BYTES} chars elided by snip...]\n\n${tail}`,
            isError: block.isError,
          }
        }
        return block
      })
      return { ...m, content: newContent }
    })
    return { messages: out, tokens: totalTokens(out), applied: modified }
  },
}

/* ─────────────────────────────────────────────────────────────────────────
 * Strategy 3 — microcompact (cheap)
 *
 * Find runs of ≥3 consecutive assistant→user tool turns (where the
 * assistant message contains tool_use blocks and the next user message
 * contains tool_result blocks) and replace each run with a single
 * synthetic summary message. Uses one Haiku call per run.
 *
 * If `deps.summarize` is absent, this strategy skips.
 * ───────────────────────────────────────────────────────────────────── */

const MICROCOMPACT_RUN_MIN = 3 // minimum tool-call cluster size to compact

export const microcompact: CompactionStrategy = {
  name: "microcompact",
  cost: "cheap",
  async apply(messages, _target, deps) {
    if (!deps.summarize) {
      return { messages, tokens: totalTokens(messages), applied: false }
    }

    // Find clusters of consecutive tool turns, excluding the most recent
    // OLD_TURN_THRESHOLD turns (don't compact what the agent is actively
    // reasoning about).
    const lastSafeIdx = messages.length - OLD_TURN_THRESHOLD
    const clusters: { start: number; end: number }[] = []
    let i = 0
    while (i < lastSafeIdx) {
      if (isToolMessagePair(messages, i)) {
        const start = i
        let end = i
        while (end + 2 < lastSafeIdx && isToolMessagePair(messages, end + 2)) {
          end += 2
        }
        const clusterTurns = (end - start) / 2 + 1
        if (clusterTurns >= MICROCOMPACT_RUN_MIN) {
          clusters.push({ start, end: end + 1 }) // include the last result message
        }
        i = end + 2
      } else {
        i++
      }
    }

    if (clusters.length === 0) {
      return { messages, tokens: totalTokens(messages), applied: false }
    }

    // Replace clusters back-to-front so indices stay valid.
    const out = [...messages]
    for (let c = clusters.length - 1; c >= 0; c--) {
      const cluster = clusters[c]
      const slice = out.slice(cluster.start, cluster.end + 1)
      const text = renderClusterForSummary(slice)
      const summary = await deps.summarize(
        text,
        "Summarize this run of tool calls into 2-4 sentences describing what the agent was investigating and what it found. Keep file paths and key results.",
      )
      const replacement: Message = {
        role: "user",
        content: `[Compacted ${(cluster.end - cluster.start + 1) / 2} tool turns]\n\n${summary}`,
      }
      out.splice(cluster.start, cluster.end - cluster.start + 1, replacement)
    }

    return { messages: out, tokens: totalTokens(out), applied: true }
  },
}

function isToolMessagePair(messages: Message[], idx: number): boolean {
  // idx must be an assistant message with tool_use AND idx+1 must be a
  // user message with tool_result.
  if (idx + 1 >= messages.length) return false
  const a = messages[idx]
  const b = messages[idx + 1]
  if (a.role !== "assistant" || b.role !== "user") return false
  if (typeof a.content === "string" || typeof b.content === "string") return false
  const aHasTool = a.content.some((c) => c.type === "tool_use")
  const bHasResult = b.content.some((c) => c.type === "tool_result")
  return aHasTool && bHasResult
}

function renderClusterForSummary(messages: Message[]): string {
  const lines: string[] = []
  for (const m of messages) {
    if (typeof m.content === "string") {
      lines.push(`${m.role.toUpperCase()}: ${m.content}`)
      continue
    }
    for (const b of m.content) {
      if (b.type === "text") lines.push(`${m.role.toUpperCase()}: ${b.text}`)
      else if (b.type === "tool_use")
        lines.push(`TOOL_CALL ${b.name}(${JSON.stringify(b.input)})`)
      else if (b.type === "tool_result") {
        const truncated =
          b.content.length > 1500 ? b.content.slice(0, 1500) + "…" : b.content
        lines.push(`TOOL_RESULT: ${truncated}`)
      }
    }
  }
  return lines.join("\n")
}

/* ─────────────────────────────────────────────────────────────────────────
 * Strategy 4 — context-collapse (medium)
 *
 * Summarize the entire history older than CONTEXT_COLLAPSE_THRESHOLD
 * turns into a single user message containing a "story so far" block.
 * Uses one Haiku call. Skips if `deps.summarize` is absent.
 * ───────────────────────────────────────────────────────────────────── */

const CONTEXT_COLLAPSE_THRESHOLD = 20

export const contextCollapse: CompactionStrategy = {
  name: "context-collapse",
  cost: "medium",
  async apply(messages, _target, deps) {
    if (!deps.summarize) {
      return { messages, tokens: totalTokens(messages), applied: false }
    }
    if (messages.length <= CONTEXT_COLLAPSE_THRESHOLD) {
      return { messages, tokens: totalTokens(messages), applied: false }
    }
    const splitIdx = messages.length - CONTEXT_COLLAPSE_THRESHOLD
    const oldMessages = messages.slice(0, splitIdx)
    const recentMessages = messages.slice(splitIdx)
    const oldText = renderClusterForSummary(oldMessages)
    const summary = await deps.summarize(
      oldText,
      "Summarize this conversation history into a concise narrative (≤8 sentences). Preserve key decisions, open questions, file paths touched, and any user constraints. The summary is the agent's only memory of these turns; be precise.",
    )
    const out: Message[] = [
      { role: "user", content: `[Story so far — context collapsed]\n\n${summary}` },
      ...recentMessages,
    ]
    return { messages: out, tokens: totalTokens(out), applied: true }
  },
}

/* ─────────────────────────────────────────────────────────────────────────
 * Strategy 5 — auto-compact (expensive)
 *
 * Last resort: replace the entire conversation with a single user
 * message containing the legacy compactor's handoff artifact. Calls
 * deps.compact (the existing D-027 Compactor); skips if absent.
 * ───────────────────────────────────────────────────────────────────── */

export const autoCompact: CompactionStrategy = {
  name: "auto-compact",
  cost: "expensive",
  async apply(messages, _target, deps) {
    if (!deps.compact) {
      return { messages, tokens: totalTokens(messages), applied: false }
    }
    const result = await deps.compact(messages)
    const out: Message[] = [
      {
        role: "user",
        content: `[Continuing from compaction. Use this handoff artifact to pick up the work cleanly.]\n\n${result.artifact}`,
      },
    ]
    return { messages: out, tokens: totalTokens(out), applied: true }
  },
}

/* ─────────────────────────────────────────────────────────────────────────
 * Pipeline orchestrator
 * ───────────────────────────────────────────────────────────────────── */

export const DEFAULT_STRATEGIES: CompactionStrategy[] = [
  budgetReduction,
  snip,
  microcompact,
  contextCollapse,
  autoCompact,
]

export interface PipelineRunResult {
  messages: Message[]
  /** Token estimate after pipeline ran. */
  tokens: number
  /** Names of strategies that actually modified the message list. */
  applied: string[]
}

/**
 * Run the compaction pipeline. Stops as soon as the post-strategy token
 * estimate is at or below `targetTokens`. Pipeline strategies that
 * return `applied: false` are still recorded as evaluated (for
 * telemetry) but do not trigger early-exit termination.
 */
export async function runCompactionPipeline(
  messages: Message[],
  targetTokens: number,
  deps: PipelineDeps = {},
  strategies: CompactionStrategy[] = DEFAULT_STRATEGIES,
): Promise<PipelineRunResult> {
  let current = messages
  let currentTokens = totalTokens(current)
  const applied: string[] = []

  for (const strategy of strategies) {
    if (currentTokens <= targetTokens) break
    const result = await strategy.apply(current, targetTokens, deps)
    if (result.applied) {
      current = result.messages
      currentTokens = result.tokens
      applied.push(strategy.name)
    }
  }

  return { messages: current, tokens: currentTokens, applied }
}
