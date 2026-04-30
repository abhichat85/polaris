/**
 * StreamAlertChip + StreamAlertBar — dismissible chips for StreamMonitor alerts.
 *
 * Authority: D-033 (stream monitoring). Renders detected anti-patterns
 * (apology loops, scope creep, etc.) as compact color-coded chips.
 */

"use client"

import { useState } from "react"

import { cn } from "@/lib/utils"

export interface StreamAlertChipProps {
  type: string
  message: string
  /** Callback when the user dismisses the alert. */
  onDismiss?: () => void
  className?: string
}

/** Human-friendly labels for alert types. */
const ALERT_LABELS: Record<string, string> = {
  "apology-loop": "Apology loop",
  "scope-creep": "Scope creep",
  "placeholder-code": "Placeholder code",
  "verbose-explanation": "Verbose",
  "no-tool-calls": "Stalling",
  "repeated-read": "Repeated reads",
}

/** Severity-based color tokens. */
const ALERT_COLORS: Record<string, string> = {
  "apology-loop":
    "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  "scope-creep":
    "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  "placeholder-code":
    "bg-destructive/10 text-destructive",
  "verbose-explanation":
    "bg-primary/10 text-primary",
  "no-tool-calls":
    "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  "repeated-read":
    "bg-purple-500/10 text-purple-700 dark:text-purple-400",
}

const DEFAULT_COLOR =
  "bg-muted text-muted-foreground"

export function StreamAlertChip({
  type,
  message,
  onDismiss,
  className,
}: StreamAlertChipProps) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const label = ALERT_LABELS[type] ?? type
  const color = ALERT_COLORS[type] ?? DEFAULT_COLOR

  return (
    <div
      data-testid="stream-alert-chip"
      data-alert-type={type}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
        color,
        "animate-chat-enter",
        className,
      )}
      title={message}
    >
      <span>{label}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={() => {
            setDismissed(true)
            onDismiss()
          }}
          className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
          aria-label={`Dismiss ${label} alert`}
        >
          &times;
        </button>
      )}
    </div>
  )
}

/**
 * Container for multiple stream alerts. Renders as a horizontal row of chips.
 */
export interface StreamAlertBarProps {
  alerts: Array<{ type: string; message: string }>
  onDismiss?: (type: string) => void
  className?: string
}

export function StreamAlertBar({
  alerts,
  onDismiss,
  className,
}: StreamAlertBarProps) {
  if (alerts.length === 0) return null

  return (
    <div
      data-testid="stream-alert-bar"
      className={cn("flex flex-wrap gap-1.5 px-4 py-2", className)}
    >
      {alerts.map((alert) => (
        <StreamAlertChip
          key={alert.type}
          type={alert.type}
          message={alert.message}
          onDismiss={onDismiss ? () => onDismiss(alert.type) : undefined}
        />
      ))}
    </div>
  )
}
