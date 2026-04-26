/**
 * ErrorState — surfaces all 8 error categories from CONSTITUTION Article XII.
 *
 * Authority: Sub-Plan 04 §4, CONSTITUTION §2.6 (failures are honest), Article
 * XII (4-layer error recovery). Each category has a concrete, actionable
 * recovery suggestion — never a generic "something went wrong".
 */

"use client"

import { AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type ErrorCategory =
  | "agent_error"
  | "sandbox_dead"
  | "quota_exceeded"
  | "network_error"
  | "model_error"
  | "tool_error"
  | "validation_error"
  | "unknown"

export interface ErrorStateProps {
  category: ErrorCategory
  message: string
  onRetry?: () => void
}

const COPY: Record<
  ErrorCategory,
  { title: string; recovery: string }
> = {
  agent_error: {
    title: "Agent run failed",
    recovery:
      "The agent stopped before finishing. Open the latest checkpoint or send the request again.",
  },
  sandbox_dead: {
    title: "Sandbox is unavailable",
    recovery:
      "Your dev sandbox stopped responding. We will spin up a fresh one — retry to continue.",
  },
  quota_exceeded: {
    title: "Monthly quota reached",
    recovery:
      "You've used your plan's tokens for this billing period. Upgrade or wait until next month.",
  },
  network_error: {
    title: "Network interrupted",
    recovery:
      "Check your connection and retry. Your work is saved — nothing was lost.",
  },
  model_error: {
    title: "Model returned an error",
    recovery:
      "The provider rejected the request (overloaded or filtered). Retry, or switch models.",
  },
  tool_error: {
    title: "Tool call failed",
    recovery:
      "The agent's tool returned an error. The model can usually self-correct — retry to let it try again.",
  },
  validation_error: {
    title: "Request was rejected",
    recovery:
      "Your message couldn't be parsed. Edit the prompt and try once more.",
  },
  unknown: {
    title: "Unexpected error",
    recovery:
      "We logged the failure and will look into it. Retry, or refresh the page if this keeps happening.",
  },
}

export function ErrorState({ category, message, onRetry }: ErrorStateProps) {
  const copy = COPY[category]
  return (
    <div
      data-testid="error-state"
      data-category={category}
      role="alert"
      className={cn(
        "rounded-lg bg-destructive/10 px-3 py-2.5",
        "flex flex-col gap-2 animate-chat-enter",
      )}
    >
      <div className="flex items-center gap-2">
        <AlertTriangle
          className="w-3.5 h-3.5 text-destructive shrink-0"
          aria-hidden="true"
        />
        <span className="text-xs font-medium text-destructive">
          {copy.title}
        </span>
      </div>
      <p className="text-xs text-foreground font-mono break-words">
        {message}
      </p>
      <p
        data-testid="error-recovery"
        className="text-xs text-muted-foreground"
      >
        {copy.recovery}
      </p>
      {onRetry && (
        <div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRetry}
          >
            Retry
          </Button>
        </div>
      )}
    </div>
  )
}
