/**
 * GDPR Article 15 — right of access. Authority: sub-plan 10 Task 14.
 *
 * Streams a JSON bundle of every record we hold about the authenticated
 * user. OAuth tokens are deliberately omitted — see
 * `convex/account.ts exportBundle`.
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

  let bundle: unknown
  try {
    bundle = await convex.query(api.account.exportBundle, { userId })
  } catch (e) {
    return NextResponse.json(
      { error: "export_failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    )
  }

  return new NextResponse(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="polaris-export-${userId}-${Date.now()}.json"`,
    },
  })
}
