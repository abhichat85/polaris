"use client"

import * as React from "react"
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import type { Feature, FeaturePriority } from "@/features/specs/lib/feature-validation"
import type { Id } from "../../../../convex/_generated/dataModel"

import { StatusDropdown } from "./status-dropdown"
import { AcceptanceCriteriaEditor } from "./acceptance-criteria-editor"

const PRIORITY_CHIP: Record<FeaturePriority, string> = {
  p0: "bg-destructive/15 text-destructive",
  p1: "bg-warning/15 text-warning",
  p2: "bg-success/15 text-success",
}

export interface FeatureCardProps {
  feature: Feature
  projectId: Id<"projects">
  defaultExpanded?: boolean
}

export function FeatureCard({ feature, projectId, defaultExpanded = false }: FeatureCardProps) {
  const [expanded, setExpanded] = React.useState(defaultExpanded)

  return (
    <div className="rounded-lg bg-surface-3 p-4 transition-colors hover:bg-surface-4">
      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-label={`Expand ${feature.title}`}
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          {expanded ? (
            <ChevronDownIcon className="size-4" />
          ) : (
            <ChevronRightIcon className="size-4" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3
              data-testid="feature-card-title"
              className="font-heading text-base font-semibold tracking-[-0.01em] text-foreground"
            >
              {feature.title}
            </h3>
            <span
              className={cn(
                "rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                PRIORITY_CHIP[feature.priority],
              )}
            >
              {feature.priority}
            </span>
          </div>
        </div>

        <StatusDropdown
          currentStatus={feature.status}
          featureId={feature.id}
          projectId={projectId}
        />
      </div>

      {expanded && (
        <div className="mt-3 space-y-3 pl-8">
          {feature.description && (
            <p className="text-sm text-muted-foreground">{feature.description}</p>
          )}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              Acceptance criteria
            </p>
            <AcceptanceCriteriaEditor
              featureId={feature.id}
              projectId={projectId}
              criteria={feature.acceptanceCriteria}
            />
          </div>
        </div>
      )}
    </div>
  )
}
