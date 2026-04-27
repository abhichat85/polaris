"use client"

/**
 * D-024 — Thinking block. Renders Claude's extended-thinking text inside
 * a collapsible <details> block above the assistant message body.
 *
 * Praxiom design: muted-foreground italic, no border, only surface
 * contrast to set it apart from the main message.
 */

import { ChevronRightIcon, BrainIcon } from "lucide-react"

import { cn } from "@/lib/utils"

interface Props {
  thinking?: string | null
  /** Default: collapsed. */
  defaultOpen?: boolean
}

export const ThinkingBlock = ({ thinking, defaultOpen = false }: Props) => {
  if (!thinking || thinking.trim().length === 0) return null

  return (
    <details
      open={defaultOpen}
      className={cn(
        "group/thinking rounded-md bg-surface-2 px-3 py-2 mb-2",
        "transition-colors hover:bg-surface-3/60",
      )}
    >
      <summary className="flex items-center gap-2 cursor-pointer list-none select-none">
        <ChevronRightIcon className="size-3.5 text-muted-foreground transition-transform group-open/thinking:rotate-90" />
        <BrainIcon className="size-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Thinking
        </span>
      </summary>
      <pre
        className={cn(
          "mt-2 whitespace-pre-wrap font-mono text-[11px] leading-relaxed",
          "text-muted-foreground/85 italic",
          "max-h-72 overflow-y-auto scrollbar-thin",
        )}
      >
        {thinking}
      </pre>
    </details>
  )
}
