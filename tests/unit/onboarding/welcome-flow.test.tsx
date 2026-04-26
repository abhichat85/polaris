import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { WelcomeFlow } from "@/features/onboarding/components/welcome-flow"

const upsert = vi.fn().mockResolvedValue(undefined)
vi.mock("convex/react", () => ({
  useMutation: () => upsert,
  useQuery: () => undefined,
}))

describe("WelcomeFlow", () => {
  it("renders the welcome step by default", () => {
    render(<WelcomeFlow userId="u1" onComplete={() => {}} />)
    expect(
      screen.getByRole("heading", { name: /welcome to polaris/i }),
    ).toBeInTheDocument()
  })

  it("advances to preferences and persists step", async () => {
    upsert.mockClear()
    const user = userEvent.setup()
    render(<WelcomeFlow userId="u1" onComplete={() => {}} />)
    await user.click(screen.getByRole("button", { name: /continue/i }))
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", onboardingStep: "preferences" }),
    )
  })

  it("resumes from initialStep", () => {
    render(
      <WelcomeFlow userId="u1" onComplete={() => {}} initialStep="preferences" />,
    )
    expect(screen.getByText(/one question/i)).toBeInTheDocument()
  })

  it("calls onComplete from the starter step", async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    render(
      <WelcomeFlow
        userId="u1"
        onComplete={onComplete}
        initialStep="starter"
      />,
    )
    await user.click(screen.getByRole("button", { name: /show me starters/i }))
    expect(onComplete).toHaveBeenCalled()
  })
})
