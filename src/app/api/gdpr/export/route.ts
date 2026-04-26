/**
 * GDPR data export. Authority: sub-plan 10 Task 14, CONSTITUTION §13.5.
 *
 * Returns a JSON bundle of every record we hold about the authenticated user.
 * Tokens are stripped (we don't return ciphertext nor plaintext).
 */

import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { convex } from "@/lib/convex-client"
import { api } from "../../../../../convex/_generated/api"

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  // Pull every user-scoped record. Each Convex module exposes a
  // listForUser-style query; we call them in parallel.
  const [profile, integration] = await Promise.all([
    convex.query(api.user_profiles.get, { userId }),
    convex.query(api.integrations.getConnection, { userId }),
  ])

  const bundle = {
    exportedAt: new Date().toISOString(),
    userId,
    profile,
    integrations: integration ? [integration] : [],
    note:
      "OAuth tokens are deliberately omitted — they are stored encrypted and " +
      "never exported. Re-connect any integration after restore.",
  }

  return new NextResponse(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="polaris-export-${userId}-${Date.now()}.json"`,
    },
  })
}
