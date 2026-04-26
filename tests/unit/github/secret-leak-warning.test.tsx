import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SecretLeakWarning } from "@/features/github/components/secret-leak-warning"

const findings = [
  { path: "src/keys.ts", line: 12, column: 5, category: "github_token", preview: "ghp_aaaa" },
  { path: "config.ts", line: 1, column: 1, category: "aws_access_key", preview: "AKIA…" },
]

describe("SecretLeakWarning", () => {
  it("shows the count of findings in the description", () => {
    render(<SecretLeakWarning findings={findings} onClose={() => {}} />)
    const desc = screen.getAllByText((_t, el) =>
      (el?.textContent ?? "").includes("Polaris found 2"),
    )
    expect(desc.length).toBeGreaterThan(0)
  })

  it("lists each finding by path:line", () => {
    render(<SecretLeakWarning findings={findings} onClose={() => {}} />)
    expect(screen.getByText("src/keys.ts")).toBeInTheDocument()
    expect(screen.getByText("config.ts")).toBeInTheDocument()
  })

  it("renders human-readable category labels", () => {
    render(<SecretLeakWarning findings={findings} onClose={() => {}} />)
    expect(screen.getByText(/github token/i)).toBeInTheDocument()
    expect(screen.getByText(/aws access key/i)).toBeInTheDocument()
  })

  it("calls onClose when the action button is clicked", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<SecretLeakWarning findings={findings} onClose={onClose} />)
    await user.click(screen.getByRole("button", { name: /clean these up/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
