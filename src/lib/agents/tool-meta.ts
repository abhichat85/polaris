/**
 * Tool metadata registry — maps tool names to display metadata.
 *
 * Previously inlined in tool-call-card.tsx as TOOL_META. Extracted here
 * so multiple UI components (tool-call-card, agent-status-bar, telemetry
 * dashboard) can share the same metadata without duplication.
 */

export type ToolCategory = "read" | "write" | "execute" | "search" | "system"
export type ToolRisk = "safe" | "mutating" | "destructive"

export interface ToolMeta {
  /** Lucide icon name (e.g. "FileText", "Pencil"). */
  iconName: string
  /** Short verb for display (e.g. "Read", "Edit"). */
  verb: string
  /** Category for grouping. */
  category: ToolCategory
  /** Risk level for HITL gating. */
  risk: ToolRisk
  /** Human-readable description. */
  description: string
}

const TOOL_REGISTRY: Record<string, ToolMeta> = {
  read_file: {
    iconName: "FileText",
    verb: "Read",
    category: "read",
    risk: "safe",
    description: "Read file contents",
  },
  write_file: {
    iconName: "Save",
    verb: "Write",
    category: "write",
    risk: "mutating",
    description: "Overwrite file contents",
  },
  edit_file: {
    iconName: "Pencil",
    verb: "Edit",
    category: "write",
    risk: "mutating",
    description: "Surgical text replacement",
  },
  multi_edit: {
    iconName: "Pencil",
    verb: "Multi-edit",
    category: "write",
    risk: "mutating",
    description: "Multiple surgical edits in one file",
  },
  create_file: {
    iconName: "FilePlus2",
    verb: "Create",
    category: "write",
    risk: "mutating",
    description: "Create a new file",
  },
  delete_file: {
    iconName: "FileMinus2",
    verb: "Delete",
    category: "write",
    risk: "destructive",
    description: "Delete a file",
  },
  list_files: {
    iconName: "FolderTree",
    verb: "List",
    category: "read",
    risk: "safe",
    description: "List directory contents",
  },
  run_command: {
    iconName: "Terminal",
    verb: "Run",
    category: "execute",
    risk: "mutating",
    description: "Execute a shell command",
  },
  search_code: {
    iconName: "Search",
    verb: "Search",
    category: "search",
    risk: "safe",
    description: "Search code with regex",
  },
  read_runtime_errors: {
    iconName: "AlertTriangle",
    verb: "Errors",
    category: "read",
    risk: "safe",
    description: "Read runtime error log",
  },
  set_feature_status: {
    iconName: "Flag",
    verb: "Status",
    category: "system",
    risk: "safe",
    description: "Update feature progress",
  },
}

const DEFAULT_META: ToolMeta = {
  iconName: "Wrench",
  verb: "Tool",
  category: "system",
  risk: "safe",
  description: "Unknown tool",
}

export function getToolMeta(toolName: string): ToolMeta {
  return TOOL_REGISTRY[toolName] ?? DEFAULT_META
}

export function isDestructiveTool(toolName: string): boolean {
  return getToolMeta(toolName).risk === "destructive"
}

export function isMutatingTool(toolName: string): boolean {
  const risk = getToolMeta(toolName).risk
  return risk === "mutating" || risk === "destructive"
}

export function getToolsByCategory(category: ToolCategory): string[] {
  return Object.entries(TOOL_REGISTRY)
    .filter(([, meta]) => meta.category === category)
    .map(([name]) => name)
}
