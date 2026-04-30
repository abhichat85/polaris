/**
 * DiffPreview — minimal inline diff renderer.
 *
 * Trims a common prefix and suffix from the line arrays of `oldContent`
 * and `newContent`, then shows the middle as `-` (red-tinted, removed)
 * followed by `+` (green-tinted, added). This is intentionally simple —
 * no LCS, no inline character diff. Good enough for a quick preview
 * inside a HITL approval card, file-change row, or tool-call result.
 */

"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, FileDiff } from "lucide-react"

import { cn } from "@/lib/utils"

export interface DiffPreviewProps {
  filePath: string
  oldContent: string
  newContent: string
  defaultExpanded?: boolean
  className?: string
}

interface DiffSegment {
  prefix: string[]
  removed: string[]
  added: string[]
  suffix: string[]
}

function computeSegment(oldLines: string[], newLines: string[]): DiffSegment {
  let prefixLen = 0
  const minLen = Math.min(oldLines.length, newLines.length)
  while (prefixLen < minLen && oldLines[prefixLen] === newLines[prefixLen]) {
    prefixLen++
  }

  let suffixLen = 0
  while (
    suffixLen < minLen - prefixLen &&
    oldLines[oldLines.length - 1 - suffixLen] ===
      newLines[newLines.length - 1 - suffixLen]
  ) {
    suffixLen++
  }

  return {
    prefix: oldLines.slice(0, prefixLen),
    removed: oldLines.slice(prefixLen, oldLines.length - suffixLen),
    added: newLines.slice(prefixLen, newLines.length - suffixLen),
    suffix: oldLines.slice(oldLines.length - suffixLen),
  }
}

export function DiffPreview({
  filePath,
  oldContent,
  newContent,
  defaultExpanded = false,
  className,
}: DiffPreviewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const oldLines = oldContent.split("\n")
  const newLines = newContent.split("\n")
  const segment = computeSegment(oldLines, newLines)

  const addedCount = segment.added.length
  const removedCount = segment.removed.length

  return (
    <div
      data-testid="diff-preview"
      className={cn(
        "rounded-md border border-border bg-surface-1 overflow-hidden text-xs",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-2 w-full px-2.5 py-1.5 hover:bg-surface-2 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        )}
        <FileDiff className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="font-mono text-[11px] truncate flex-1 text-left text-foreground">
          {filePath}
        </span>
        <span className="text-[10px] font-medium text-success">
          +{addedCount}
        </span>
        <span className="text-[10px] font-medium text-destructive">
          -{removedCount}
        </span>
      </button>

      {expanded && (
        <pre className="font-mono text-[11px] leading-relaxed max-h-72 overflow-y-auto">
          {segment.prefix.length > 0 && (
            <div className="px-2.5 py-0.5 text-muted-foreground/70 italic border-b border-border/50">
              {segment.prefix.length === 1
                ? `1 unchanged line`
                : `${segment.prefix.length} unchanged lines`}
            </div>
          )}
          {segment.removed.map((line, i) => (
            <div
              key={`removed-${i}`}
              className="px-2.5 bg-destructive/10 text-destructive whitespace-pre-wrap"
            >
              <span className="select-none opacity-60">- </span>
              {line}
            </div>
          ))}
          {segment.added.map((line, i) => (
            <div
              key={`added-${i}`}
              className="px-2.5 bg-success/10 text-success whitespace-pre-wrap"
            >
              <span className="select-none opacity-60">+ </span>
              {line}
            </div>
          ))}
          {segment.suffix.length > 0 && (
            <div className="px-2.5 py-0.5 text-muted-foreground/70 italic border-t border-border/50">
              {segment.suffix.length === 1
                ? `1 unchanged line`
                : `${segment.suffix.length} unchanged lines`}
            </div>
          )}
        </pre>
      )}
    </div>
  )
}
