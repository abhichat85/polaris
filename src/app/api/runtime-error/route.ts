/**
 * D-043 — Runtime error ingest proxy.
 *
 * Forwards browser-side runtime events from `polaris-runtime-tap.js`
 * to the Convex `runtimeErrors.ingest` mutation. The Polaris edge:
 *   - validates the request shape (Zod)
 *   - holds the POLARIS_CONVEX_INTERNAL_KEY (never shipped to browsers)
 *   - allows CORS from sandbox preview origins (E2B, localhost, *.lvh.me)
 *
 * Auth: NONE. Project-scoping is by the projectId payload field. The
 * worst case is a malicious party emitting noise events for a known
 * projectId — defended by Convex-side rate limiting (50/min/project).
 */

import { z } from "zod"
import { NextResponse } from "next/server"
import { ConvexHttpClient } from "convex/browser"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"

export const maxDuration = 10
export const dynamic = "force-dynamic"

const KIND = z.enum([
  "error",
  "unhandled_rejection",
  "console_error",
  "network_error",
  "react_error_boundary",
])

const RequestSchema = z.object({
  projectId: z.string().min(1),
  kind: KIND,
  message: z.string().min(1).max(8_000),
  stack: z.string().max(16_000).optional(),
  url: z.string().max(2_000).optional(),
  componentStack: z.string().max(8_000).optional(),
  userAgent: z.string().max(500).optional(),
  timestamp: z.number().int().positive().optional(),
})

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(request: Request) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY
  if (!convexUrl || !internalKey) {
    return NextResponse.json(
      { error: "Polaris ingest not configured" },
      { status: 500, headers: CORS_HEADERS },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: CORS_HEADERS },
    )
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues.slice(0, 5) },
      { status: 400, headers: CORS_HEADERS },
    )
  }

  const convex = new ConvexHttpClient(convexUrl)
  try {
    const result = await convex.mutation(api.runtimeErrors.ingest, {
      internalKey,
      projectId: parsed.data.projectId as Id<"projects">,
      kind: parsed.data.kind,
      message: parsed.data.message,
      stack: parsed.data.stack,
      url: parsed.data.url,
      componentStack: parsed.data.componentStack,
      userAgent: parsed.data.userAgent,
      timestamp: parsed.data.timestamp,
    })
    return NextResponse.json(result, { status: 200, headers: CORS_HEADERS })
  } catch (err) {
    // Convex errors include "Project not found" when the projectId is
    // bogus — return 400 so noisy clients stop retrying.
    const message = err instanceof Error ? err.message : "Internal error"
    const status = message.toLowerCase().includes("not found") ? 400 : 500
    return NextResponse.json(
      { error: message },
      { status, headers: CORS_HEADERS },
    )
  }
}
