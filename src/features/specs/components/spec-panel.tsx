"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  sortFeatures,
  type Feature,
} from "@/features/specs/lib/feature-validation"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"

import { FeatureCard } from "./feature-card"
import { FeatureForm } from "./feature-form"

export interface SpecPanelProps {
  projectId: Id<"projects">
}

export function SpecPanel({ projectId }: SpecPanelProps) {
  const spec = useQuery(api.specs.getByProject, { projectId }) as
    | { features: Feature[] }
    | null
    | undefined
  const [formOpen, setFormOpen] = React.useState(false)

  const features = spec?.features ?? []
  const sorted = React.useMemo(() => sortFeatures(features), [features])

  return (
    <div className="flex h-full flex-col bg-surface-2">
      <div className="flex h-14 items-center justify-between bg-surface-1 px-4">
        <h2 className="font-heading text-sm font-semibold tracking-[-0.01em] text-foreground">
          Specification
        </h2>
        <Button
          size="sm"
          onClick={() => setFormOpen(true)}
          aria-label="Add feature"
        >
          <PlusIcon className="size-3.5" />
          Add feature
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {sorted.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">
              No features yet. Click <span className="text-primary">Add feature</span> to start.
            </p>
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
