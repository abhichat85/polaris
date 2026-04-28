"use client"

/**
 * D-026 — Plan pane. Renders the structured plan from convex/specs.getPlan
 * as an editable checklist grouped by sprint. Tick boxes update agent +
 * UI state in real time (Convex live queries).
 *
 * Praxiom design: §7.4 status chips, §4.3 left-edge accent for sprints in
 * progress, JetBrains Mono for feature ids.
 */

import { useMemo } from "react"
import { useQuery } from "convex/react"
import {
  CheckCircleIcon,
  CircleIcon,
  CircleDotIcon,
  AlertCircleIcon,
  Loader2Icon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"

type Status = "todo" | "in_progress" | "done" | "blocked"

const STATUS_META: Record<Status, { icon: typeof CheckCircleIcon; tone: string }> = {
  todo: { icon: CircleIcon, tone: "text-muted-foreground/60" },
  in_progress: { icon: Loader2Icon, tone: "text-info animate-spin-slow" },
  done: { icon: CheckCircleIcon, tone: "text-success" },
  blocked: { icon: AlertCircleIcon, tone: "text-warning" },
}

const PRIORITY_TONE: Record<"p0" | "p1" | "p2", string> = {
  p0: "bg-destructive/10 text-destructive",
  p1: "bg-primary/10 text-primary",
  p2: "bg-surface-4 text-muted-foreground",
}

interface Props {
  projectId: Id<"projects">
}

export const PlanPane = ({ projectId }: Props) => {
  const plan = useQuery(api.specs.getPlan, { projectId })

  const grouped = useMemo(() => {
    if (!plan) return null
    const bySprint = new Map<number, typeof plan.features>()
    for (const f of plan.features) {
      const k = f.sprint ?? 0
      if (!bySprint.has(k)) bySprint.set(k, [])
      bySprint.get(k)!.push(f)
    }
    return Array.from(bySprint.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([sprint, features]) => ({ sprint, features }))
  }, [plan])

  if (plan === undefined) {
    return (
      <div className="h-full flex items-center justify-center bg-surface-1">
        <Loader2Icon className="size-4 animate-spin text-muted-foreground/50" />
      </div>
    )
  }

  if (plan === null) {
    return (
      <div className="h-full bg-surface-1 p-4 flex flex-col gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          Plan
        </span>
        <p className="text-sm text-muted-foreground/80 leading-relaxed">
          No plan yet. Send your first message to generate one.
        </p>
      </div>
    )
  }

  const total = plan.features.length
  const done = plan.features.filter((f) => f.status === "done").length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="h-full flex flex-col bg-surface-1 overflow-hidden">
      {/* Praxiom-quality panel header */}
      <div className="h-10 px-3 flex items-center justify-between shrink-0 border-b border-surface-3/60">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/50 shrink-0">
            Build Plan
          </span>
          <span className="text-surface-3 shrink-0">·</span>
          <span className="text-[10px] font-mono tabular-nums text-muted-foreground/60 shrink-0">
            {done}/{total}
          </span>
        </div>
        {/* Inline progress pill */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-16 h-1 rounded-full bg-surface-3 overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${pct}%` }}
              aria-hidden
            />
          </div>
          <span className="text-[10px] font-mono tabular-nums text-muted-foreground/50">
            {Math.round(pct)}%
          </span>
        </div>
      </div>
      {/* Plan title */}
      <div className="px-3 py-2 shrink-0 border-b border-surface-3/30">
        <h2 className="font-heading text-sm font-semibold text-foreground tracking-[-0.02em] truncate">
          {plan.title ?? "Build plan"}
        </h2>
      </div>

      {/* Sprints */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-3">
        {grouped?.map((g) => {
          const sprintInProgress = g.features.some(
            (f) => f.status === "in_progress",
          )
          return (
            <div key={g.sprint} className="mt-3 first:mt-1">
              <div className="relative px-1.5 py-1 mb-1 flex items-center gap-2">
                <span
                  className={cn(
                    "absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-3 rounded-r-full transition-colors",
                    sprintInProgress ? "bg-primary" : "bg-transparent",
                  )}
                />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Sprint {g.sprint}
                </span>
              </div>
              <ul className="flex flex-col gap-0.5">
                {g.features.map((f) => {
                  const meta = STATUS_META[f.status as Status]
                  const Icon = meta.icon
                  const StatusIcon =
                    f.status === "in_progress" ? CircleDotIcon : Icon
                  return (
                    <li
                      key={f.id}
                      className={cn(
                        "px-2 py-1.5 rounded-md flex items-start gap-2",
                        "hover:bg-surface-2 transition-colors",
                      )}
                    >
                      <StatusIcon
                        className={cn("size-3.5 mt-0.5 shrink-0", meta.tone)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "text-[10px] font-mono text-muted-foreground/70 truncate",
                              f.status === "done" && "line-through opacity-60",
                            )}
                          >
                            {f.id}
                          </span>
                          <span
                            className={cn(
                              "text-[9px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded shrink-0",
                              PRIORITY_TONE[f.priority],
                            )}
                          >
                            {f.priority}
                          </span>
                        </div>
                        <div
                          className={cn(
                            "text-xs text-foreground/90 leading-relaxed mt-0.5",
                            f.status === "done" && "line-through opacity-60",
                          )}
                        >
                          {f.title}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
