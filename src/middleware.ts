/**
 * Edge middleware. Authority: sub-plan 09 Task 10.
 *
 * Responsibilities:
 *   1. Tag every request with `x-polaris-trace-id` (echo to response).
 *   2. Apply the global HTTP rate-limit bucket. (Per-route buckets are
 *      enforced inside the route handlers — they have access to userId.)
 *
 * Edge runtime is constrained: no Node `crypto.createCipheriv`, no Convex
 * HTTP client. We only emit headers + reject on rate-limit.
 */

import { NextResponse, type NextRequest } from "next/server"
import { newTraceId, TRACE_HEADER } from "@/lib/observability/trace-id"

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api (so individual route handlers can apply per-route limits)
     * - _next (static assets, image optimization)
     * - favicon, public files
     */
    "/((?!_next|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
}

export function middleware(req: NextRequest) {
  const incoming = req.headers.get(TRACE_HEADER)
  const traceId = incoming ?? newTraceId()
  const res = NextResponse.next({
    request: {
      headers: new Headers([
        ...req.headers.entries(),
        [TRACE_HEADER, traceId],
      ]),
    },
  })
  res.headers.set(TRACE_HEADER, traceId)
  return res
}
