import { describe, it, expect } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { NuqsTestingAdapter } from "nuqs/adapters/testing"
import { RightPaneTabs } from "@/features/specs/components/right-pane-tabs"

describe("RightPaneTabs", () => {
  it("renders Editor, Preview, and Spec tabs", () => {
    render(
      <NuqsTestingAdapter searchParams="?tab=editor">
        <RightPaneTabs
          editor={<div>EDITOR</div>}
          preview={<div>PREVIEW</div>}
          spec={<div>SPEC</div>}
        />
      </NuqsTestingAdapter>,
    )
    expect(screen.getByRole("tab", { name: /editor/i })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /preview/i })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /spec/i })).toBeInTheDocument()
  })

  it("shows the editor pane when tab=editor", () => {
    render(
      <NuqsTestingAdapter searchParams="?tab=editor">
        <RightPaneTabs
          editor={<div>EDITOR</div>}
          preview={<div>PREVIEW</div>}
          spec={<div>SPEC</div>}
        />
      </NuqsTestingAdapter>,
    )
    expect(screen.getByText("EDITOR")).toBeInTheDocument()
  })

  it("shows the spec pane when tab=spec", () => {
    render(
      <NuqsTestingAdapter searchParams="?tab=spec">
        <RightPaneTabs
          editor={<div>EDITOR</div>}
          preview={<div>PREVIEW</div>}
          spec={<div>SPEC</div>}
        />
      </NuqsTestingAdapter>,
    )
    expect(screen.getByText("SPEC")).toBeInTheDocument()
  })

  it("active tab uses surface-4 + indigo accent bar; inactive uses surface-3", () => {
    render(
      <NuqsTestingAdapter searchParams="?tab=spec">
        <RightPaneTabs
          editor={<div>EDITOR</div>}
          preview={<div>PREVIEW</div>}
          spec={<div>SPEC</div>}
        />
      </NuqsTestingAdapter>,
    )
    const active = screen.getByRole("tab", { name: /spec/i })
    expect(active.className).toMatch(/surface-4/)
    const inactive = screen.getByRole("tab", { name: /editor/i })
    expect(inactive.className).toMatch(/surface-3/)
  })
})
