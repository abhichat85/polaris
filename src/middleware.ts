/**
 * Next.js Edge Middleware.
 *
 * Two responsibilities:
 *
 * 1. Cross-Origin Isolation headers (COOP + COEP) for /projects/* routes.
 *    These are required by WebContainer (@webcontainer/api) which uses
 *    SharedArrayBuffer. SharedArrayBuffer is only available when the page
 *    is cross-origin isolated (self.crossOriginIsolated === true).
 *
 *    We set the headers here in middleware rather than only in next.config.ts
 *    because middleware runs before Sentry's withSentryConfig wrapper and
 *    before the Next.js response cache, making it the most reliable place.
 *
 *    COEP=credentialless: cross-origin resources load without credentials
 *    (more permissive than require-corp; still enables crossOriginIsolated).
 *    Ref: https://webcontainers.io/guides/configuring-headers
 *
 * 2. Clerk auth — wraps every matched request so auth() / currentUser() work
 *    in server components and API routes. Previously lived in src/proxy.ts
 *    which Next.js never picked up (wrong filename).
 */

import { clerkMiddleware } from "@clerk/nextjs/server"
import { NextResponse, type NextRequest } from "next/server"
import { newTraceId, TRACE_HEADER } from "@/lib/observability/trace-id"

const COI_PATHS = /^\/projects(\/|$)/

export default clerkMiddleware((auth, req: NextRequest) => {
  const traceId = req.headers.get(TRACE_HEADER) ?? newTraceId()
  const res = NextResponse.next()

  // Inject trace-ID on every response.
  res.headers.set(TRACE_HEADER, traceId)

  // Apply Cross-Origin Isolation on /projects/* only — these pages boot
  // WebContainer. Marketing + auth pages are unaffected.
  if (COI_PATHS.test(req.nextUrl.pathname)) {
    res.headers.set("Cross-Origin-Opener-Policy", "same-origin")
    res.headers.set("Cross-Origin-Embedder-Policy", "credentialless")
  }

  return res
})

export const config = {
  matcher: [
    /*
     * Match all request paths except Next.js internals and static files.
     * This is the Clerk-recommended pattern.
     */
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}
