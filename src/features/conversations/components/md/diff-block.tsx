/**
 * DiffBlock — compact inline diff card for embedding in markdown content.
 *
 * Designed to be rendered as a custom node by the markdown renderer when
 * the agent emits e.g. `<DiffBlock filePath="..." old="..." new="..." />`.
 *
 * Reuses the trim-prefix/trim-suffix algorithm from `diff-preview.tsx`
 * (no LCS, no inline char diff). This variant is more compact: it is meant
 * to appear *inline* inside an assistant message rather than as a full
 * approval pane — a single header row (path + +N/-M) that expands into a
 * scrollable block of removed-then-added lines.
 *
 * `computeDiff` is exported so it can be unit-tested without a DOM.
 */

"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, FileDiff } from "lucide-react"

import { cn } from "@/lib/utils"

export interface DiffBlockProps {
  /** File path shown in the header (e.g. `src/foo.ts`). */
  filePath: string
  /** Original content. The prop is named `old` for ergonomic markdown use. */
  old: string
  /** New content. Named `new` for ergonomic markdown use. */
  new: string
  /** Whether the diff body starts expanded. */
  defaultExpanded?: boolean
  className?: string
}

export interface DiffSegments {
  prefix: string[]
  removed: string[]
  added: string[]
  suffix: string[]
}

/**
 * Computes the trimmed-context segments of a two-sided diff. Pure function,
 * side-effect free, exported for tests.
 */
export function computeDiff(oldContent: string, newContent: string): DiffSegments {
  const oldLines = oldContent.split("\n")
  const newLines = newContent.split("\n")

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

/**
 * Inline markdown diff block. Compact card with file-path header,
 * +N / -M badge, and expandable diff body.
 */
export function DiffBlock({
  filePath,
  old: oldContent,
  new: newContent,
  defaultExpanded = false,
  className,
}: DiffBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const segment = computeDiff(oldContent, newContent)
  const addedCount = segment.added.length
  const removedCount = segment.removed.length

  return (
    <div
      data-testid="diff-block"
      className={cn(
        "my-2 rounded-md border border-border bg-surface-1 overflow-hidden text-xs",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-2 w-full px-2 py-1 hover:bg-surface-2 transition-colors"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
        )}
        <FileDiff className="w-3 h-3 text-muted-foreground shrink-0" />
        <span className="font-mono text-[11px] truncate flex-1 text-left text-foreground">
          {filePath}
        </span>
        <span
          data-testid="diff-block-added"
          className="text-[10px] font-medium text-success tabular-nums"
        >
          +{addedCount}
        </span>
        <span
          data-testid="diff-block-removed"
          className="text-[10px] font-medium text-destructive tabular-nums"
        >
          -{removedCount}
        </span>
      </button>

      {expanded && (
        <pre
          data-testid="diff-block-body"
          className="font-mono text-[11px] leading-snug max-h-56 overflow-y-auto m-0"
        >
          {segment.prefix.length > 0 && (
            <div className="px-2 py-0.5 text-muted-foreground/70 italic border-b border-border/50">
              {segment.prefix.length === 1
                ? "1 unchanged line"
                : `${segment.prefix.length} unchanged lines`}
            </div>
          )}
          {segment.removed.map((line, i) => (
            <div
              key={`r-${i}`}
              className="px-2 bg-destructive/10 text-destructive whitespace-pre-wrap"
            >
              <span className="select-none opacity-60">- </span>
              {line}
            </div>
          ))}
          {segment.added.map((line, i) => (
            <div
              key={`a-${i}`}
              className="px-2 bg-success/10 text-success whitespace-pre-wrap"
            >
              <span className="select-none opacity-60">+ </span>
              {line}
            </div>
          ))}
          {segment.suffix.length > 0 && (
            <div className="px-2 py-0.5 text-muted-foreground/70 italic border-t border-border/50">
              {segment.suffix.length === 1
                ? "1 unchanged line"
                : `${segment.suffix.length} unchanged lines`}
            </div>
          )}
        </pre>
      )}
    </div>
  )
}
