"use client"

/**
 * D-024 — Thinking block. Renders Claude's extended-thinking text inside
 * a collapsible <details> block above the assistant message body.
 *
 * Praxiom design: muted surface-2 background, minimal border-l accent,
 * italic monospace content — clearly secondary to the main response.
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
      className="group/thinking mb-2"
    >
      <summary className="flex items-center gap-1.5 cursor-pointer list-none select-none text-muted-foreground/60 hover:text-muted-foreground/90 transition-colors">
        <ChevronRightIcon className="size-3 transition-transform group-open/thinking:rotate-90 shrink-0" />
        <BrainIcon className="size-3 shrink-0" />
        <span className="text-[10px] font-semibold uppercase tracking-widest">
          Thinking
        </span>
      </summary>
      <div
        className={cn(
          "mt-2 ml-3 pl-3 border-l-2 border-surface-4",
        )}
      >
        <pre
          className={cn(
            "whitespace-pre-wrap font-mono text-[10px] leading-relaxed",
            "text-muted-foreground/60 italic",
            "max-h-56 overflow-y-auto scrollbar-thin",
          )}
        >
          {thinking}
        </pre>
      </div>
    </details>
  )
}
