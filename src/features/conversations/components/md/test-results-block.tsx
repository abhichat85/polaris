/**
 * TestResultsBlock — renders a test-run summary with optional drilldown.
 *
 * Designed to be embedded inline in markdown content emitted by the
 * agent (e.g. after running `pnpm test`). Renders a one-line summary
 * with green/red/gray pills for passed/failed/skipped, plus optional
 * elapsed time, and an expandable list of failure rows. Each failure
 * row shows the test name and the first three lines of its error.
 */

"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, FlaskConical } from "lucide-react"

import { cn } from "@/lib/utils"

export interface TestFailure {
  test: string
  error: string
}

export interface TestResultsBlockProps {
  passed: number
  failed: number
  skipped?: number
  /** Total elapsed time in milliseconds. */
  duration?: number
  failures?: TestFailure[]
  className?: string
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function firstNLines(text: string, n: number): string {
  const lines = text.split("\n")
  return lines.slice(0, n).join("\n")
}

/**
 * Inline test results card with summary pills and expandable failures.
 */
export function TestResultsBlock({
  passed,
  failed,
  skipped = 0,
  duration,
  failures,
  className,
}: TestResultsBlockProps) {
  const total = passed + failed + skipped
  const hasFailures = failed > 0 && failures && failures.length > 0
  const [expanded, setExpanded] = useState(false)

  // Build the textual summary
  const parts: string[] = []
  parts.push(`${passed} passed`)
  if (failed > 0) parts.push(`${failed} failed`)
  if (skipped > 0) parts.push(`${skipped} skipped`)
  let summary = parts.join(", ")
  if (typeof duration === "number") summary += ` — ${formatDuration(duration)}`
  if (total === 0) summary = "No tests run"

  return (
    <div
      data-testid="test-results-block"
      className={cn(
        "my-2 rounded-md border border-border bg-surface-1 overflow-hidden text-xs",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => hasFailures && setExpanded((e) => !e)}
        disabled={!hasFailures}
        className={cn(
          "flex items-center gap-2 w-full px-2 py-1.5 text-left",
          hasFailures && "hover:bg-surface-2 transition-colors cursor-pointer",
        )}
        aria-expanded={hasFailures ? expanded : undefined}
      >
        {hasFailures ? (
          expanded ? (
            <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
          )
        ) : (
          <FlaskConical className="w-3 h-3 text-muted-foreground shrink-0" />
        )}

        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            data-testid="test-pill-passed"
            className={cn(
              "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums",
              passed > 0
                ? "bg-success/15 text-success"
                : "bg-surface-3 text-muted-foreground",
            )}
          >
            {passed} passed
          </span>
          <span
            data-testid="test-pill-failed"
            className={cn(
              "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums",
              failed > 0
                ? "bg-destructive/10 text-destructive"
                : "bg-surface-3 text-muted-foreground",
            )}
          >
            {failed} failed
          </span>
          {skipped > 0 && (
            <span
              data-testid="test-pill-skipped"
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums bg-surface-3 text-muted-foreground"
            >
              {skipped} skipped
            </span>
          )}
        </div>

        <span className="ml-auto text-[10px] font-mono text-muted-foreground tabular-nums">
          {typeof duration === "number" ? formatDuration(duration) : ""}
        </span>

        <span className="sr-only">{summary}</span>
      </button>

      {hasFailures && expanded && (
        <ul
          data-testid="test-failures"
          className="border-t border-border divide-y divide-border/50"
        >
          {failures!.map((f, i) => (
            <li key={i} className="px-2 py-1.5">
              <div className="font-mono text-[11px] text-destructive truncate">
                {f.test}
              </div>
              <pre className="mt-0.5 font-mono text-[10px] text-muted-foreground whitespace-pre-wrap leading-snug">
                {firstNLines(f.error, 3)}
              </pre>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
