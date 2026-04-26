"use client"

import * as React from "react"
import { useMutation } from "convex/react"
import { ChevronDownIcon } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import {
  FEATURE_STATUSES,
  isValidStatusTransition,
  type FeatureStatus,
} from "@/features/specs/lib/feature-validation"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"

const STATUS_LABEL: Record<FeatureStatus, string> = {
  todo: "Todo",
  in_progress: "In progress",
  done: "Done",
  blocked: "Blocked",
}

const STATUS_CHIP: Record<FeatureStatus, string> = {
  todo: "bg-surface-4 text-muted-foreground",
  in_progress: "bg-primary/15 text-primary",
  done: "bg-success/15 text-success",
  blocked: "bg-destructive/15 text-destructive",
}

export interface StatusDropdownProps {
  currentStatus: FeatureStatus
  featureId: string
  projectId: Id<"projects">
}

export function StatusDropdown({ currentStatus, featureId, projectId }: StatusDropdownProps) {
  const updateStatus = useMutation(api.specs.updateFeatureStatus)

  const transitions = FEATURE_STATUSES.filter((s) =>
    isValidStatusTransition(currentStatus, s),
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={STATUS_LABEL[currentStatus]}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide",
            STATUS_CHIP[currentStatus],
          )}
        >
          {STATUS_LABEL[currentStatus]}
          <ChevronDownIcon className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {transitions.map((s) => (
          <DropdownMenuItem
            key={s}
            onSelect={() =>
              updateStatus({ projectId, featureId, status: s })
            }
          >
            {STATUS_LABEL[s]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
