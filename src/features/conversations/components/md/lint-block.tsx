/**
 * LintBlock — renders lint findings grouped by file.
 *
 * Designed to be embedded inline in markdown content. Shows a one-line
 * count summary by severity ("3 errors, 5 warnings"), then an expandable
 * list of findings grouped by file. Each row displays:
 *   `file:line  severity  message  [rule]`
 *
 * Severity is shown as a colored chip:
 *   error   → destructive
 *   warning → warning
 *   info    → muted
 */

"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react"

import { cn } from "@/lib/utils"

export type LintSeverity = "error" | "warning" | "info"

export interface LintFinding {
  file: string
  line: number
  column?: number
  severity: LintSeverity
  message: string
  rule?: string
}

export interface LintBlockProps {
  findings: LintFinding[]
  className?: string
}

const SEVERITY_CHIP: Record<LintSeverity, string> = {
  error: "bg-destructive/10 text-destructive",
  warning: "bg-warning/15 text-warning",
  info: "bg-surface-3 text-muted-foreground",
}

interface Counts {
  error: number
  warning: number
  info: number
}

function countBySeverity(findings: LintFinding[]): Counts {
  const c: Counts = { error: 0, warning: 0, info: 0 }
  for (const f of findings) c[f.severity]++
  return c
}

function buildSummary(c: Counts): string {
  const parts: string[] = []
  if (c.error > 0)
    parts.push(`${c.error} error${c.error === 1 ? "" : "s"}`)
  if (c.warning > 0)
    parts.push(`${c.warning} warning${c.warning === 1 ? "" : "s"}`)
  if (c.info > 0) parts.push(`${c.info} info`)
  return parts.length === 0 ? "No findings" : parts.join(", ")
}

function groupByFile(findings: LintFinding[]): Map<string, LintFinding[]> {
  const m = new Map<string, LintFinding[]>()
  for (const f of findings) {
    const list = m.get(f.file)
    if (list) list.push(f)
    else m.set(f.file, [f])
  }
  return m
}

/**
 * Inline lint findings card.
 */
export function LintBlock({ findings, className }: LintBlockProps) {
  const counts = useMemo(() => countBySeverity(findings), [findings])
  const grouped = useMemo(() => groupByFile(findings), [findings])
  const summary = buildSummary(counts)

  const hasFindings = findings.length > 0
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      data-testid="lint-block"
      className={cn(
        "my-2 rounded-md border border-border bg-surface-1 overflow-hidden text-xs",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => hasFindings && setExpanded((e) => !e)}
        disabled={!hasFindings}
        className={cn(
          "flex items-center gap-2 w-full px-2 py-1.5 text-left",
          hasFindings && "hover:bg-surface-2 transition-colors cursor-pointer",
        )}
        aria-expanded={hasFindings ? expanded : undefined}
      >
        {hasFindings ? (
          expanded ? (
            <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
          )
        ) : (
          <AlertTriangle className="w-3 h-3 text-muted-foreground shrink-0" />
        )}
        <span
          data-testid="lint-summary"
          className="text-[11px] font-medium text-foreground"
        >
          {summary}
        </span>
      </button>

      {hasFindings && expanded && (
        <div
          data-testid="lint-findings"
          className="border-t border-border divide-y divide-border/50"
        >
          {Array.from(grouped.entries()).map(([file, items]) => (
            <div key={file} className="py-1">
              <div className="px-2 pt-0.5 pb-1 font-mono text-[10px] text-muted-foreground/80 truncate">
                {file}
              </div>
              <ul>
                {items.map((f, i) => (
                  <li
                    key={i}
                    className="px-2 py-0.5 flex items-baseline gap-2 font-mono text-[11px] leading-snug"
                  >
                    <span className="text-muted-foreground tabular-nums shrink-0">
                      {f.line}
                      {f.column !== undefined ? `:${f.column}` : ""}
                    </span>
                    <span
                      data-testid={`lint-severity-${f.severity}`}
                      className={cn(
                        "px-1 rounded text-[9px] font-semibold uppercase tracking-wide shrink-0",
                        SEVERITY_CHIP[f.severity],
                      )}
                    >
                      {f.severity}
                    </span>
                    <span className="text-foreground flex-1 break-words">
                      {f.message}
                    </span>
                    {f.rule && (
                      <span className="text-muted-foreground/70 text-[10px] shrink-0">
                        [{f.rule}]
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
