/**
 * StreamingIndicator — 1px shimmer-line progress bar.
 *
 * Authority: Sub-Plan 04 §3, DESIGN-SYSTEM §7.5 (Shimmer progress bar).
 */

"use client"

import { cn } from "@/lib/utils"

export interface StreamingIndicatorProps {
  active?: boolean
  label?: string
  className?: string
}

export function StreamingIndicator({
  active = true,
  label = "Streaming response",
  className,
}: StreamingIndicatorProps) {
  if (!active) return null
  return (
    <div
      data-testid="streaming-indicator"
      role="progressbar"
      aria-label={label}
      className={cn(
        "h-px w-full bg-surface-3 overflow-hidden rounded-full",
        className,
      )}
    >
      <div
        data-testid="streaming-indicator-fill"
        className="h-full w-1/3 animate-shimmer-line bg-primary/60 rounded-full"
      />
    </div>
  )
}
