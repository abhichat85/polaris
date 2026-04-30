/**
 * CoverageBlock — renders a coverage delta with an optional file breakdown.
 *
 * Designed to be embedded inline in markdown content. Shows a horizontal
 * progress bar filled to `after`%, the absolute coverage number, and a
 * delta indicator (+2.3% / -1.1%) tinted green or red. If `files` is
 * provided, a collapsible list shows the per-file before/after.
 */

"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, ShieldCheck } from "lucide-react"

import { cn } from "@/lib/utils"

export interface CoverageFile {
  path: string
  before: number
  after: number
}

export interface CoverageBlockProps {
  /** Coverage percentage before the change (0–100). */
  before: number
  /** Coverage percentage after the change (0–100). */
  after: number
  /** Optional per-file breakdown rendered in a collapsible section. */
  files?: CoverageFile[]
  className?: string
}

function clampPct(n: number): number {
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(100, n))
}

function formatDelta(delta: number): string {
  const sign = delta > 0 ? "+" : delta < 0 ? "" : "±"
  return `${sign}${delta.toFixed(1)}%`
}

/**
 * Inline coverage delta card.
 */
export function CoverageBlock({
  before,
  after,
  files,
  className,
}: CoverageBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const hasFiles = files !== undefined && files.length > 0

  const safeAfter = clampPct(after)
  const delta = after - before
  const deltaTone =
    delta > 0
      ? "text-success"
      : delta < 0
        ? "text-destructive"
        : "text-muted-foreground"

  return (
    <div
      data-testid="coverage-block"
      className={cn(
        "my-2 rounded-md border border-border bg-surface-1 overflow-hidden text-xs",
        className,
      )}
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        <ShieldCheck className="w-3 h-3 text-muted-foreground shrink-0" />
        <span className="text-[11px] font-medium text-foreground">
          Coverage
        </span>
        <span
          data-testid="coverage-after"
          className="text-[11px] font-mono tabular-nums text-foreground"
        >
          {safeAfter.toFixed(1)}%
        </span>
        <span
          data-testid="coverage-delta"
          className={cn("text-[10px] font-medium tabular-nums", deltaTone)}
        >
          {formatDelta(delta)}
        </span>
        {hasFiles && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            aria-expanded={expanded}
          >
            {expanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            {files!.length} file{files!.length === 1 ? "" : "s"}
          </button>
        )}
      </div>

      <div className="px-2 pb-2">
        <div
          className="h-1.5 w-full rounded bg-surface-3 overflow-hidden"
          role="progressbar"
          aria-valuenow={safeAfter}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            data-testid="coverage-bar-fill"
            className={cn(
              "h-full transition-[width] duration-300",
              delta < 0 ? "bg-destructive/70" : "bg-success/70",
            )}
            style={{ width: `${safeAfter}%` }}
          />
        </div>
      </div>

      {hasFiles && expanded && (
        <ul
          data-testid="coverage-files"
          className="border-t border-border divide-y divide-border/50"
        >
          {files!.map((f, i) => {
            const fileDelta = f.after - f.before
            const tone =
              fileDelta > 0
                ? "text-success"
                : fileDelta < 0
                  ? "text-destructive"
                  : "text-muted-foreground"
            return (
              <li
                key={i}
                className="flex items-center gap-2 px-2 py-1 font-mono text-[11px]"
              >
                <span className="truncate flex-1 text-foreground">
                  {f.path}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {clampPct(f.after).toFixed(1)}%
                </span>
                <span className={cn("tabular-nums text-[10px]", tone)}>
                  {formatDelta(fileDelta)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
