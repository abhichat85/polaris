/**
 * Authenticated user's GitHub repos. Authority: sub-plan 06 Task 12.
 *
 * GET ?page=1&perPage=30&excludeForks=1&excludeArchived=1
 * Returns { items: [...], hasMore: boolean }.
 */

import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { getOctokitForUser } from "@/lib/github/client"
import { listRepos } from "@/features/github/lib/repo-list"

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const page = Number(url.searchParams.get("page") ?? "1")
  const perPage = Number(url.searchParams.get("perPage") ?? "30")
  const excludeForks = url.searchParams.get("excludeForks") === "1"
  const excludeArchived = url.searchParams.get("excludeArchived") === "1"

  let octokit
  try {
    octokit = await getOctokitForUser(userId)
  } catch {
    return NextResponse.json({ error: "github_not_connected" }, { status: 412 })
  }

  try {
    const result = await listRepos(octokit, {
      page,
      perPage,
      excludeForks,
      excludeArchived,
    })
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, max-age=30" },
    })
  } catch (e) {
    return NextResponse.json(
      { error: "github_list_failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    )
  }
}
