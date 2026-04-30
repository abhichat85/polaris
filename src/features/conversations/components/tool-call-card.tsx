/**
 * ToolCallCard — renders a single agent tool invocation.
 *
 * Authority: Sub-Plan 04 §1, DESIGN-SYSTEM §7.4 (badge/chip palette).
 *
 * Surface: bg-surface-3 with rounded-lg per §7.2. Status chips use the
 * documented opacity-tinted semantic colors. run_command output is rendered
 * in font-mono per §3.1.
 *
 * Phase 4 enrichment: pulls per-tool metadata (icon name, verb, category,
 * risk) from `@/lib/agents/tool-meta`. Adds a category-tinted left border
 * accent, an active-vs-done verb label ("Reading…" vs "Read"), and a small
 * red destructive flag dot when the tool can mutate or remove data
 * irreversibly.
 */

"use client"

import * as LucideIcons from "lucide-react"
import { Wrench, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  ToolOutputStream,
  type ToolStreamLine,
} from "@/components/ai-elements/tool-output-stream"
import {
  getToolMeta,
  isDestructiveTool,
  type ToolCategory,
} from "@/lib/agents/tool-meta"

export type ToolStatus = "running" | "completed" | "error"

export interface ToolCallCardProps {
  toolCall: {
    id: string
    name: string
    args: Record<string, unknown> | unknown
    status: ToolStatus
    result?: unknown
    /** D-018 — live stdout/stderr emitted by `run_command`. */
    stream?: ToolStreamLine[]
  }
}

/**
 * Left-border accent color for each tool category. Pulls from semantic
 * tokens so dark/light themes both look right.
 */
const CATEGORY_BORDER: Record<ToolCategory, string> = {
  read: "border-l-info-foreground/60",
  write: "border-l-warning/60",
  execute: "border-l-primary/60",
  search: "border-l-muted-foreground/60",
  system: "border-l-border",
}

const STATUS_CHIP: Record<ToolStatus, { label: string; className: string }> = {
  running: {
    label: "Running",
    className: "bg-surface-4 text-muted-foreground",
  },
  completed: {
    label: "Completed",
    className: "bg-success/15 text-success",
  },
  error: {
    label: "Error",
    className: "bg-destructive/10 text-destructive",
  },
}

function getArg(args: unknown, key: string): string | undefined {
  if (args && typeof args === "object" && key in (args as Record<string, unknown>)) {
    const v = (args as Record<string, unknown>)[key]
    return typeof v === "string" ? v : undefined
  }
  return undefined
}

/**
 * Resolves a Lucide icon name (e.g. "FileText") to its component, falling
 * back to a generic Wrench icon if the name doesn't match.
 */
function resolveIcon(name: string): LucideIcon {
  const lookup = (LucideIcons as unknown as Record<string, unknown>)[name]
  if (typeof lookup === "function" || typeof lookup === "object") {
    return lookup as LucideIcon
  }
  return Wrench
}

/**
 * Builds the active label shown while a tool is running. We turn the verb
 * into a present-progressive form for the small set we know about; for
 * others we just append an ellipsis.
 */
function activeLabelFor(verb: string): string {
  const map: Record<string, string> = {
    Read: "Reading",
    Write: "Writing",
    Edit: "Editing",
    "Multi-edit": "Editing",
    Create: "Creating",
    Delete: "Deleting",
    List: "Listing",
    Run: "Running",
    Search: "Searching",
    Errors: "Reading errors",
    Status: "Updating status",
    Tool: "Running",
  }
  return `${map[verb] ?? verb}…`
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const meta = getToolMeta(toolCall.name)
  const Icon = resolveIcon(meta.iconName)
  const chip = STATUS_CHIP[toolCall.status]
  const destructive = isDestructiveTool(toolCall.name)
  const borderClass = CATEGORY_BORDER[meta.category]

  const path = getArg(toolCall.args, "path")
  const command = getArg(toolCall.args, "command")
  const isRunCommand = toolCall.name === "run_command"

  const result = toolCall.result as
    | { ok: true; data: unknown }
    | { ok: false; error: string; errorCode?: string }
    | undefined

  let stdout: string | undefined
  let stderr: string | undefined
  if (isRunCommand && result && "ok" in result && result.ok) {
    const data = result.data as
      | { stdout?: string; stderr?: string; exitCode?: number }
      | undefined
    stdout = data?.stdout
    stderr = data?.stderr
  }

  const errorMessage =
    result && "ok" in result && !result.ok ? result.error : undefined

  const verbLabel =
    toolCall.status === "running" ? activeLabelFor(meta.verb) : meta.verb

  return (
    <div
      className={cn(
        "rounded-lg bg-surface-3 px-3 py-2.5",
        "border-l-2",
        borderClass,
        "flex flex-col gap-2",
        "animate-chat-enter",
      )}
      data-testid="tool-call-card"
      data-tool-category={meta.category}
      data-tool-risk={meta.risk}
    >
      <div className="flex items-center gap-2">
        <Icon
          className="w-3.5 h-3.5 text-muted-foreground shrink-0"
          data-testid={`tool-icon-${toolCall.name}`}
          aria-hidden="true"
        />
        <span className="text-xs font-medium text-foreground">
          {verbLabel}
        </span>
        {destructive && (
          <span
            data-testid="tool-destructive-flag"
            title="Destructive tool"
            aria-label="Destructive tool"
            className="inline-block w-1.5 h-1.5 rounded-full bg-destructive shrink-0"
          />
        )}
        <span className="text-[11px] font-mono text-muted-foreground/70 truncate">
          {toolCall.name}
        </span>
        <span
          data-testid="tool-call-status"
          className={cn(
            "ml-auto text-[10px] px-2 py-0.5 rounded-md font-semibold uppercase tracking-wide",
            chip.className,
          )}
        >
          {chip.label}
        </span>
      </div>

      {path && (
        <div className="text-xs font-mono text-muted-foreground truncate">
          {path}
        </div>
      )}

      {isRunCommand && command && (
        <div className="text-xs font-mono text-muted-foreground truncate">
          $ {command}
        </div>
      )}

      {/* D-018 — live streaming output while the command is running. */}
      {isRunCommand && toolCall.status === "running" && (
        <ToolOutputStream lines={toolCall.stream} />
      )}

      {stdout !== undefined && stdout !== "" && (
        <pre
          data-testid="run-command-stdout"
          className="text-[11px] font-mono text-foreground bg-surface-4 rounded-md p-2 max-h-40 overflow-auto whitespace-pre-wrap"
        >
          {stdout}
        </pre>
      )}

      {stderr !== undefined && stderr !== "" && (
        <pre
          data-testid="run-command-stderr"
          className="text-[11px] font-mono text-warning bg-surface-4 rounded-md p-2 max-h-40 overflow-auto whitespace-pre-wrap"
        >
          {stderr}
        </pre>
      )}

      {errorMessage && (
        <div className="text-xs text-destructive">{errorMessage}</div>
      )}
    </div>
  )
}
