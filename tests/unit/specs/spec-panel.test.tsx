import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import type { Feature } from "@/features/specs/lib/feature-validation"

const features: Feature[] = [
  {
    id: "01HX0000000000000000000002",
    title: "Second feature p2",
    description: "",
    acceptanceCriteria: ["one"],
    status: "todo",
    priority: "p2",
  },
  {
    id: "01HX0000000000000000000001",
    title: "First feature p0",
    description: "",
    acceptanceCriteria: ["one"],
    status: "todo",
    priority: "p0",
  },
]

vi.mock("convex/react", () => ({
  useQuery: () => ({ features }),
  useMutation: () => vi.fn().mockResolvedValue(undefined),
}))

import { SpecPanel } from "@/features/specs/components/spec-panel"

describe("SpecPanel", () => {
  it("renders an Add feature CTA", () => {
    render(<SpecPanel projectId={"p1" as never} />)
    expect(screen.getByRole("button", { name: /add feature/i })).toBeInTheDocument()
  })

  it("lists features sorted by priority then id", () => {
    render(<SpecPanel projectId={"p1" as never} />)
    const titles = screen.getAllByTestId("feature-card-title").map((n) => n.textContent)
    expect(titles).toEqual(["First feature p0", "Second feature p2"])
  })
})
