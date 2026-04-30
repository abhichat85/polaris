/**
 * HitlPreflightCard — pre-task HITL approval card.
 *
 * Differs from `HitlCheckpointCard` in that this is shown BEFORE the
 * agent begins executing a high-risk action (e.g. destructive tool,
 * sensitive path) — i.e. when `triggerType === "preflight"` or when
 * the checkpoint is blocking the run from starting.
 *
 * Uses `api.hitl_checkpoints.resolve` via the `onApprove` / `onReject`
 * / `onModify` callback layer so the parent can choose to wrap the
 * mutation, fire telemetry, or chain follow-up state updates.
 */

"use client"

import { useState } from "react"
import { AlertTriangle, ShieldCheck, ShieldX, Pencil } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { Id } from "@/../convex/_generated/dataModel"

export interface HitlPreflightCardProps {
  checkpointId: Id<"hitl_checkpoints">
  proposedAction: string
  triggerReason: string
  toolName?: string
  path?: string
  expiresAtMs?: number
  onApprove: () => void
  onReject: () => void
  onModify?: (modification: string) => void
  className?: string
}

function formatExpiry(ms: number): string {
  const remaining = ms - Date.now()
  if (remaining <= 0) return "expired"
  const sec = Math.floor(remaining / 1000)
  if (sec < 60) return `${sec}s left`
  const min = Math.floor(sec / 60)
  return `${min}m left`
}

export function HitlPreflightCard({
  checkpointId,
  proposedAction,
  triggerReason,
  toolName,
  path,
  expiresAtMs,
  onApprove,
  onReject,
  onModify,
  className,
}: HitlPreflightCardProps) {
  const [modText, setModText] = useState("")
  const [showModify, setShowModify] = useState(false)

  return (
    <div
      data-testid="hitl-preflight-card"
      data-checkpoint-id={checkpointId}
      className={cn(
        "rounded-lg border border-amber-300/60 bg-amber-50/60",
        "dark:border-amber-700/50 dark:bg-amber-950/20",
        "p-3 my-2",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle
          className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-foreground">
              Approval needed
            </span>
            {expiresAtMs !== undefined && (
              <span className="text-[10px] font-medium text-muted-foreground bg-surface-2 px-1.5 py-0.5 rounded">
                {formatExpiry(expiresAtMs)}
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground mb-2">
            {triggerReason}
          </p>

          {(toolName || path) && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {toolName && (
                <span className="inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-surface-2 text-muted-foreground">
                  {toolName}
                </span>
              )}
              {path && (
                <span className="inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-surface-2 text-muted-foreground">
                  {path}
                </span>
              )}
            </div>
          )}

          <pre
            className={cn(
              "text-[11px] font-mono whitespace-pre-wrap",
              "rounded-md bg-surface-2 text-foreground/90 px-2.5 py-2 mb-3",
              "max-h-32 overflow-y-auto",
            )}
          >
            {proposedAction}
          </pre>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="default"
                onClick={onApprove}
                className="h-7 gap-1"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onReject}
                className="h-7 gap-1"
              >
                <ShieldX className="w-3.5 h-3.5" />
                Reject
              </Button>
              {onModify && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowModify((s) => !s)}
                  className="h-7 gap-1"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Modify
                </Button>
              )}
            </div>

            {showModify && onModify && (
              <div className="flex gap-1.5">
                <Input
                  type="text"
                  value={modText}
                  onChange={(e) => setModText(e.target.value)}
                  placeholder="Describe the modification…"
                  className="flex-1 h-7 text-xs"
                />
                <Button
                  size="sm"
                  variant="default"
                  disabled={!modText.trim()}
                  onClick={() => onModify(modText.trim())}
                  className="h-7"
                >
                  Submit
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
