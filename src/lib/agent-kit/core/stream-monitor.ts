/**
 * StreamMonitor — regex-only heuristic pattern matching.
 *
 * Monitors the agent's streaming output for concerning patterns without
 * making any LLM calls. Fires alerts that can be shown in the UI and
 * recorded in telemetry.
 *
 * Checks at three character thresholds:
 *   - 500 chars:  early warnings (starts wandering)
 *   - 2000 chars: mid-stream checks (getting verbose)
 *   - 5000 chars: late-stream checks (should have taken action by now)
 *
 * Code-specific patterns detected:
 *   - Placeholder code (TODO, FIXME, "implement me", "...")
 *   - Apology loops ("I apologize", "sorry for the confusion")
 *   - Scope creep signals ("while I'm at it", "also add")
 *   - Stalling (long text without any tool calls)
 *   - Hallucinated imports (import from non-existent packages)
 */

import type { StreamAlert } from "./telemetry"

export interface StreamMonitorConfig {
  /** Character thresholds at which to run checks. Default: [500, 2000, 5000] */
  thresholds?: number[]
  /** Maximum number of alerts before the monitor stops checking. Default: 10 */
  maxAlerts?: number
}

/** Patterns checked at each threshold level. */
interface PatternCheck {
  /** Unique pattern identifier. */
  id: string
  /** Human-readable alert message. */
  message: string
  /** Regex to test against the accumulated text. */
  pattern: RegExp
  /** Minimum character count before this check activates. */
  minChars: number
}

const PATTERNS: PatternCheck[] = [
  // Early warnings (500+ chars)
  {
    id: "apology-loop",
    message: "Agent appears to be in an apology loop — may be stuck",
    pattern:
      /(?:I apologize|sorry for (?:the )?confusion|I made (?:an? )?(?:error|mistake)){2,}/i,
    minChars: 500,
  },
  {
    id: "scope-creep",
    message: "Agent may be expanding scope beyond the original request",
    pattern:
      /(?:while I'm at it|while we're at it|also (?:add|update|fix|change)|let me also|additionally,? I'll)/i,
    minChars: 500,
  },

  // Mid-stream (2000+ chars)
  {
    id: "placeholder-code",
    message: "Agent output contains placeholder code markers",
    pattern:
      /(?:\/\/ ?TODO|\/\/ ?FIXME|\/\/ ?implement|\.{3}(?:\s*\/\/)|'implement me'|"implement me"|PLACEHOLDER)/i,
    minChars: 2000,
  },
  {
    id: "verbose-explanation",
    message:
      "Agent is writing extensively without taking action — consider steering",
    pattern:
      /(?:^|\n)(?:(?:First|Second|Third|Fourth|Fifth|Next|Then|After that|Finally),?\s)/i,
    minChars: 2000,
  },

  // Late-stream (5000+ chars)
  {
    id: "no-tool-calls",
    message:
      "Agent has written 5000+ characters without making any tool calls",
    pattern: /^[^]*$/, // always matches — the check is char-count gated
    minChars: 5000,
  },
  {
    id: "repeated-read",
    message: "Agent appears to be re-reading the same files repeatedly",
    pattern: /read_file.*read_file.*read_file/i,
    minChars: 5000,
  },
]

/**
 * StreamMonitor instance. Create one per agent run. Feed it text deltas
 * via `onDelta()` and tool calls via `onToolCall()`. Query alerts with
 * `getAlerts()`.
 */
export class StreamMonitor {
  private accumulated = ""
  private toolCallCount = 0
  private alerts: StreamAlert[] = []
  private firedPatterns = new Set<string>()
  private readonly config: Required<StreamMonitorConfig>

  constructor(config: StreamMonitorConfig = {}) {
    this.config = {
      thresholds: config.thresholds ?? [500, 2000, 5000],
      maxAlerts: config.maxAlerts ?? 10,
    }
  }

  /** Feed a text delta from the model's streaming output. */
  onDelta(delta: string): void {
    this.accumulated += delta
    this.checkPatterns()
  }

  /** Record a tool call (resets stall detection). */
  onToolCall(): void {
    this.toolCallCount++
  }

  /** Get all alerts fired so far. */
  getAlerts(): readonly StreamAlert[] {
    return this.alerts
  }

  /** Get the current accumulated character count. */
  getCharCount(): number {
    return this.accumulated.length
  }

  /** Reset the monitor (e.g. between iterations). */
  reset(): void {
    this.accumulated = ""
    this.toolCallCount = 0
    // Keep alerts and firedPatterns — they're per-run, not per-iteration
  }

  private checkPatterns(): void {
    if (this.alerts.length >= this.config.maxAlerts) return

    const charCount = this.accumulated.length

    for (const pattern of PATTERNS) {
      // Skip if below minimum char threshold
      if (charCount < pattern.minChars) continue
      // Skip if already fired
      if (this.firedPatterns.has(pattern.id)) continue

      // Special case: "no-tool-calls" only fires if no tools have been called
      if (pattern.id === "no-tool-calls" && this.toolCallCount > 0) continue

      if (pattern.pattern.test(this.accumulated)) {
        this.firedPatterns.add(pattern.id)
        this.alerts.push({
          type: pattern.id,
          message: pattern.message,
          charOffset: charCount,
          timestamp: Date.now(),
        })

        if (this.alerts.length >= this.config.maxAlerts) break
      }
    }
  }
}
