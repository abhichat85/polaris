import { describe, it, expect } from "vitest"
import { TOOL_ERROR_CODES, type ToolErrorCode, type ToolOutput, type ToolExecutionContext } from "@/lib/tools/types"

describe("tool types", () => {
  it("TOOL_ERROR_CODES contains all 11 Constitutional codes", () => {
    expect(TOOL_ERROR_CODES).toEqual([
      "PATH_LOCKED",
      "PATH_NOT_FOUND",
      "PATH_ALREADY_EXISTS",
      "PATH_NOT_WRITABLE",
      "EDIT_NOT_FOUND",
      "EDIT_NOT_UNIQUE",
      "SANDBOX_DEAD",
      "COMMAND_TIMEOUT",
      "COMMAND_NONZERO_EXIT",
      "COMMAND_FORBIDDEN",
      "INTERNAL_ERROR",
    ])
  })

  it("ToolErrorCode is the union of TOOL_ERROR_CODES values", () => {
    // Compile-time check: any value from the runtime tuple is a valid ToolErrorCode.
    const code: ToolErrorCode = TOOL_ERROR_CODES[0]
    expect(typeof code).toBe("string")
  })

  it("ToolOutput.ok=true carries data", () => {
    const ok: ToolOutput = { ok: true, data: { x: 1 } }
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.data).toEqual({ x: 1 })
    }
  })

  it("ToolOutput.ok=false carries error and errorCode", () => {
    const err: ToolOutput = { ok: false, error: "boom", errorCode: "INTERNAL_ERROR" }
    expect(err.ok).toBe(false)
    if (!err.ok) {
      expect(err.error).toBe("boom")
      expect(err.errorCode).toBe("INTERNAL_ERROR")
    }
  })

  it("ToolExecutionContext: sandboxId is nullable", () => {
    const ctx: ToolExecutionContext = { projectId: "p1", sandboxId: null, userId: "u1" }
    expect(ctx.sandboxId).toBeNull()
    const withSandbox: ToolExecutionContext = { projectId: "p1", sandboxId: "sb_1", userId: "u1" }
    expect(withSandbox.sandboxId).toBe("sb_1")
  })
})
