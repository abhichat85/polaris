/**
 * Paginated repo lister. Authority: sub-plan 06 Task 12.
 *
 * Wraps `octokit.rest.repos.listForAuthenticatedUser` with sane defaults
 * (most-recently-updated first, max 100/page) and filters out forks/archived
 * if the caller asks.
 */

import type { Octokit } from "octokit"

export interface RepoListItem {
  id: number
  name: string
  fullName: string
  htmlUrl: string
  defaultBranch: string
  private: boolean
  fork: boolean
  archived: boolean
  pushedAt: string | null
  description: string | null
}

export interface RepoListOptions {
  page?: number
  perPage?: number
  excludeForks?: boolean
  excludeArchived?: boolean
}

export async function listRepos(
  octokit: Octokit,
  opts: RepoListOptions = {},
): Promise<{ items: RepoListItem[]; hasMore: boolean }> {
  const page = Math.max(1, opts.page ?? 1)
  const perPage = Math.min(100, Math.max(1, opts.perPage ?? 30))

  const resp = await octokit.rest.repos.listForAuthenticatedUser({
    sort: "updated",
    direction: "desc",
    per_page: perPage,
    page,
  })

  const raw = resp.data as Array<{
    id: number
    name: string
    full_name: string
    html_url: string
    default_branch: string
    private: boolean
    fork: boolean
    archived: boolean
    pushed_at: string | null
    description: string | null
  }>

  const items: RepoListItem[] = []
  for (const r of raw) {
    if (opts.excludeForks && r.fork) continue
    if (opts.excludeArchived && r.archived) continue
    items.push({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      htmlUrl: r.html_url,
      defaultBranch: r.default_branch,
      private: r.private,
      fork: r.fork,
      archived: r.archived,
      pushedAt: r.pushed_at,
      description: r.description,
    })
  }
  return { items, hasMore: raw.length === perPage }
}
