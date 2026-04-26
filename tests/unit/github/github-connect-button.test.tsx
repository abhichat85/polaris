import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { GithubConnectButton } from "@/features/github/components/github-connect-button"

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
}))

import { useQuery } from "convex/react"

describe("GithubConnectButton", () => {
  it("shows the loading state while query resolves", () => {
    vi.mocked(useQuery).mockReturnValue(undefined)
    render(<GithubConnectButton userId="u1" />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it("shows the Connect link when not connected", () => {
    vi.mocked(useQuery).mockReturnValue(null)
    render(<GithubConnectButton userId="u1" />)
    const link = screen.getByRole("link", { name: /connect github/i })
    expect(link).toHaveAttribute("href", "/api/github/oauth/start")
  })

  it("shows the username and disconnect when connected", () => {
    vi.mocked(useQuery).mockReturnValue({
      _id: "x",
      provider: "github",
      accountLogin: "octocat",
      accountId: "1",
      scopes: ["repo"],
      connectedAt: 0,
      lastUsedAt: 0,
    })
    render(<GithubConnectButton userId="u1" />)
    expect(screen.getByText("@octocat")).toBeInTheDocument()
    expect(screen.getByLabelText(/disconnect github/i)).toBeInTheDocument()
  })
})
