/**
 * Tests for StreamingIndicator. Authority: Sub-Plan 04 §3, DESIGN-SYSTEM §7.5.
 */

import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { StreamingIndicator } from "@/features/conversations/components/streaming-indicator"

describe("StreamingIndicator", () => {
  it("renders a 1px shimmer-line bar", () => {
    render(<StreamingIndicator />)
    const root = screen.getByTestId("streaming-indicator")
    expect(root.className).toContain("h-px")
  })

  it("uses surface-3 track and animated primary fill", () => {
    render(<StreamingIndicator />)
    const root = screen.getByTestId("streaming-indicator")
    expect(root.className).toContain("bg-surface-3")
    const fill = screen.getByTestId("streaming-indicator-fill")
    expect(fill.className).toContain("animate-shimmer-line")
    expect(fill.className).toContain("bg-primary/60")
  })

  it("is hidden when active=false", () => {
    render(<StreamingIndicator active={false} />)
    expect(screen.queryByTestId("streaming-indicator")).not.toBeInTheDocument()
  })

  it("has aria attributes for screen readers", () => {
    render(<StreamingIndicator />)
    const root = screen.getByTestId("streaming-indicator")
    expect(root).toHaveAttribute("role", "progressbar")
    expect(root).toHaveAttribute("aria-label")
  })
})
