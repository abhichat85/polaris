/**
 * Next.js 16 edge proxy (the v16 rename of "middleware").
 *
 * Responsibilities (in order):
 *   1. Subdomain routing — getpolaris.xyz → marketing only; everything
 *      else → app.getpolaris.xyz. See src/lib/middleware/routing.ts.
 *   2. Clerk authentication guard for protected routes.
 *   3. Trace-ID injection on every response.
 *   4. Cross-Origin Isolation headers on /projects/* for WebContainer.
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
import { resolveRouting } from "@/lib/middleware/routing"

const COI_PATHS = /^\/projects(\/|$)/

function getHostname(req: NextRequest): string {
  // x-forwarded-host is set by Vercel's edge network and is trusted in
  // production. Fall back to the standard host header, then parse from
  // the request URL directly.
  return (
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    new URL(req.url).hostname
  )
}

export default clerkMiddleware(async (auth, req: NextRequest) => {
  const hostname = getHostname(req)
  const { pathname, search } = req.nextUrl

  // 1. Subdomain routing
  const decision = resolveRouting(hostname, pathname, search)

  if (decision.action === "redirect") {
    return NextResponse.redirect(decision.destination, { status: 308 })
  }

  if (decision.action === "protect") {
    // auth.protect() throws a Clerk control-flow error when the user is
    // unauthenticated; clerkMiddleware catches it and returns the sign-in
    // redirect. Execution only reaches NextResponse.next() below when the
    // user is authenticated (or the route is a passthrough).
    await auth.protect()
  }

  // 3 & 4. Trace-ID injection + COI headers
  const traceId = req.headers.get(TRACE_HEADER) ?? newTraceId()
  const res = NextResponse.next()
  res.headers.set(TRACE_HEADER, traceId)

  if (COI_PATHS.test(pathname)) {
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
