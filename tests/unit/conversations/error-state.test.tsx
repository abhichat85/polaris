/**
 * Tests for ErrorState. Authority: Sub-Plan 04 §4, CONSTITUTION §2.6, Article XII.
 *
 * Each of the 8 error categories must:
 *   - render a recognisable label
 *   - render a concrete recovery suggestion
 *   - use destructive surface tint per DESIGN-SYSTEM §7.4
 */

import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import {
  ErrorState,
  type ErrorCategory,
} from "@/features/conversations/components/error-state"

const categories: ErrorCategory[] = [
  "agent_error",
  "sandbox_dead",
  "quota_exceeded",
  "network_error",
  "model_error",
  "tool_error",
  "validation_error",
  "unknown",
]

describe("ErrorState", () => {
  for (const category of categories) {
    it(`renders the ${category} category with recovery copy`, () => {
      render(<ErrorState category={category} message="boom" />)
      const root = screen.getByTestId("error-state")
      expect(root).toHaveAttribute("data-category", category)
      // Recovery copy must be non-empty per CONSTITUTION §2.6
      expect(screen.getByTestId("error-recovery").textContent ?? "").not.toBe(
        "",
      )
    })
  }

  it("renders the underlying error message", () => {
    render(<ErrorState category="network_error" message="ECONNRESET" />)
    expect(screen.getByText(/ECONNRESET/)).toBeInTheDocument()
  })

  it("uses destructive surface tint", () => {
    render(<ErrorState category="agent_error" message="x" />)
    const root = screen.getByTestId("error-state")
    expect(root.className).toMatch(/bg-destructive\/10/)
  })

  it("has role=alert for accessibility", () => {
    render(<ErrorState category="unknown" message="x" />)
    expect(screen.getByTestId("error-state")).toHaveAttribute("role", "alert")
  })

  it("invokes onRetry when retry button is clicked", async () => {
    const { default: userEvent } = await import("@testing-library/user-event")
    const user = userEvent.setup()
    let called = 0
    render(
      <ErrorState
        category="network_error"
        message="x"
        onRetry={() => {
          called += 1
        }}
      />,
    )
    await user.click(screen.getByRole("button", { name: /retry/i }))
    expect(called).toBe(1)
  })

  it("hides retry button when onRetry is not provided", () => {
    render(<ErrorState category="quota_exceeded" message="x" />)
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument()
  })
})
