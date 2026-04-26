import { describe, it, expect } from "vitest"
import { render, screen, within } from "@testing-library/react"
import {
  DeployProgressView,
  type DeploymentView,
} from "@/features/deploy/components/DeployProgress"
import { PIPELINE_STEPS } from "@/features/deploy/lib/pipeline-steps"

describe("DeployProgressView", () => {
  it("renders all 9 pipeline steps", () => {
    render(<DeployProgressView deployment={null} />)
    for (const step of PIPELINE_STEPS) {
      expect(screen.getByTestId(`step-${step}`)).toBeInTheDocument()
    }
  })

  it("shows the active step with a spinner", () => {
    const deployment: DeploymentView = {
      status: "running_migrations",
      currentStep: "Run migrations",
    }
    render(<DeployProgressView deployment={deployment} />)
    const li = screen.getByTestId("step-Run migrations")
    expect(li).toHaveAttribute("data-state", "active")
    expect(within(li).getByTestId("step-icon-active")).toBeInTheDocument()
  })

  it("marks earlier steps as done", () => {
    const deployment: DeploymentView = {
      status: "running_migrations",
      currentStep: "Run migrations",
    }
    render(<DeployProgressView deployment={deployment} />)
    const earlier = screen.getByTestId("step-Create Supabase project")
    expect(earlier).toHaveAttribute("data-state", "done")
    expect(within(earlier).getByTestId("step-icon-done")).toBeInTheDocument()
  })

  it("marks later steps as pending", () => {
    const deployment: DeploymentView = {
      status: "running_migrations",
      currentStep: "Run migrations",
    }
    render(<DeployProgressView deployment={deployment} />)
    const later = screen.getByTestId("step-Wait for Vercel build")
    expect(later).toHaveAttribute("data-state", "pending")
  })

  it("shows the error state and message when failed", () => {
    const deployment: DeploymentView = {
      status: "failed",
      currentStep: "Run migrations",
      errorMessage: "syntax error in migration",
    }
    render(<DeployProgressView deployment={deployment} />)
    const failed = screen.getByTestId("step-Run migrations")
    expect(failed).toHaveAttribute("data-state", "error")
    expect(within(failed).getByTestId("step-icon-error")).toBeInTheDocument()
    expect(screen.getByTestId("deploy-error")).toHaveTextContent(
      "syntax error in migration",
    )
  })

  it("shows the live URL when succeeded", () => {
    const deployment: DeploymentView = {
      status: "succeeded",
      currentStep: "Save live URL",
      liveUrl: "https://polaris-app.vercel.app",
    }
    render(<DeployProgressView deployment={deployment} />)
    const link = screen.getByTestId("deploy-live-url") as HTMLAnchorElement
    expect(link.href).toContain("polaris-app.vercel.app")
    // JetBrains Mono per design system
    expect(link.getAttribute("style")).toMatch(/JetBrains Mono|--font-mono/)
    // All steps should be done
    for (const step of PIPELINE_STEPS) {
      expect(screen.getByTestId(`step-${step}`)).toHaveAttribute(
        "data-state",
        "done",
      )
    }
  })

  it("renders empty (all pending) when deployment is null", () => {
    render(<DeployProgressView deployment={null} />)
    for (const step of PIPELINE_STEPS) {
      expect(screen.getByTestId(`step-${step}`)).toHaveAttribute(
        "data-state",
        "pending",
      )
    }
  })
})
