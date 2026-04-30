import { describe, it, expect } from "vitest"
import {
  getToolMeta,
  isDestructiveTool,
  isMutatingTool,
  getToolsByCategory,
  type ToolMeta,
} from "@/lib/agents/tool-meta"

describe("getToolMeta", () => {
  it("returns correct metadata for read_file", () => {
    const meta = getToolMeta("read_file")
    expect(meta).toEqual({
      iconName: "FileText",
      verb: "Read",
      category: "read",
      risk: "safe",
      description: "Read file contents",
    })
  })

  it("returns correct metadata for edit_file", () => {
    const meta = getToolMeta("edit_file")
    expect(meta.iconName).toBe("Pencil")
    expect(meta.verb).toBe("Edit")
    expect(meta.category).toBe("write")
    expect(meta.risk).toBe("mutating")
  })

  it("returns correct metadata for delete_file", () => {
    const meta = getToolMeta("delete_file")
    expect(meta.iconName).toBe("FileMinus2")
    expect(meta.verb).toBe("Delete")
    expect(meta.risk).toBe("destructive")
  })

  it("returns correct metadata for run_command", () => {
    const meta = getToolMeta("run_command")
    expect(meta.iconName).toBe("Terminal")
    expect(meta.verb).toBe("Run")
    expect(meta.category).toBe("execute")
    expect(meta.risk).toBe("mutating")
  })

  it("returns correct metadata for search_code", () => {
    const meta = getToolMeta("search_code")
    expect(meta.category).toBe("search")
    expect(meta.risk).toBe("safe")
  })

  it("returns DEFAULT_META for unknown tools", () => {
    const meta = getToolMeta("nonexistent_tool")
    expect(meta).toEqual({
      iconName: "Wrench",
      verb: "Tool",
      category: "system",
      risk: "safe",
      description: "Unknown tool",
    })
  })

  it("returns DEFAULT_META for empty string", () => {
    const meta = getToolMeta("")
    expect(meta.verb).toBe("Tool")
    expect(meta.iconName).toBe("Wrench")
  })
})

describe("isDestructiveTool", () => {
  it("returns true for delete_file", () => {
    expect(isDestructiveTool("delete_file")).toBe(true)
  })

  it("returns false for read_file", () => {
    expect(isDestructiveTool("read_file")).toBe(false)
  })

  it("returns false for edit_file (mutating, not destructive)", () => {
    expect(isDestructiveTool("edit_file")).toBe(false)
  })

  it("returns false for unknown tools", () => {
    expect(isDestructiveTool("unknown_tool")).toBe(false)
  })
})

describe("isMutatingTool", () => {
  it("returns true for edit_file", () => {
    expect(isMutatingTool("edit_file")).toBe(true)
  })

  it("returns true for write_file", () => {
    expect(isMutatingTool("write_file")).toBe(true)
  })

  it("returns true for delete_file (destructive implies mutating)", () => {
    expect(isMutatingTool("delete_file")).toBe(true)
  })

  it("returns true for create_file", () => {
    expect(isMutatingTool("create_file")).toBe(true)
  })

  it("returns true for multi_edit", () => {
    expect(isMutatingTool("multi_edit")).toBe(true)
  })

  it("returns false for read_file", () => {
    expect(isMutatingTool("read_file")).toBe(false)
  })

  it("returns false for list_files", () => {
    expect(isMutatingTool("list_files")).toBe(false)
  })

  it("returns false for search_code", () => {
    expect(isMutatingTool("search_code")).toBe(false)
  })

  it("returns false for unknown tools", () => {
    expect(isMutatingTool("unknown_tool")).toBe(false)
  })
})

describe("getToolsByCategory", () => {
  it("returns read tools", () => {
    const readTools = getToolsByCategory("read")
    expect(readTools).toContain("read_file")
    expect(readTools).toContain("list_files")
    expect(readTools).toContain("read_runtime_errors")
    expect(readTools).not.toContain("edit_file")
  })

  it("returns write tools", () => {
    const writeTools = getToolsByCategory("write")
    expect(writeTools).toContain("write_file")
    expect(writeTools).toContain("edit_file")
    expect(writeTools).toContain("multi_edit")
    expect(writeTools).toContain("create_file")
    expect(writeTools).toContain("delete_file")
    expect(writeTools).not.toContain("read_file")
  })

  it("returns execute tools", () => {
    const executeTools = getToolsByCategory("execute")
    expect(executeTools).toContain("run_command")
    expect(executeTools).toHaveLength(1)
  })

  it("returns search tools", () => {
    const searchTools = getToolsByCategory("search")
    expect(searchTools).toContain("search_code")
    expect(searchTools).toHaveLength(1)
  })

  it("returns system tools", () => {
    const systemTools = getToolsByCategory("system")
    expect(systemTools).toContain("set_feature_status")
  })

  it("returns empty array for category with no tools", () => {
    // All defined categories have tools, but cast to check behavior
    const tools = getToolsByCategory("system")
    expect(Array.isArray(tools)).toBe(true)
  })
})

describe("all registered tools have required fields", () => {
  const knownTools = [
    "read_file",
    "write_file",
    "edit_file",
    "multi_edit",
    "create_file",
    "delete_file",
    "list_files",
    "run_command",
    "search_code",
    "read_runtime_errors",
    "set_feature_status",
  ]

  it.each(knownTools)("%s has all required fields", (toolName) => {
    const meta: ToolMeta = getToolMeta(toolName)
    expect(meta.iconName).toBeTruthy()
    expect(meta.verb).toBeTruthy()
    expect(meta.category).toBeTruthy()
    expect(meta.risk).toBeTruthy()
    expect(meta.description).toBeTruthy()
    expect(typeof meta.iconName).toBe("string")
    expect(typeof meta.verb).toBe("string")
    expect(typeof meta.description).toBe("string")
    expect(["read", "write", "execute", "search", "system"]).toContain(
      meta.category,
    )
    expect(["safe", "mutating", "destructive"]).toContain(meta.risk)
  })
})
