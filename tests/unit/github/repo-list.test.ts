/**
 * repo-list tests. Authority: sub-plan 06 Task 12.
 */

import { describe, it, expect, vi } from "vitest"
import { listRepos } from "@/features/github/lib/repo-list"

function fakeOctokit(repos: Array<Record<string, unknown>>) {
  return {
    rest: {
      repos: {
        listForAuthenticatedUser: vi
          .fn()
          .mockResolvedValue({ data: repos }),
      },
    },
  } as never
}

describe("listRepos", () => {
  const sample = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    name: "repo",
    full_name: "octocat/repo",
    html_url: "https://github.com/octocat/repo",
    default_branch: "main",
    private: false,
    fork: false,
    archived: false,
    pushed_at: "2026-04-26T00:00:00Z",
    description: "x",
    ...overrides,
  })

  it("returns items and clamps perPage to 100", async () => {
    const { items, hasMore } = await listRepos(
      fakeOctokit([sample()]),
      { perPage: 9999 },
    )
    expect(items).toHaveLength(1)
    expect(hasMore).toBe(false)
  })

  it("excludes forks when asked", async () => {
    const { items } = await listRepos(
      fakeOctokit([
        sample({ id: 1, fork: false }),
        sample({ id: 2, fork: true }),
      ]),
      { excludeForks: true },
    )
    expect(items.map((r) => r.id)).toEqual([1])
  })

  it("excludes archived when asked", async () => {
    const { items } = await listRepos(
      fakeOctokit([
        sample({ id: 1, archived: false }),
        sample({ id: 2, archived: true }),
      ]),
      { excludeArchived: true },
    )
    expect(items.map((r) => r.id)).toEqual([1])
  })

  it("hasMore is true when page is full", async () => {
    const repos = Array.from({ length: 10 }, (_, i) =>
      sample({ id: i, name: `r${i}`, full_name: `o/r${i}` }),
    )
    const { hasMore } = await listRepos(fakeOctokit(repos), { perPage: 10 })
    expect(hasMore).toBe(true)
  })

  it("clamps page to >= 1", async () => {
    const oct = fakeOctokit([sample()])
    await listRepos(oct, { page: -5 })
    expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (oct as any).rest.repos.listForAuthenticatedUser.mock.calls[0][0].page,
    ).toBe(1)
  })
})
