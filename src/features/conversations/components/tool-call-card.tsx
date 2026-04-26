/**
 * ToolCallCard — renders a single agent tool invocation.
 *
 * Authority: Sub-Plan 04 §1, DESIGN-SYSTEM §7.4 (badge/chip palette).
 *
 * Surface: bg-surface-3 with rounded-lg per §7.2. Status chips use the
 * documented opacity-tinted semantic colors. run_command output is rendered
 * in font-mono per §3.1.
 */

"use client"

import {
  FileText,
  FilePlus2,
  FileMinus2,
  Pencil,
  FolderTree,
  Save,
  Terminal,
  Wrench,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

export type ToolStatus = "running" | "completed" | "error"

export interface ToolCallCardProps {
  toolCall: {
    id: string
    name: string
    args: Record<string, unknown> | unknown
    status: ToolStatus
    result?: unknown
  }
}

const TOOL_META: Record<string, { icon: LucideIcon; verb: string }> = {
  read_file: { icon: FileText, verb: "Read" },
  write_file: { icon: Save, verb: "Write" },
  edit_file: { icon: Pencil, verb: "Edit" },
  create_file: { icon: FilePlus2, verb: "Create" },
  delete_file: { icon: FileMinus2, verb: "Delete" },
  list_files: { icon: FolderTree, verb: "List" },
  run_command: { icon: Terminal, verb: "Run" },
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

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const meta = TOOL_META[toolCall.name] ?? { icon: Wrench, verb: "Tool" }
  const Icon = meta.icon
  const chip = STATUS_CHIP[toolCall.status]

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

  return (
    <div
      className={cn(
        "rounded-lg bg-surface-3 px-3 py-2.5",
        "flex flex-col gap-2",
        "animate-chat-enter",
      )}
      data-testid="tool-call-card"
    >
      <div className="flex items-center gap-2">
        <Icon
          className="w-3.5 h-3.5 text-muted-foreground shrink-0"
          data-testid={`tool-icon-${toolCall.name}`}
          aria-hidden="true"
        />
        <span className="text-xs font-medium text-foreground">
          {meta.verb}
        </span>
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
