"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { CheckCircle2, XCircle, ChevronDown, ChevronRight } from "lucide-react"

export interface VerifierReasoningPaneProps {
  /** Which verification stage. */
  stage: "tsc" | "eslint" | "build"
  /** Whether verification passed. */
  passed: boolean
  /** Error output (only present if !passed). */
  errors?: string
  /** Auto-fix attempt number (e.g. "1/3"). */
  fixAttempt?: string
  className?: string
}

const STAGE_LABELS: Record<string, string> = {
  tsc: "TypeScript",
  eslint: "ESLint",
  build: "Build",
}

export function VerifierReasoningPane({
  stage,
  passed,
  errors,
  fixAttempt,
  className,
}: VerifierReasoningPaneProps) {
  const [expanded, setExpanded] = useState(!passed) // auto-expand on failure

  const label = STAGE_LABELS[stage] ?? stage

  return (
    <div
      data-testid="verifier-reasoning-pane"
      className={cn(
        "rounded-lg border overflow-hidden",
        passed
          ? "border-success/30 bg-success/5"
          : "border-destructive/30 bg-destructive/5",
        className,
      )}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors",
          passed
            ? "text-success hover:bg-success/10"
            : "text-destructive hover:bg-destructive/10",
        )}
        type="button"
      >
        {passed ? (
          <CheckCircle2 className="w-3.5 h-3.5" />
        ) : (
          <XCircle className="w-3.5 h-3.5" />
        )}
        <span className="font-medium">{label}</span>
        <span className="text-[10px] opacity-70">
          {passed ? "passed" : "failed"}
        </span>
        {fixAttempt && (
          <span className="text-[10px] bg-surface-3 px-1.5 py-0.5 rounded text-muted-foreground">
            fix {fixAttempt}
          </span>
        )}
        <span className="ml-auto">
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </span>
      </button>

      {expanded && errors && (
        <pre
          data-testid="verifier-errors"
          className="px-3 pb-3 text-[11px] font-mono text-foreground whitespace-pre-wrap max-h-64 overflow-y-auto"
        >
          {errors}
        </pre>
      )}
    </div>
  )
}
