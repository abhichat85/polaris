/**
 * Pure routing logic for subdomain-based traffic splitting.
 *
 * getpolaris.xyz      → marketing pages only; everything else redirects to app
 * app.getpolaris.xyz  → full app; root redirects to /dashboard
 *
 * Extracted from middleware.ts so it can be unit-tested without Next.js.
 */

export const MARKETING_HOST = "getpolaris.xyz"
export const APP_HOST = "app.getpolaris.xyz"

/** Paths that are allowed to render on the marketing domain. */
const MARKETING_PREFIXES = ["/about", "/pricing", "/legal", "/status"]

export function isMarketingPath(pathname: string): boolean {
  if (pathname === "/") return true
  return MARKETING_PREFIXES.some(
    (prefix) =>
      pathname === prefix || pathname.startsWith(prefix + "/")
  )
}

/** Protected app routes that require Clerk authentication. */
const PROTECTED_PREFIXES = ["/dashboard", "/projects", "/settings"]

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) =>
      pathname === prefix || pathname.startsWith(prefix + "/")
  )
}

export type RoutingDecision =
  | { action: "redirect"; destination: string }
  | { action: "protect" }
  | { action: "passthrough" }

/**
 * Resolve the routing decision for a given request.
 *
 * @param hostname  The `host` header value, e.g. "getpolaris.xyz"
 * @param pathname  The URL pathname, e.g. "/dashboard"
 * @param search    The URL search string including "?", e.g. "?foo=bar" or ""
 */
export function resolveRouting(
  hostname: string,
  pathname: string,
  search: string
): RoutingDecision {
  const isMarketing =
    hostname === MARKETING_HOST || hostname === `www.${MARKETING_HOST}`
  const isApp = hostname === APP_HOST

  // Marketing domain: only marketing paths are served here.
  // Everything else is permanently redirected to the app subdomain.
  if (isMarketing && !isMarketingPath(pathname)) {
    return {
      action: "redirect",
      destination: `https://${APP_HOST}${pathname}${search}`,
    }
  }

  // App domain: root always redirects to the dashboard.
  if (isApp && pathname === "/") {
    return {
      action: "redirect",
      destination: `https://${APP_HOST}/dashboard`,
    }
  }

  // Protected routes require Clerk authentication on any domain
  // (covers localhost dev too).
  if (isProtectedPath(pathname)) {
    return { action: "protect" }
  }

  return { action: "passthrough" }
}
