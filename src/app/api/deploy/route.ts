/**
 * POST /api/deploy
 *
 * Authority: sub-plan 07.
 * - Clerk-authed
 * - Looks up the user's plan + today's deploy count, runs cost ceiling
 * - Creates a `deployments` row (status=provisioning_db) via internal-key
 *   Convex mutation
 * - Fires `deploy/start` Inngest event
 * - Returns `{ deploymentId }`
 *
 * The plan source for v1 is hardcoded to "free" — sub-plan 08 wires Stripe.
 */

import { z } from "zod"
import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { inngest } from "@/inngest/client"
import { convex } from "@/lib/convex-client"
import { api } from "@/../convex/_generated/api"
import type { Id } from "@/../convex/_generated/dataModel"
import {
  enforceDeployCostCeiling,
  DeployCostCeilingError,
  type Plan,
} from "@/features/deploy/lib/cost-ceiling"

const requestSchema = z.object({
  projectId: z.string().min(1),
  appName: z.string().min(1).optional(),
  region: z.string().optional(),
})

function generateDbPassword(): string {
  // Crypto-strong random — Web Crypto API is available in the Edge runtime,
  // and Node ≥18 exposes a global `crypto`.
  const arr = new Uint8Array(24)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("")
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY
  if (!internalKey) {
    return NextResponse.json(
      { error: "Internal key not configured" },
      { status: 500 },
    )
  }

  let body: z.infer<typeof requestSchema>
  try {
    body = requestSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  // Cost ceiling: read this user's deploys today.
  const usage = await convex.query(api.usage.getCurrentMonth, { ownerId: userId })
  const deploysToday = usage?.deployments ?? 0
  const plan: Plan = "free" // sub-plan 08 will wire Stripe-derived plans

  try {
    enforceDeployCostCeiling({ plan, deploysToday })
  } catch (e) {
    if (e instanceof DeployCostCeilingError) {
      return NextResponse.json(
        { error: e.message, plan: e.plan, limit: e.limit },
        { status: 429 },
      )
    }
    throw e
  }

  const appName =
    body.appName ?? `polaris-${body.projectId.slice(-6).toLowerCase()}`
  const dbPassword = generateDbPassword()

  const deploymentId = (await convex.mutation(api.deployments.create, {
    internalKey,
    projectId: body.projectId as Id<"projects">,
    userId,
    currentStep: "Create Supabase project",
  })) as Id<"deployments">

  await inngest.send({
    name: "deploy/start",
    data: {
      projectId: body.projectId,
      userId,
      deploymentId,
      appName,
      region: body.region,
      dbPassword,
    },
    user: { id: userId },
  })

  // Increment deploy counter immediately so two concurrent requests can't
  // both squeak through the ceiling.
  await convex.mutation(api.usage.increment, {
    ownerId: userId,
    deployments: 1,
  })

  return NextResponse.json({ deploymentId })
}
