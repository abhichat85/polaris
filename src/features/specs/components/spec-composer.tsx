"use client"

/**
 * Spec Composer — the starting-state landing view.
 *
 * When a project has no spec (lifecycleState = "empty"), this replaces
 * the editor center pane. It presents the four entry points:
 *   1. Describe in chat (agent structures into spec)
 *   2. Upload a spec document (PDF / Markdown / DOCX)
 *   3. Import from Praxiom
 *   4. Import from GitHub
 *
 * As the agent generates spec features, they stream in on the left side.
 * The user can edit features inline while the agent is working.
 *
 * Once at least one feature exists, a "Looks good — Generate Build Plan"
 * CTA appears at the bottom.
 *
 * Praxiom design: surface-0 canvas, muted guidance text, primary CTA.
 */

import Image from "next/image"
import { useQuery } from "convex/react"
import {
  FileUpIcon,
  GithubIcon,
  SparklesIcon,
  ArrowRightIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"

import { FeatureCard } from "./feature-card"
import { sortFeatures, type Feature } from "../lib/feature-validation"

interface SpecComposerProps {
  projectId: Id<"projects">
  /** Called when the user clicks "Generate Build Plan" to transition lifecycle. */
  onConfirmSpec?: () => void
}

export function SpecComposer({ projectId, onConfirmSpec }: SpecComposerProps) {
  const spec = useQuery(api.specs.getByProject, { projectId }) as
    | { features: Feature[]; specStatus?: string; source?: string }
    | null
    | undefined

  const features = spec?.features ?? []
  const sorted = sortFeatures(features)
  const hasFeatures = sorted.length > 0
  const isDrafting = spec?.specStatus === "drafting"

  return (
    <div className="h-full flex flex-col bg-surface-0 overflow-hidden">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {!hasFeatures ? (
          /* ─── Empty state: entry points ─── */
          <div className="min-h-full flex flex-col items-center justify-center gap-8 px-8 py-12">
            {/* Brand mark */}
            <div className="flex flex-col items-center gap-3">
              <Image
                src="/logo-alt.svg"
                alt="Polaris"
                width={36}
                height={36}
                className="opacity-30"
              />
              <h1 className="font-heading text-lg font-semibold tracking-[-0.02em] text-foreground/80">
                What are you building?
              </h1>
              <p className="text-sm text-muted-foreground/60 text-center max-w-sm leading-relaxed">
                Start by describing your project to the agent, or import an
                existing spec. Polaris will structure it into a Product Spec
                and generate a Build Plan.
              </p>
            </div>

            {/* Entry point cards */}
            <div className="w-full max-w-md flex flex-col gap-2">
              <EntryPointCard
                icon={SparklesIcon}
                title="Describe to the agent"
                description="Type in the chat on the right — the agent will structure your description into a Product Spec"
                primary
              />
              <EntryPointCard
                icon={FileUpIcon}
                title="Upload a spec document"
                description="PDF, Markdown, or DOCX — the agent extracts features and acceptance criteria"
              />
              <EntryPointCard
                icon={PraxiomIcon}
                title="Import from Praxiom"
                description="Pull a structured Feature Spec from your Praxiom workspace"
              />
              <EntryPointCard
                icon={GithubIcon}
                title="Import from GitHub"
                description="The agent reads your codebase and reverse-engineers a Product Spec"
              />
            </div>
          </div>
        ) : (
          /* ─── Features exist: show the live spec ─── */
          <div className="max-w-lg mx-auto px-6 py-6 space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-sm font-semibold tracking-[-0.02em] text-foreground">
                Product Spec
              </h2>
              {isDrafting && (
                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-warning/10 text-warning animate-pulse">
                  Drafting…
                </span>
              )}
              <span className="text-[10px] text-muted-foreground/50 ml-auto">
                {sorted.length} {sorted.length === 1 ? "feature" : "features"}
              </span>
            </div>
            <ul className="space-y-2">
              {sorted.map((f) => (
                <li key={f.id}>
                  <FeatureCard feature={f} projectId={projectId} defaultExpanded />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Bottom CTA — visible once features exist */}
      {hasFeatures && (
        <div className="shrink-0 border-t border-surface-3/40 bg-surface-1 px-6 py-3">
          <div className="max-w-lg mx-auto flex items-center justify-between">
            <p className="text-xs text-muted-foreground/60">
              {sorted.length} {sorted.length === 1 ? "feature" : "features"} defined
            </p>
            <Button
              size="sm"
              onClick={onConfirmSpec}
              className="gap-1.5"
            >
              Looks good — Generate Build Plan
              <ArrowRightIcon className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal sub-components
// ─────────────────────────────────────────────────────────────────────────────

function EntryPointCard({
  icon: Icon,
  title,
  description,
  primary,
  onClick,
}: {
  icon: React.ElementType
  title: string
  description: string
  primary?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-3 px-4 py-3 rounded-lg text-left transition-colors",
        primary
          ? "bg-primary/5 border border-primary/20 hover:bg-primary/10"
          : "bg-surface-2/60 border border-surface-3/30 hover:bg-surface-2",
      )}
    >
      <div
        className={cn(
          "size-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
          primary ? "bg-primary/10" : "bg-surface-3/60",
        )}
      >
        <Icon
          className={cn(
            "size-4",
            primary ? "text-primary" : "text-muted-foreground/60",
          )}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-medium",
            primary ? "text-foreground" : "text-foreground/80",
          )}
        >
          {title}
        </p>
        <p className="text-xs text-muted-foreground/50 leading-relaxed mt-0.5">
          {description}
        </p>
      </div>
    </button>
  )
}

/** Inline Praxiom icon — simple geometric mark (no external dependency). */
function PraxiomIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path
        d="M8 1L14.5 4.75V12.25L8 16L1.5 12.25V4.75L8 1Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8.5" r="2" fill="currentColor" opacity="0.5" />
    </svg>
  )
}
