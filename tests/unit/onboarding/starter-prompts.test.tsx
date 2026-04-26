import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { StarterPrompts } from "@/features/onboarding/components/starter-prompts"

describe("StarterPrompts", () => {
  it("renders all three starter cards", () => {
    render(<StarterPrompts onSelect={() => {}} />)
    expect(screen.getByRole("heading", { name: /saas landing page/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /notes app/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /ai chat/i })).toBeInTheDocument()
  })

  it("calls onSelect with the picked prompt", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<StarterPrompts onSelect={onSelect} />)
    await user.click(
      screen.getByRole("heading", { name: /saas landing page/i }).closest("button")!,
    )
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0][0].id).toBe("saas-landing")
  })

  it("disables every card when busy=true", () => {
    render(<StarterPrompts onSelect={() => {}} busy />)
    for (const btn of screen.getAllByRole("button")) {
      expect(btn).toBeDisabled()
    }
  })
})
