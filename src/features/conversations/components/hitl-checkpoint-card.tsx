/**
 * HitlCheckpointCard — renders a HITL approval gate inline in the chat.
 *
 * Authority: HITL sub-plan, DESIGN-SYSTEM §7.2 (surface / rounded-lg),
 * §7.4 (semantic color palette for status chips).
 *
 * The card shows the trigger reason, proposed action, and — when the
 * checkpoint is still PENDING — approve / reject / modify buttons.
 * Resolved checkpoints render read-only with a status chip.
 */

"use client"

import { useState } from "react"
import { useMutation } from "convex/react"
import { api } from "@/../convex/_generated/api"
import type { Id } from "@/../convex/_generated/dataModel"

interface HitlCheckpointCardProps {
  checkpointId: string
  status: string
  triggerType: string
  triggerReason: string
  proposedAction: string
  toolName?: string
  path?: string
}

const TRIGGER_ICONS: Record<string, string> = {
  "destructive-tool": "\u{1F5D1}\u{FE0F}",
  "sensitive-path": "\u{1F512}",
  "scope-creep": "↗\u{FE0F}",
  manual: "✋",
}

const TRIGGER_LABELS: Record<string, string> = {
  "destructive-tool": "Destructive Operation",
  "sensitive-path": "Sensitive File",
  "scope-creep": "Outside Scope",
  manual: "Manual Checkpoint",
}

export function HitlCheckpointCard({
  checkpointId,
  status,
  triggerType,
  triggerReason,
  proposedAction,
  toolName,
  path,
}: HitlCheckpointCardProps) {
  const [modText, setModText] = useState("")
  const [showModify, setShowModify] = useState(false)
  const resolve = useMutation(api.hitl_checkpoints.resolve)

  const handleResolve = async (
    resolution: "APPROVED" | "REJECTED" | "MODIFIED",
  ) => {
    await resolve({
      checkpointId: checkpointId as Id<"hitl_checkpoints">,
      resolution,
      modification: resolution === "MODIFIED" ? modText : undefined,
    })
  }

  const icon = TRIGGER_ICONS[triggerType] ?? "⚠\u{FE0F}"
  const label = TRIGGER_LABELS[triggerType] ?? triggerType
  const isPending = status === "PENDING"

  return (
    <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-4 my-2">
      <div className="flex items-start gap-3">
        <span className="text-xl">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              {label}
            </span>
            {!isPending && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300">
                {status}
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-2">
            {triggerReason}
          </p>
          {(toolName || path) && (
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 font-mono">
              {toolName && <span>Tool: {toolName}</span>}
              {toolName && path && <span> &middot; </span>}
              {path && <span>Path: {path}</span>}
            </div>
          )}
          <div className="text-xs bg-white dark:bg-zinc-800 rounded p-2 mb-3 font-mono text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap max-h-32 overflow-y-auto">
            {proposedAction}
          </div>

          {isPending && (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button
                  onClick={() => handleResolve("APPROVED")}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleResolve("REJECTED")}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
                >
                  Reject
                </button>
                <button
                  onClick={() => setShowModify(!showModify)}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                >
                  Modify
                </button>
              </div>
              {showModify && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={modText}
                    onChange={(e) => setModText(e.target.value)}
                    placeholder="Describe the modification..."
                    className="flex-1 px-3 py-1.5 text-xs rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                  <button
                    onClick={() => handleResolve("MODIFIED")}
                    disabled={!modText.trim()}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    Submit
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
