/**
 * Enqueue a GitHub repo push. Authority: sub-plan 06 Task 12.
 *
 * Body: { projectId, owner, repo, branch?, commitMessage? }
 * Returns 202; the secret-scan + push runs in
 * `features/github/inngest/push-repo.ts`.
 */

import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { z } from "zod"
import { inngest } from "@/inngest/client"
import { limiters } from "@/lib/rate-limit/limiter"
import { convex } from "@/lib/convex-client"
import { scanFiles } from "@/lib/security/secret-scan"
import { api } from "../../../../../convex/_generated/api"
import type { Id } from "../../../../../convex/_generated/dataModel"

const Body = z.object({
  projectId: z.string().min(1),
  owner: z.string().min(1),
  repo: z.string().min(1),
  branch: z.string().optional(),
  commitMessage: z.string().max(500).optional(),
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

  // Pre-flight secret scan so the UI can surface findings immediately
  // instead of waiting for the Inngest worker to fail.
  try {
    const files = await convex.query(api.files_by_path.listAllWithContent, {
      projectId: body.projectId as Id<"projects">,
    })
    const result = scanFiles(files)
    if (!result.clean) {
      return NextResponse.json(
        { error: "secret_leak", findings: result.findings },
        { status: 422 },
      )
    }
  } catch (e) {
    return NextResponse.json(
      {
        error: "preflight_failed",
        detail: e instanceof Error ? e.message : "unknown",
      },
      { status: 500 },
    )
  }

  const ev = await inngest.send({
    name: "github/push.requested",
    data: { ...body, userId },
  })
  return NextResponse.json({ ok: true, ids: ev.ids }, { status: 202 })
}
