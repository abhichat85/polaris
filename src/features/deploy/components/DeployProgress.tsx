/**
 * DeployProgress — drawer UI showing live status of the 9-step deploy pipeline.
 * Authority: sub-plan 07 + DESIGN-SYSTEM.md (surface-depth elevation, semantic
 * state colors, JetBrains Mono for the live URL).
 *
 * The component is split so it can be unit-tested without Convex:
 *   - <DeployProgressView> — pure, takes a `deployment` prop
 *   - <DeployProgress>     — wires a Convex live query and delegates
 */

"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { api } from "@/../convex/_generated/api"
import type { Id } from "@/../convex/_generated/dataModel"
import { PIPELINE_STEPS } from "@/features/deploy/lib/pipeline-steps"
import { cn } from "@/lib/utils"

export type DeploymentStatus =
  | "provisioning_db"
  | "running_migrations"
  | "env_capture"
  | "deploying"
  | "succeeded"
  | "failed"

export interface DeploymentView {
  status: DeploymentStatus
  currentStep: string
  liveUrl?: string
  errorMessage?: string
}

type StepState = "pending" | "active" | "done" | "error"

function stepState(
  step: string,
  deployment: DeploymentView | null | undefined,
): StepState {
  if (!deployment) return "pending"
  const idx = PIPELINE_STEPS.indexOf(step as (typeof PIPELINE_STEPS)[number])
  const currentIdx = PIPELINE_STEPS.indexOf(
    deployment.currentStep as (typeof PIPELINE_STEPS)[number],
  )
  if (deployment.status === "succeeded") return "done"
  if (deployment.status === "failed") {
    if (idx < currentIdx) return "done"
    if (idx === currentIdx) return "error"
    return "pending"
  }
  if (currentIdx === -1) return "pending"
  if (idx < currentIdx) return "done"
  if (idx === currentIdx) return "active"
  return "pending"
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <span
        data-testid="step-icon-done"
        aria-label="completed"
        className="text-[var(--color-success,theme(colors.emerald.500))]"
      >
        ✓
      </span>
    )
  }
  if (state === "active") {
    return (
      <span
        data-testid="step-icon-active"
        aria-label="in progress"
        className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent text-[var(--color-info,theme(colors.sky.500))]"
      />
    )
  }
  if (state === "error") {
    return (
      <span
        data-testid="step-icon-error"
        aria-label="failed"
        className="text-[var(--color-danger,theme(colors.red.500))]"
      >
        ✕
      </span>
    )
  }
  return (
    <span
      data-testid="step-icon-pending"
      aria-label="pending"
      className="inline-block size-3 rounded-full border border-current opacity-40"
    />
  )
}

export interface DeployProgressViewProps {
  deployment: DeploymentView | null | undefined
  className?: string
}

export function DeployProgressView({
  deployment,
  className,
}: DeployProgressViewProps) {
  return (
    <div
      data-testid="deploy-progress"
      className={cn(
        // surface-depth elevation per design system
        "rounded-lg border bg-card p-4 shadow-sm",
        className,
      )}
      role="region"
      aria-label="Deploy progress"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight">Deploying</h3>
        {deployment?.status && (
          <span
            data-testid="deploy-status"
            className="text-xs uppercase tracking-wider text-muted-foreground"
          >
            {deployment.status.replace(/_/g, " ")}
          </span>
        )}
      </div>

      <ol className="space-y-2">
        {PIPELINE_STEPS.map((step) => {
          const state = stepState(step, deployment)
          return (
            <li
              key={step}
              data-testid={`step-${step}`}
              data-state={state}
              className={cn(
                "flex items-center gap-3 text-sm",
                state === "done" && "text-foreground/70",
                state === "active" && "font-medium text-foreground",
                state === "error" && "text-[var(--color-danger,theme(colors.red.600))]",
                state === "pending" && "text-muted-foreground",
              )}
            >
              <StepIcon state={state} />
              <span>{step}</span>
            </li>
          )
        })}
      </ol>

      {deployment?.status === "failed" && deployment.errorMessage && (
        <p
          data-testid="deploy-error"
          className="mt-3 rounded-md border border-[var(--color-danger,theme(colors.red.500))] bg-[var(--color-danger-bg,theme(colors.red.50))] p-2 text-xs text-[var(--color-danger,theme(colors.red.700))]"
          role="alert"
        >
          {deployment.errorMessage}
        </p>
      )}

      {deployment?.status === "succeeded" && deployment.liveUrl && (
        <a
          data-testid="deploy-live-url"
          href={deployment.liveUrl}
          target="_blank"
          rel="noopener noreferrer"
          // JetBrains Mono per design system for the live URL
          style={{ fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)" }}
          className="mt-3 block truncate rounded-md bg-muted px-2 py-1.5 text-xs text-foreground hover:underline"
        >
          {deployment.liveUrl}
        </a>
      )}
    </div>
  )
}

export interface DeployProgressProps {
  deploymentId: Id<"deployments">
  className?: string
}

export function DeployProgress({
  deploymentId,
  className,
}: DeployProgressProps) {
  const deployment = useQuery(api.deployments.getById, { deploymentId })
  return (
    <DeployProgressView
      deployment={deployment ?? null}
      className={className}
    />
  )
}
