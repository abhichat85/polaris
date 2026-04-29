"use client"

/**
 * Product Spec panel — the "what and why" lens.
 *
 * Displays the structured Product Spec (features, acceptance criteria,
 * priority) with a source badge showing how the spec was created.
 * Human-editable — this is the product manager's surface.
 */

import * as React from "react"
import { useQuery } from "convex/react"
import { ExternalLinkIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  sortFeatures,
  type Feature,
} from "@/features/specs/lib/feature-validation"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"

import { FeatureCard } from "./feature-card"
import { FeatureForm } from "./feature-form"

type SpecSource = "user" | "praxiom" | "agent" | "upload" | "github"

const SOURCE_LABELS: Record<SpecSource, string> = {
  user: "User-defined",
  praxiom: "Imported from Praxiom",
  agent: "Agent-generated",
  upload: "Imported from document",
  github: "Derived from GitHub",
}

const SOURCE_TONE: Record<SpecSource, string> = {
  user: "bg-surface-3/60 text-muted-foreground",
  praxiom: "bg-primary/10 text-primary",
  agent: "bg-info/10 text-info",
  upload: "bg-warning/10 text-warning",
  github: "bg-surface-3/60 text-muted-foreground",
}

export interface SpecPanelProps {
  projectId: Id<"projects">
}

export function SpecPanel({ projectId }: SpecPanelProps) {
  const spec = useQuery(api.specs.getByProject, { projectId }) as
    | { features: Feature[]; source?: SpecSource; specStatus?: string; praxiomDocumentId?: string }
    | null
    | undefined
  const [formOpen, setFormOpen] = React.useState(false)

  const features = spec?.features ?? []
  const sorted = React.useMemo(() => sortFeatures(features), [features])
  const source = (spec?.source ?? "user") as SpecSource

  return (
    <div className="flex h-full flex-col bg-surface-2">
      {/* Panel header */}
      <div className="flex h-10 items-center justify-between bg-surface-1 px-3 shrink-0 border-b border-surface-3/60">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/50 shrink-0">
            Product Spec
          </span>
          {/* Source badge */}
          {spec && (
            <span
              className={cn(
                "text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0",
                SOURCE_TONE[source],
              )}
            >
              {SOURCE_LABELS[source]}
            </span>
          )}
        </div>
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={() => setFormOpen(true)}
          aria-label="Add feature"
          title="Add feature"
        >
          <PlusIcon className="size-3.5" />
        </Button>
      </div>

      {/* Praxiom sync link */}
      {source === "praxiom" && spec?.praxiomDocumentId && (
        <div className="px-3 py-1.5 shrink-0 border-b border-surface-3/30 bg-primary/5">
          <a
            href={`#praxiom:${spec.praxiomDocumentId}`}
            className="text-[10px] text-primary/80 hover:text-primary flex items-center gap-1"
          >
            <ExternalLinkIcon className="size-2.5" />
            Synced from Praxiom
          </a>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {sorted.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4">
            <div className="size-10 rounded-xl bg-surface-3/40 flex items-center justify-center">
              <span className="size-1.5 rounded-full bg-primary/50" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-muted-foreground/70">
                No spec yet
              </p>
              <p className="text-xs text-muted-foreground/50 leading-relaxed max-w-[16rem]">
                Describe what you&apos;re building to the agent, or click the + button to add features manually.
              </p>
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            {sorted.map((f) => (
              <li key={f.id}>
                <FeatureCard feature={f} projectId={projectId} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <FeatureForm
        projectId={projectId}
        existingFeatures={features}
        open={formOpen}
        onOpenChange={setFormOpen}
      />
    </div>
  )
}
