/**
 * D-043 — Runtime error chip + drawer.
 *
 * Lives near the chat composer in the conversation sidebar. Live-queries
 * unconsumed runtime errors for the active project and surfaces:
 *   - hidden when count === 0
 *   - chip with count when 1..4 errors
 *   - chip + warning style when >= 5 errors (preview is in trouble)
 *
 * Click → expands a drawer listing the errors. "Clear" calls
 * runtimeErrors.clearForProject (marks all consumed).
 *
 * Designed to be unobtrusive: 0-state takes no space, error-state is
 * a single 24px chip. The agent already auto-injects errors at turn
 * start (D-046) so this is mostly for the user's mental model — they
 * can see the agent is aware of the same errors they're seeing.
 */
"use client"

import { useState } from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"

export interface RuntimeErrorChipProps {
  projectId: Id<"projects">
}

const ERROR_KIND_LABEL: Record<string, string> = {
  error: "Uncaught error",
  unhandled_rejection: "Promise rejection",
  console_error: "console.error",
  network_error: "Network error",
  react_error_boundary: "React boundary",
}

export function RuntimeErrorChip({ projectId }: RuntimeErrorChipProps) {
  const [open, setOpen] = useState(false)
  const errors = useQuery(api.runtimeErrors.listForProject, {
    projectId,
    onlyUnconsumed: true,
    limit: 50,
  })
  const clear = useMutation(api.runtimeErrors.clearForProject)

  // Loading or zero errors → render nothing (zero-cost UI).
  if (!errors || errors.length === 0) return null

  const count = errors.length
  const severe = count >= 5

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={`${count} preview runtime error${count === 1 ? "" : "s"}. Click to view.`}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
          severe
            ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-800/50 dark:bg-rose-950/40 dark:text-rose-300"
            : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-300"
        }`}
      >
        <span aria-hidden="true">⚠</span>
        <span>
          {count} preview error{count === 1 ? "" : "s"}
        </span>
        {severe && <span className="opacity-70">(stop and check)</span>}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Runtime errors"
          className="absolute right-0 top-full z-30 mt-2 w-96 max-w-[90vw] rounded-md border border-border bg-popover text-popover-foreground shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div className="text-sm font-medium">
              {count} preview runtime error{count === 1 ? "" : "s"}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  await clear({ projectId })
                  setOpen(false)
                }}
                className="rounded border border-border px-2 py-0.5 text-xs hover:bg-muted"
              >
                Clear
              </button>
              <button
                onClick={() => setOpen(false)}
                className="rounded border border-border px-2 py-0.5 text-xs hover:bg-muted"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>
          <ul className="max-h-72 divide-y divide-border overflow-auto text-xs">
            {errors.map((e) => (
              <li key={e._id} className="space-y-0.5 px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {ERROR_KIND_LABEL[e.kind] ?? e.kind}
                    {e.count && e.count > 1 ? (
                      <span className="ml-1 text-muted-foreground">×{e.count}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {formatRelative(e.timestamp)}
                  </span>
                </div>
                <div className="break-words text-foreground">{truncate(e.message, 240)}</div>
                {e.url && (
                  <div className="truncate font-mono text-muted-foreground">{e.url}</div>
                )}
              </li>
            ))}
          </ul>
          <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
            The agent will see these on its next turn.
          </div>
        </div>
      )}
    </div>
  )
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max) + "…"
}

function formatRelative(ts: number): string {
  const sec = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (sec < 60) return `${sec}s ago`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  return `${hr}h ago`
}
