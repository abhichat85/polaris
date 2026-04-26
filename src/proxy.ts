/**
 * Next.js 16 edge proxy.
 * Clerk wraps the request; trace-ID is injected inside the handler.
 */

import { clerkMiddleware } from "@clerk/nextjs/server"
import { NextResponse, type NextRequest } from "next/server"
import { newTraceId, TRACE_HEADER } from "@/lib/observability/trace-id"

export default clerkMiddleware((auth, req: NextRequest) => {
  const traceId = req.headers.get(TRACE_HEADER) ?? newTraceId()
  const res = NextResponse.next()
  res.headers.set(TRACE_HEADER, traceId)
  return res
})

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}
