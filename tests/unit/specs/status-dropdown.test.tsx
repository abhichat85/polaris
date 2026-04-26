import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

const mutate = vi.fn().mockResolvedValue(undefined)

vi.mock("convex/react", () => ({
  useMutation: () => mutate,
  useQuery: () => undefined,
}))

import { StatusDropdown } from "@/features/specs/components/status-dropdown"

describe("StatusDropdown", () => {
  beforeEach(() => mutate.mockClear())

  it("shows only valid transitions for current status", () => {
    render(
      <StatusDropdown
        currentStatus="todo"
        featureId="01HX0000000000000000000001"
        projectId={"p1" as never}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /todo/i }))
    // todo -> only in_progress allowed
    expect(screen.getByRole("menuitem", { name: /in progress/i })).toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: /^done$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: /blocked/i })).not.toBeInTheDocument()
  })

  it("from in_progress allows todo, done and blocked", () => {
    render(
      <StatusDropdown
        currentStatus="in_progress"
        featureId="01HX0000000000000000000001"
        projectId={"p1" as never}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /in progress/i }))
    expect(screen.getByRole("menuitem", { name: /^todo$/i })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: /^done$/i })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: /blocked/i })).toBeInTheDocument()
  })

  it("calls updateFeatureStatus mutation when a status is selected", () => {
    render(
      <StatusDropdown
        currentStatus="todo"
        featureId="01HX0000000000000000000001"
        projectId={"p1" as never}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /todo/i }))
    fireEvent.click(screen.getByRole("menuitem", { name: /in progress/i }))
    expect(mutate).toHaveBeenCalledWith({
      projectId: "p1",
      featureId: "01HX0000000000000000000001",
      status: "in_progress",
    })
  })
})
