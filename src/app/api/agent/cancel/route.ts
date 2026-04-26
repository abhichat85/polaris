/**
 * POST /api/agent/cancel — cancels an in-flight agent run.
 * Authority: sub-plan 01 §20.
 *
 * Two-step cancellation:
 *   1. Mark the message status as "cancelled" in Convex. The AgentRunner
 *      polls AgentSink.isCancelled between iterations and stops cleanly.
 *   2. Send `agent/cancel` to Inngest so the function's `cancelOn` rule fires
 *      and any in-flight Anthropic stream is aborted.
 */

import { auth } from "@clerk/nextjs/server"
import { ConvexHttpClient } from "convex/browser"
import { NextResponse, type NextRequest } from "next/server"
import { api } from "@/../convex/_generated/api"
import type { Id } from "@/../convex/_generated/dataModel"
import { inngest } from "@/inngest/client"

interface CancelBody {
  messageId?: unknown
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as CancelBody | null
  const messageId = typeof body?.messageId === "string" ? body.messageId : null
  if (!messageId) {
    return NextResponse.json(
      { error: "messageId is required" },
      { status: 400 },
    )
  }

  const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!internalKey || !convexUrl) {
    return NextResponse.json(
      { error: "Server not configured" },
      { status: 500 },
    )
  }
  const convex = new ConvexHttpClient(convexUrl)

  // Mark cancelled so the runner's per-iteration check stops the loop.
  await convex.mutation(api.agent_messages.markDone, {
    internalKey,
    messageId: messageId as Id<"messages">,
    status: "cancelled",
  })

  // Tell Inngest to abort any in-flight stream.
  await inngest.send({ name: "agent/cancel", data: { messageId } })

  return NextResponse.json({ ok: true })
}
