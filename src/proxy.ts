/**
 * Next.js 16 edge proxy (replaces middleware.ts).
 * Combines Clerk auth middleware with Polaris observability:
 *   1. Tag every request/response with x-polaris-trace-id.
 *   2. Run Clerk's clerkMiddleware for auth handling.
 */

import { clerkMiddleware } from "@clerk/nextjs/server"
import { NextResponse, type NextRequest } from "next/server"
import { newTraceId, TRACE_HEADER } from "@/lib/observability/trace-id"

const clerk = clerkMiddleware()

export default function proxy(req: NextRequest) {
  // Propagate or generate a trace ID on every request.
  const traceId = req.headers.get(TRACE_HEADER) ?? newTraceId()
  const reqWithTrace = new Request(req, {
    headers: (() => {
      const h = new Headers(req.headers)
      h.set(TRACE_HEADER, traceId)
      return h
    })(),
  })

  // Run Clerk middleware and attach the trace ID to the response.
  const res = clerk(reqWithTrace as NextRequest, {} as never) as
    | Response
    | NextResponse
    | undefined

  if (res instanceof Response) {
    res.headers.set(TRACE_HEADER, traceId)
    return res
  }

  const next = NextResponse.next()
  next.headers.set(TRACE_HEADER, traceId)
  return next
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
}
