/**
 * Tests for useRecentlyChangedFiles + FileTreePulse. Sub-Plan 04 §5.
 */

import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { renderHook } from "@testing-library/react"
import {
  useRecentlyChangedFiles,
  filterRecentlyChanged,
} from "@/features/conversations/hooks/use-recently-changed-files"
import { FileTreePulse } from "@/features/conversations/components/file-tree-pulse"

describe("filterRecentlyChanged", () => {
  it("keeps files updated within the window", () => {
    const now = 10_000
    const files = [
      { _id: "a", updatedAt: 9_500 }, // within 3s
      { _id: "b", updatedAt: 1_000 }, // outside
      { _id: "c", updatedAt: 8_000 }, // exactly 2s old
    ]
    const recent = filterRecentlyChanged(files, now, 3000)
    expect(recent.map((f) => f._id).sort()).toEqual(["a", "c"])
  })

  it("returns empty when all files are older than the window", () => {
    expect(
      filterRecentlyChanged(
        [{ _id: "a", updatedAt: 1 }],
        1_000_000,
        3000,
      ),
    ).toEqual([])
  })
})

describe("useRecentlyChangedFiles", () => {
  it("returns recent files when allFiles is provided", () => {
    const now = Date.now()
    const allFiles = [
      { _id: "a", updatedAt: now - 500 },
      { _id: "b", updatedAt: now - 30_000 },
    ]
    const { result } = renderHook(() =>
      useRecentlyChangedFiles({ allFiles, now }),
    )
    expect(result.current.map((f) => f._id)).toEqual(["a"])
  })
})

describe("FileTreePulse", () => {
  it("renders nothing when fileId is not in the recent set", () => {
    const { container } = render(
      <FileTreePulse fileId="x" recentFileIds={new Set(["a"])} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it("renders a pulse dot when fileId is recent", () => {
    render(<FileTreePulse fileId="a" recentFileIds={new Set(["a"])} />)
    const pulse = screen.getByTestId("file-tree-pulse")
    expect(pulse.className).toContain("animate-pulse-dot")
    expect(pulse.className).toContain("bg-primary")
  })
})
