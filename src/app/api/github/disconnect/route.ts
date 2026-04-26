/**
 * Disconnect GitHub. Authority: sub-plan 06 Task 12.
 * Removes the encrypted token row. The user can re-connect any time.
 */

import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { convex } from "@/lib/convex-client"
import { api } from "../../../../../convex/_generated/api"

export async function POST() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  await convex.mutation(api.integrations.disconnect, { userId })
  return NextResponse.json({ ok: true })
}
