"use client"

import { cn } from "@/lib/utils"
import { Shield, ShieldCheck, ShieldAlert } from "lucide-react"

export interface QualityBadgeProps {
  /** Normalized score 0-1. */
  score: number
  /** Verdict from the evaluator. */
  verdict?: "PASS" | "RETURN-FOR-FIX" | "FAIL"
  /** Show score as percentage. */
  showPercentage?: boolean
  className?: string
}

function getScoreConfig(score: number) {
  if (score >= 0.85) {
    return {
      icon: ShieldCheck,
      color: "text-success",
      bg: "bg-success/10",
      label: "High quality",
    }
  }
  if (score >= 0.5) {
    return {
      icon: Shield,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      label: "Acceptable",
    }
  }
  return {
    icon: ShieldAlert,
    color: "text-destructive",
    bg: "bg-destructive/10",
    label: "Needs improvement",
  }
}

export function QualityBadge({
  score,
  verdict,
  showPercentage = true,
  className,
}: QualityBadgeProps) {
  const config = getScoreConfig(score)
  const Icon = config.icon
  const pct = Math.round(score * 100)

  return (
    <div
      data-testid="quality-badge"
      title={`${config.label} — ${pct}%${verdict ? ` (${verdict})` : ""}`}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium",
        config.bg,
        config.color,
        className,
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {showPercentage && <span>{pct}%</span>}
      {verdict && (
        <span className="text-[10px] uppercase tracking-wide opacity-70">
          {verdict}
        </span>
      )}
    </div>
  )
}
