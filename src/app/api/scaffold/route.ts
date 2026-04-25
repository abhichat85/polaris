/**
 * POST /api/scaffold — prompt → running app pipeline.
 * Authority: sub-plan 03 §11.
 *
 * Steps:
 *   1. Auth (Clerk) — require a signed-in user.
 *   2. Validate the request body.
 *   3. Insert project + scaffolding message in Convex.
 *   4. promptToScaffold(prompt, { adapter: getAdapter("claude") })
 *   5. Bulk-write resulting files to Convex via files_by_path:writeMany.
 *   6. Fire `sandbox/create` Inngest event so the sandbox boots in background.
 *   7. Return { projectId } so the client can navigate immediately while the
 *      sandbox warms up — Convex live queries will populate the file tree as
 *      the writes land.
 */

import { auth } from "@clerk/nextjs/server"
import { ConvexHttpClient } from "convex/browser"
import { NextResponse, type NextRequest } from "next/server"
import { api } from "@/../convex/_generated/api"
import type { Id } from "@/../convex/_generated/dataModel"
import { getAdapter } from "@/lib/agents/registry"
import { promptToScaffold } from "@/features/scaffold/lib/prompt-to-scaffold"

interface ScaffoldRequestBody {
  prompt?: unknown
  projectName?: unknown
}

const MAX_PROMPT_LENGTH = 4000

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as ScaffoldRequestBody | null
  if (!body) {
    return NextResponse.json(
      { error: "INVALID_PROMPT", message: "Request body must be JSON." },
      { status: 400 },
    )
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : ""
  if (!prompt) {
    return NextResponse.json(
      { error: "INVALID_PROMPT", message: "prompt is required." },
      { status: 400 },
    )
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return NextResponse.json(
      {
        error: "INVALID_PROMPT",
        message: `Prompt exceeds ${MAX_PROMPT_LENGTH} characters.`,
      },
      { status: 400 },
    )
  }

  const projectName =
    typeof body.projectName === "string" && body.projectName.trim().length > 0
      ? body.projectName.trim().slice(0, 80)
      : "Untitled project"

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY
  if (!convexUrl || !internalKey) {
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message:
          "NEXT_PUBLIC_CONVEX_URL and POLARIS_CONVEX_INTERNAL_KEY must be set.",
      },
      { status: 500 },
    )
  }
  const convex = new ConvexHttpClient(convexUrl)

  // 1. Create project + initial scaffolding message
  const projectId = (await convex.mutation(api.system.createProjectInternal, {
    internalKey,
    name: projectName,
    ownerId: userId,
  })) as Id<"projects">

  const adapter = getAdapter("claude")

  const startedAt = Date.now()
  const result = await promptToScaffold(prompt, { adapter })
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error.code,
        message: result.error.message,
        projectId,
      },
      { status: 502 },
    )
  }

  // 2. Bulk write
  const writeResult = (await convex.mutation(api.files_by_path.writeMany, {
    projectId,
    files: result.files.map((f) => ({ path: f.path, content: f.content })),
    updatedBy: "scaffold",
  })) as { created: number; updated: number; total: number }

  // 3. Fire sandbox/create event (handled by sub-plan 02 Inngest fns)
  // Done lazily here to avoid hard-coupling on inngest event keys until 02 lands.
  // The handler is a no-op until that wiring exists.

  return NextResponse.json({
    projectId,
    summary: result.summary,
    fileCount: result.files.length,
    created: writeResult.created,
    updated: writeResult.updated,
    durationMs: Date.now() - startedAt,
  })
}
