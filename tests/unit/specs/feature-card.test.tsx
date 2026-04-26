import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import type { Feature } from "@/features/specs/lib/feature-validation"
import { FeatureCard } from "@/features/specs/components/feature-card"

const baseFeature: Feature = {
  id: "01HX0000000000000000000001",
  title: "User can sign in",
  description: "Email + password login.",
  acceptanceCriteria: ["Login form renders", "Successful login redirects"],
  status: "todo",
  priority: "p0",
}

describe("FeatureCard", () => {
  it("renders the title and priority chip", () => {
    render(<FeatureCard feature={baseFeature} projectId={"p1" as never} />)
    expect(screen.getByText("User can sign in")).toBeInTheDocument()
    expect(screen.getByText(/p0/i)).toBeInTheDocument()
  })

  it("hides the description and criteria when collapsed", () => {
    render(<FeatureCard feature={baseFeature} projectId={"p1" as never} />)
    expect(screen.queryByText("Email + password login.")).not.toBeInTheDocument()
    expect(screen.queryByText("Login form renders")).not.toBeInTheDocument()
  })

  it("shows description and criteria when expanded", () => {
    render(<FeatureCard feature={baseFeature} projectId={"p1" as never} />)
    fireEvent.click(screen.getByRole("button", { name: /expand|user can sign in/i }))
    expect(screen.getByText("Email + password login.")).toBeInTheDocument()
    expect(screen.getByText("Login form renders")).toBeInTheDocument()
    expect(screen.getByText("Successful login redirects")).toBeInTheDocument()
  })

  it.each([
    ["p0", "destructive"],
    ["p1", "warning"],
    ["p2", "success"],
  ] as const)("renders priority %s with the %s color token", (priority, token) => {
    render(
      <FeatureCard
        feature={{ ...baseFeature, priority }}
        projectId={"p1" as never}
      />,
    )
    const chip = screen.getByText(new RegExp(priority, "i"))
    expect(chip.className).toContain(token)
  })
})
