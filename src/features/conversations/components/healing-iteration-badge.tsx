"use client"

import { cn } from "@/lib/utils"
import { RefreshCw } from "lucide-react"

export interface HealingIterationBadgeProps {
  /** Current healing attempt (1-based). */
  attempt: number
  /** Max attempts allowed. */
  maxAttempts: number
  /** Current score (0-1). */
  score?: number
  /** Whether healing is still in progress. */
  isActive?: boolean
  className?: string
}

export function HealingIterationBadge({
  attempt,
  maxAttempts,
  score,
  isActive = false,
  className,
}: HealingIterationBadgeProps) {
  const pct = score !== undefined ? Math.round(score * 100) : undefined

  return (
    <div
      data-testid="healing-iteration-badge"
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium",
        isActive
          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
          : "bg-surface-3 text-muted-foreground",
        className,
      )}
    >
      <RefreshCw
        className={cn("w-3 h-3", isActive && "animate-spin")}
      />
      <span>
        Fix {attempt}/{maxAttempts}
      </span>
      {pct !== undefined && (
        <span className="text-[10px] opacity-70">
          ({pct}%)
        </span>
      )}
    </div>
  )
}
