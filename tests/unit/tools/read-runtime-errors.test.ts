import { describe, it, expect, vi } from "vitest"
import {
  readRuntimeErrors,
  type ReadRuntimeErrorsDeps,
  type RuntimeErrorRow,
} from "@/lib/tools/read-runtime-errors"

function makeDeps(rows: RuntimeErrorRow[]): {
  list: ReturnType<typeof vi.fn>
  markConsumed: ReturnType<typeof vi.fn>
  deps: ReadRuntimeErrorsDeps
} {
  const list = vi.fn(async (_args: { since?: number }) => rows)
  const markConsumed = vi.fn(async (_ids: string[]) => undefined)
  return {
    list,
    markConsumed,
    deps: {
      list: list as unknown as ReadRuntimeErrorsDeps["list"],
      markConsumed: markConsumed as unknown as ReadRuntimeErrorsDeps["markConsumed"],
      now: () => 1_700_000_000_000,
    },
  }
}

describe("readRuntimeErrors", () => {
  it("returns the healthy-state message when no errors", async () => {
    const { deps, markConsumed } = makeDeps([])
    const result = await readRuntimeErrors({}, deps)
    expect(result.count).toBe(0)
    expect(result.formatted).toContain("No runtime errors")
    expect(markConsumed).not.toHaveBeenCalled()
  })

  it("formats one error with kind, message, and age", async () => {
    const { deps } = makeDeps([
      {
        _id: "err1",
        kind: "error",
        message: "Cannot read properties of undefined (reading 'name')",
        stack: "TypeError: Cannot read properties\n  at ProductCard (page.tsx:14:9)",
        url: "src/app/products/page.tsx",
        timestamp: 1_700_000_000_000 - 5_000,
      },
    ])
    const result = await readRuntimeErrors({}, deps)
    expect(result.count).toBe(1)
    expect(result.formatted).toContain("[error]")
    expect(result.formatted).toContain("Cannot read properties")
    expect(result.formatted).toContain("ProductCard")
    expect(result.formatted).toContain("5s ago")
    expect(result.formatted).toContain("src/app/products/page.tsx")
  })

  it("annotates dedupe count", async () => {
    const { deps } = makeDeps([
      {
        _id: "e1",
        kind: "console_error",
        message: "Failed to load image",
        timestamp: 1_700_000_000_000,
        count: 7,
      },
    ])
    const result = await readRuntimeErrors({}, deps)
    expect(result.formatted).toContain("×7")
  })

  it("marks consumed by default and reports ids", async () => {
    const { deps, markConsumed } = makeDeps([
      { _id: "a", kind: "error", message: "x", timestamp: 1 },
      { _id: "b", kind: "error", message: "y", timestamp: 2 },
    ])
    const result = await readRuntimeErrors({}, deps)
    expect(result.consumed).toEqual(["a", "b"])
    expect(markConsumed).toHaveBeenCalledWith(["a", "b"])
  })

  it("skips markConsumed when markConsumed=false", async () => {
    const { deps, markConsumed } = makeDeps([
      { _id: "a", kind: "error", message: "x", timestamp: 1 },
    ])
    const result = await readRuntimeErrors({ markConsumed: false }, deps)
    expect(result.consumed).toEqual([])
    expect(markConsumed).not.toHaveBeenCalled()
  })

  it("forwards `since` cutoff to list (defaults to now-60s)", async () => {
    const { deps, list } = makeDeps([])
    await readRuntimeErrors({}, deps)
    expect(list).toHaveBeenCalledWith({ since: 1_700_000_000_000 - 60_000 })
    await readRuntimeErrors({ since: 999 }, deps)
    expect(list).toHaveBeenCalledWith({ since: 999 })
  })

  it("truncates very long error messages", async () => {
    const longMsg = "x".repeat(1000)
    const { deps } = makeDeps([
      { _id: "x", kind: "error", message: longMsg, timestamp: 1 },
    ])
    const result = await readRuntimeErrors({}, deps)
    // Truncated to 240 + ellipsis
    expect(result.formatted).toContain("…")
    expect(result.formatted.length).toBeLessThan(longMsg.length)
  })

  it("renders react_error_boundary with componentStack", async () => {
    const { deps } = makeDeps([
      {
        _id: "rb1",
        kind: "react_error_boundary",
        message: "Render error",
        componentStack: "in <Cart />\nin <Layout />",
        timestamp: 1_700_000_000_000,
      },
    ])
    const result = await readRuntimeErrors({}, deps)
    expect(result.formatted).toContain("[react_error_boundary]")
    expect(result.formatted).toContain("in <Cart />")
  })
})
