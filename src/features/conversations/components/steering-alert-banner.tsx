/**
 * SteeringAlertBanner — small inline banner shown above an assistant
 * message when the user's mid-run steers were folded into the agent's
 * loop. Indicates "you nudged this run".
 *
 * Authority: D-033 (steering queue). Reads from
 * `harness_telemetry.steeringInjected` (count) and the most recent
 * steering text (passed in as `message`).
 */

"use client"

import { CornerDownRight } from "lucide-react"

import { cn } from "@/lib/utils"

export interface SteeringAlertBannerProps {
  /** What the user nudged with (most recent steer text). */
  message: string
  /** How many steers were applied. */
  count?: number
  className?: string
}

export function SteeringAlertBanner({
  message,
  count,
  className,
}: SteeringAlertBannerProps) {
  if (!message) return null

  return (
    <div
      data-testid="steering-alert-banner"
      className={cn(
        "flex items-start gap-2 px-2.5 py-1.5 my-2",
        "rounded-md border-l-2 border-primary/60 bg-primary/5",
        className,
      )}
    >
      <CornerDownRight
        className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary"
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
            Steered
          </span>
          {count !== undefined && count > 1 && (
            <span className="text-[10px] text-muted-foreground">
              {count}×
            </span>
          )}
        </div>
        <p className="text-xs text-foreground/85 whitespace-pre-wrap break-words">
          {message}
        </p>
      </div>
    </div>
  )
}
