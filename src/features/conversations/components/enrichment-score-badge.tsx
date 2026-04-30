/**
 * EnrichmentScoreBadge — compact pill showing the agent-detected prompt
 * completeness score with colour-coded styling.
 *
 * Red  < 55 %  :  bg-red-500/15  text-red-400  border-red-500/30
 * Amber < 82 %  :  bg-amber-500/15 text-amber-400 border-amber-500/30
 * Green ≥ 82 %  :  bg-green-500/15 text-green-400 border-green-500/30
 */

"use client"

import { cn } from "@/lib/utils"
import {
  scoreToColor,
  scoreToPercent,
} from "@/lib/agent-kit/core/prompt-enrichment"

export interface EnrichmentScoreBadgeProps {
  score: number // 0-1
  className?: string
}

const COLOR_CLASSES: Record<
  "red" | "amber" | "green",
  { bg: string; text: string; border: string }
> = {
  red: {
    bg: "bg-red-500/15",
    text: "text-red-400",
    border: "border border-red-500/30",
  },
  amber: {
    bg: "bg-amber-500/15",
    text: "text-amber-400",
    border: "border border-amber-500/30",
  },
  green: {
    bg: "bg-green-500/15",
    text: "text-green-400",
    border: "border border-green-500/30",
  },
}

export function EnrichmentScoreBadge({
  score,
  className,
}: EnrichmentScoreBadgeProps) {
  const color = scoreToColor(score)
  const { bg, text, border } = COLOR_CLASSES[color]

  return (
    <span
      data-testid="enrichment-score-badge"
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium",
        bg,
        text,
        border,
        className,
      )}
    >
      Agent detected prompt score : {scoreToPercent(score)}
    </span>
  )
}
