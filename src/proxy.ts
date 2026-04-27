/**
 * Next.js 16 edge proxy (the v16 rename of "middleware").
 * Clerk wraps the request; trace-ID is injected inside the handler;
 * Cross-Origin Isolation headers are applied to /projects/* so
 * WebContainer's SharedArrayBuffer works (self.crossOriginIsolated).
 *
 * Why COI headers here and not only in next.config.ts:
 *   The next.config.ts headers run AFTER withSentryConfig wraps the
 *   response and AFTER the Next.js response cache. Setting them here
 *   in the edge proxy is the most reliable point and survives
 *   .next-cache clears + dev-server restarts.
 *   Ref: https://webcontainers.io/guides/configuring-headers
 */

import { clerkMiddleware } from "@clerk/nextjs/server"
import { NextResponse, type NextRequest } from "next/server"
import { newTraceId, TRACE_HEADER } from "@/lib/observability/trace-id"

const COI_PATHS = /^\/projects(\/|$)/

export default clerkMiddleware((auth, req: NextRequest) => {
  const traceId = req.headers.get(TRACE_HEADER) ?? newTraceId()
  const res = NextResponse.next()
  res.headers.set(TRACE_HEADER, traceId)

  // WebContainer requires Cross-Origin Isolation on the page that boots
  // it (uses SharedArrayBuffer). Scope to /projects/* — marketing/auth
  // pages that embed Clerk's iframes must NOT be COI or those break.
  if (COI_PATHS.test(req.nextUrl.pathname)) {
    res.headers.set("Cross-Origin-Opener-Policy", "same-origin")
    res.headers.set("Cross-Origin-Embedder-Policy", "credentialless")
  }

  return res
})

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}
