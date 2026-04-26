/**
 * Enqueue a GitHub repo import. Authority: sub-plan 06 Task 12.
 *
 * Body: { projectId, owner, repo, ref? }
 * Returns 202 Accepted with the Inngest event id; the actual work runs in
 * `features/github/inngest/import-repo.ts`.
 */

import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { z } from "zod"
import { inngest } from "@/inngest/client"
import { limiters } from "@/lib/rate-limit/limiter"

const Body = z.object({
  projectId: z.string().min(1),
  owner: z.string().min(1),
  repo: z.string().min(1),
  ref: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const decision = await limiters.githubPush.check(userId)
  if (!decision.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(decision.retryAfterSec) } },
    )
  }

  let body: z.infer<typeof Body>
  try {
    body = Body.parse(await req.json())
  } catch (e) {
    return NextResponse.json(
      { error: "invalid_body", detail: e instanceof Error ? e.message : "unknown" },
      { status: 400 },
    )
  }

  const ev = await inngest.send({
    name: "github/import.requested",
    data: { ...body, userId },
  })
  return NextResponse.json(
    { ok: true, ids: ev.ids },
    { status: 202 },
  )
}
