import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"

const upsert = vi.fn().mockResolvedValue(undefined)

vi.mock("convex/react", () => ({
  useMutation: () => upsert,
  useQuery: () => undefined,
}))

import { FeatureForm } from "@/features/specs/components/feature-form"

describe("FeatureForm", () => {
  beforeEach(() => upsert.mockClear())

  it("shows a validation error when title is empty on submit", async () => {
    render(
      <FeatureForm
        projectId={"p1" as never}
        existingFeatures={[]}
        open
        onOpenChange={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /create feature/i }))
    await waitFor(() => {
      expect(screen.getByText(/title is required/i)).toBeInTheDocument()
    })
    expect(upsert).not.toHaveBeenCalled()
  })

  it("submits a valid feature with default status=todo", async () => {
    render(
      <FeatureForm
        projectId={"p1" as never}
        existingFeatures={[]}
        open
        onOpenChange={() => {}}
      />,
    )
    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: "User can sign in" },
    })
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "Email + password login." },
    })
    fireEvent.change(screen.getByPlaceholderText(/criterion/i), {
      target: { value: "Form renders" },
    })
    fireEvent.click(screen.getByRole("button", { name: /create feature/i }))
    await waitFor(() => {
      expect(upsert).toHaveBeenCalledTimes(1)
    })
    const call = upsert.mock.calls[0][0]
    expect(call.projectId).toBe("p1")
    expect(call.features).toHaveLength(1)
    expect(call.features[0]).toMatchObject({
      title: "User can sign in",
      description: "Email + password login.",
      status: "todo",
      priority: "p1",
      acceptanceCriteria: ["Form renders"],
    })
    expect(call.features[0].id).toHaveLength(26)
  })
})
