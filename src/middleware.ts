/**
 * Next.js Edge Middleware.
 *
 * Responsibilities:
 *   1. Subdomain routing — see src/lib/middleware/routing.ts for rules
 *   2. Clerk authentication guard for protected routes
 *
 * Matcher intentionally excludes static assets and _next internals so
 * Vercel's CDN is not interrupted.
 */
import { clerkMiddleware } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { resolveRouting } from "@/lib/middleware/routing"

function getHostname(req: NextRequest): string {
  // x-forwarded-host is set by Vercel's edge network and proxies.
  // Fall back to the host header, then parse from the URL directly.
  return (
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    new URL(req.url).hostname
  )
}

export default clerkMiddleware(async (auth, request: NextRequest) => {
  const hostname = getHostname(request)
  const { pathname, search } = request.nextUrl

  const decision = resolveRouting(hostname, pathname, search)

  if (decision.action === "redirect") {
    return NextResponse.redirect(decision.destination, { status: 308 })
  }

  if (decision.action === "protect") {
    await auth.protect()
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    /*
     * Match all paths except:
     *  - _next/static  (Next.js static chunks)
     *  - _next/image   (Next.js image optimisation)
     *  - favicon.ico
     *  - common static file extensions
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
    "/(api|trpc)(.*)",
  ],
}
