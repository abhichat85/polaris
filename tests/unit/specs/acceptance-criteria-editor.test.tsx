import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

const reorder = vi.fn().mockResolvedValue(undefined)
const upsert = vi.fn().mockResolvedValue(undefined)

vi.mock("convex/react", () => ({
  useMutation: (ref: unknown) => {
    // Distinguish by reference name in api object — both used in component.
    const s = String(ref)
    if (s.includes("reorderCriteria")) return reorder
    return upsert
  },
  useQuery: () => undefined,
}))

import { AcceptanceCriteriaEditor } from "@/features/specs/components/acceptance-criteria-editor"

describe("AcceptanceCriteriaEditor", () => {
  beforeEach(() => {
    reorder.mockClear()
    upsert.mockClear()
  })

  it("renders each criterion with delete and drag handle", () => {
    render(
      <AcceptanceCriteriaEditor
        featureId="01HX0000000000000000000001"
        projectId={"p1" as never}
        criteria={["A renders", "B redirects"]}
      />,
    )
    expect(screen.getByDisplayValue("A renders")).toBeInTheDocument()
    expect(screen.getByDisplayValue("B redirects")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: /delete/i })).toHaveLength(2)
    expect(screen.getAllByRole("button", { name: /drag/i })).toHaveLength(2)
  })

  it("renders an add button to append a new criterion", () => {
    render(
      <AcceptanceCriteriaEditor
        featureId="01HX0000000000000000000001"
        projectId={"p1" as never}
        criteria={["A renders"]}
      />,
    )
    expect(screen.getByRole("button", { name: /add criterion/i })).toBeInTheDocument()
  })

  it("calls reorderCriteria with the new ordering when reorder is invoked", () => {
    render(
      <AcceptanceCriteriaEditor
        featureId="01HX0000000000000000000001"
        projectId={"p1" as never}
        criteria={["A renders", "B redirects"]}
      />,
    )
    // Component exposes a test hook via data-testid wrapper that can call reorder.
    const list = screen.getByTestId("criteria-list")
    fireEvent(
      list,
      new CustomEvent("test:reorder", { detail: ["B redirects", "A renders"] }),
    )
    expect(reorder).toHaveBeenCalledWith({
      projectId: "p1",
      featureId: "01HX0000000000000000000001",
      nextOrder: ["B redirects", "A renders"],
    })
  })
})
