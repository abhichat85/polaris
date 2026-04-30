"use client"

import { cn } from "@/lib/utils"
import { Loader2, CheckCircle2, XCircle, Zap, Clock } from "lucide-react"

export type AgentPhase =
  | "pre-flight"
  | "in-flight"
  | "post-flight"
  | "completed"
  | "error"

export interface AgentStatusBarProps {
  phase: AgentPhase
  /** Current iteration count. */
  iterations?: number
  /** Total tokens consumed. */
  tokens?: number
  /** Wall clock elapsed (ms). */
  elapsedMs?: number
  /** Task class (trivial/standard/hard). */
  taskClass?: string
  /** Model being used. */
  model?: string
  className?: string
}

const PHASE_CONFIG: Record<
  AgentPhase,
  { label: string; icon: typeof Loader2; color: string }
> = {
  "pre-flight": {
    label: "Classifying",
    icon: Zap,
    color: "text-blue-500",
  },
  "in-flight": {
    label: "Working",
    icon: Loader2,
    color: "text-primary",
  },
  "post-flight": {
    label: "Verifying",
    icon: Loader2,
    color: "text-amber-500",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    color: "text-success",
  },
  error: {
    label: "Error",
    icon: XCircle,
    color: "text-destructive",
  },
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const remainSec = sec % 60
  return `${min}m ${remainSec}s`
}

export function AgentStatusBar({
  phase,
  iterations,
  tokens,
  elapsedMs,
  taskClass,
  model,
  className,
}: AgentStatusBarProps) {
  const config = PHASE_CONFIG[phase]
  const Icon = config.icon
  const isAnimating = phase === "in-flight" || phase === "post-flight"

  return (
    <div
      data-testid="agent-status-bar"
      className={cn(
        "flex items-center gap-3 px-3 py-1.5 rounded-md bg-surface-2 text-xs",
        className,
      )}
    >
      <div className={cn("flex items-center gap-1.5", config.color)}>
        <Icon
          className={cn("w-3.5 h-3.5", isAnimating && "animate-spin")}
          data-testid="agent-phase-icon"
        />
        <span className="font-medium">{config.label}</span>
      </div>

      <div className="flex items-center gap-3 text-muted-foreground ml-auto">
        {taskClass && (
          <span data-testid="task-class" className="capitalize">
            {taskClass}
          </span>
        )}
        {model && (
          <span data-testid="model-id" className="font-mono text-[11px]">
            {model}
          </span>
        )}
        {iterations !== undefined && (
          <span data-testid="iteration-count">
            {iterations} iter
          </span>
        )}
        {tokens !== undefined && (
          <span data-testid="token-count">
            {formatTokens(tokens)} tok
          </span>
        )}
        {elapsedMs !== undefined && (
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span data-testid="elapsed-time">
              {formatDuration(elapsedMs)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
