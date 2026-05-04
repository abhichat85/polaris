# Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy Polaris to Vercel as a single project serving `getpolaris.xyz` (marketing) and `app.getpolaris.xyz` (app), with Convex promoted to a production deployment.

**Architecture:** One Vercel project, two custom domains. A Next.js `middleware.ts` reads the request hostname and either passes through, redirects to the correct domain, or invokes Clerk's auth guard. Pure routing logic is extracted into `src/lib/middleware/routing.ts` so it can be unit-tested without Next.js or Clerk.

**Tech Stack:** Next.js 16 App Router, `@clerk/nextjs` v6, Convex, Vercel CLI, vitest

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| **Create** | `src/lib/middleware/routing.ts` | Pure hostname → routing-decision logic (testable) |
| **Create** | `src/middleware.ts` | Thin Next.js middleware wrapper: calls routing + Clerk |
| **Create** | `tests/unit/lib/middleware/routing.test.ts` | Unit tests for routing decisions |
| **Modify** | `src/app/robots.ts` | Switch `NEXT_PUBLIC_APP_URL` → `NEXT_PUBLIC_MARKETING_URL` |
| **Modify** | `src/app/sitemap.ts` | Switch `NEXT_PUBLIC_APP_URL` → `NEXT_PUBLIC_MARKETING_URL` |
| **Modify** | `src/app/(marketing)/layout.tsx` | Update OpenGraph URL to `https://getpolaris.xyz` |
| **Modify** | `src/features/marketing/components/footer.tsx` | Update display text to `app.getpolaris.xyz` |
| **Modify** | `src/lib/scaffold/runtime-tap-injection.ts` | Update fallback to `https://app.getpolaris.xyz` |
| **Modify** | `src/app/api/webhooks/clerk/route.ts` | Update stale URL in comment |

---

## Task 1: Pure Routing Logic + Tests

**Files:**
- Create: `src/lib/middleware/routing.ts`
- Create: `tests/unit/lib/middleware/routing.test.ts`

- [ ] **Step 1.1: Write the failing tests**

Create `tests/unit/lib/middleware/routing.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { resolveRouting, isMarketingPath } from "@/lib/middleware/routing"

describe("isMarketingPath", () => {
  it.each([
    ["/", true],
    ["/about", true],
    ["/about/team", true],
    ["/pricing", true],
    ["/pricing/", true],
    ["/legal", true],
    ["/legal/terms", true],
    ["/legal/privacy", true],
    ["/status", true],
    ["/dashboard", false],
    ["/projects", false],
    ["/projects/123", false],
    ["/settings", false],
    ["/sign-in", false],
    ["/sign-up", false],
    ["/api/health", false],
  ])("isMarketingPath(%s) === %s", (pathname, expected) => {
    expect(isMarketingPath(pathname)).toBe(expected)
  })
})

describe("resolveRouting — marketing domain", () => {
  const host = "getpolaris.xyz"

  it("passes through marketing paths", () => {
    expect(resolveRouting(host, "/", "")).toEqual({ action: "passthrough" })
    expect(resolveRouting(host, "/about", "")).toEqual({ action: "passthrough" })
    expect(resolveRouting(host, "/pricing", "")).toEqual({ action: "passthrough" })
    expect(resolveRouting(host, "/legal/terms", "")).toEqual({ action: "passthrough" })
    expect(resolveRouting(host, "/status", "")).toEqual({ action: "passthrough" })
  })

  it("redirects non-marketing paths to app subdomain", () => {
    expect(resolveRouting(host, "/dashboard", "")).toEqual({
      action: "redirect",
      destination: "https://app.getpolaris.xyz/dashboard",
    })
    expect(resolveRouting(host, "/sign-in", "")).toEqual({
      action: "redirect",
      destination: "https://app.getpolaris.xyz/sign-in",
    })
    expect(resolveRouting(host, "/projects/abc", "")).toEqual({
      action: "redirect",
      destination: "https://app.getpolaris.xyz/projects/abc",
    })
  })

  it("preserves query string when redirecting", () => {
    expect(resolveRouting(host, "/sign-in", "?redirect_url=/dashboard")).toEqual({
      action: "redirect",
      destination: "https://app.getpolaris.xyz/sign-in?redirect_url=/dashboard",
    })
  })

  it("also matches www subdomain", () => {
    expect(resolveRouting("www.getpolaris.xyz", "/dashboard", "")).toEqual({
      action: "redirect",
      destination: "https://app.getpolaris.xyz/dashboard",
    })
  })
})

describe("resolveRouting — app subdomain", () => {
  const host = "app.getpolaris.xyz"

  it("redirects root to /dashboard", () => {
    expect(resolveRouting(host, "/", "")).toEqual({
      action: "redirect",
      destination: "https://app.getpolaris.xyz/dashboard",
    })
  })

  it("protects dashboard routes", () => {
    expect(resolveRouting(host, "/dashboard", "")).toEqual({ action: "protect" })
    expect(resolveRouting(host, "/dashboard/overview", "")).toEqual({ action: "protect" })
    expect(resolveRouting(host, "/projects/abc", "")).toEqual({ action: "protect" })
    expect(resolveRouting(host, "/settings", "")).toEqual({ action: "protect" })
    expect(resolveRouting(host, "/settings/billing", "")).toEqual({ action: "protect" })
  })

  it("passes through auth routes without protecting", () => {
    expect(resolveRouting(host, "/sign-in", "")).toEqual({ action: "passthrough" })
    expect(resolveRouting(host, "/sign-up", "")).toEqual({ action: "passthrough" })
  })

  it("passes through API routes", () => {
    expect(resolveRouting(host, "/api/health", "")).toEqual({ action: "passthrough" })
    expect(resolveRouting(host, "/api/inngest", "")).toEqual({ action: "passthrough" })
    expect(resolveRouting(host, "/api/webhooks/clerk", "")).toEqual({ action: "passthrough" })
  })
})

describe("resolveRouting — local dev (localhost)", () => {
  const host = "localhost:3000"

  it("protects app routes on localhost too", () => {
    expect(resolveRouting(host, "/dashboard", "")).toEqual({ action: "protect" })
    expect(resolveRouting(host, "/projects/xyz", "")).toEqual({ action: "protect" })
  })

  it("passes through marketing routes on localhost", () => {
    expect(resolveRouting(host, "/", "")).toEqual({ action: "passthrough" })
    expect(resolveRouting(host, "/about", "")).toEqual({ action: "passthrough" })
    expect(resolveRouting(host, "/pricing", "")).toEqual({ action: "passthrough" })
  })

  it("passes through auth routes on localhost", () => {
    expect(resolveRouting(host, "/sign-in", "")).toEqual({ action: "passthrough" })
  })
})
```

- [ ] **Step 1.2: Run tests to verify they fail**

```bash
pnpm test tests/unit/lib/middleware/routing.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/middleware/routing'`

- [ ] **Step 1.3: Implement `src/lib/middleware/routing.ts`**

```typescript
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
```

- [ ] **Step 1.4: Run tests to verify they pass**

```bash
pnpm test tests/unit/lib/middleware/routing.test.ts
```

Expected: all tests PASS

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/middleware/routing.ts tests/unit/lib/middleware/routing.test.ts
git commit -m "feat(middleware): add pure subdomain routing logic with tests"
```

---

## Task 2: Next.js Middleware

**Files:**
- Create: `src/middleware.ts`

- [ ] **Step 2.1: Create `src/middleware.ts`**

```typescript
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
```

- [ ] **Step 2.2: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors

- [ ] **Step 2.3: Run the full test suite to check for regressions**

```bash
pnpm test:unit
```

Expected: all existing tests pass

- [ ] **Step 2.4: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(middleware): add Next.js middleware for subdomain routing + Clerk auth"
```

---

## Task 3: Update Hardcoded URLs

**Files:**
- Modify: `src/app/robots.ts`
- Modify: `src/app/sitemap.ts`
- Modify: `src/app/(marketing)/layout.tsx`
- Modify: `src/features/marketing/components/footer.tsx`
- Modify: `src/lib/scaffold/runtime-tap-injection.ts`
- Modify: `src/app/api/webhooks/clerk/route.ts`

- [ ] **Step 3.1: Update `src/app/robots.ts`**

Replace the entire file content:

```typescript
import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  const base =
    process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://getpolaris.xyz"
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/settings/", "/sign-in", "/sign-up"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
```

- [ ] **Step 3.2: Update `src/app/sitemap.ts`**

Replace the entire file content:

```typescript
import type { MetadataRoute } from "next"

export default function sitemap(): MetadataRoute.Sitemap {
  const base =
    process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://getpolaris.xyz"
  const lastModified = new Date()
  return [
    { url: `${base}/`, lastModified, priority: 1.0, changeFrequency: "weekly" },
    { url: `${base}/pricing`, lastModified, priority: 0.9, changeFrequency: "monthly" },
    { url: `${base}/about`, lastModified, priority: 0.6, changeFrequency: "monthly" },
    { url: `${base}/status`, lastModified, priority: 0.4, changeFrequency: "daily" },
    { url: `${base}/legal/terms`, lastModified, priority: 0.3, changeFrequency: "monthly" },
    { url: `${base}/legal/privacy`, lastModified, priority: 0.3, changeFrequency: "monthly" },
    { url: `${base}/legal/dpa`, lastModified, priority: 0.3, changeFrequency: "monthly" },
    { url: `${base}/legal/cookies`, lastModified, priority: 0.3, changeFrequency: "monthly" },
  ]
}
```

- [ ] **Step 3.3: Update `src/app/(marketing)/layout.tsx` OpenGraph URL**

Change line 16 from:
```typescript
    url: "https://build.praxiomai.xyz",
```
To:
```typescript
    url: "https://getpolaris.xyz",
```

- [ ] **Step 3.4: Update `src/features/marketing/components/footer.tsx` display text**

Change line 100 from:
```
            build.praxiomai.xyz
```
To:
```
            app.getpolaris.xyz
```

- [ ] **Step 3.5: Update `src/lib/scaffold/runtime-tap-injection.ts` fallback**

Change line 25 from:
```typescript
  process.env.NEXT_PUBLIC_POLARIS_ORIGIN ?? "https://build.praxiomai.xyz"
```
To:
```typescript
  process.env.NEXT_PUBLIC_POLARIS_ORIGIN ?? "https://app.getpolaris.xyz"
```

- [ ] **Step 3.6: Update stale comment in `src/app/api/webhooks/clerk/route.ts`**

Change the comment line:
```
 *   URL:    https://build.praxiomai.xyz/api/webhooks/clerk
```
To:
```
 *   URL:    https://app.getpolaris.xyz/api/webhooks/clerk
```

- [ ] **Step 3.7: Verify TypeScript still compiles**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors

- [ ] **Step 3.8: Commit**

```bash
git add \
  src/app/robots.ts \
  src/app/sitemap.ts \
  "src/app/(marketing)/layout.tsx" \
  src/features/marketing/components/footer.tsx \
  src/lib/scaffold/runtime-tap-injection.ts \
  src/app/api/webhooks/clerk/route.ts
git commit -m "chore: update hardcoded URLs from build.praxiomai.xyz to getpolaris.xyz"
```

---

## Task 4: Deploy Convex to Production

- [ ] **Step 4.1: Run Convex production deploy**

```bash
pnpm convex:deploy
```

Convex will ask you to confirm deploying to production. Type `y`.

Expected output (values will differ):
```
✔ Deployed Convex functions to production
Deploy key:        prod:your-deployment-name-here
Deployment URL:    https://your-deployment-name.convex.cloud
```

- [ ] **Step 4.2: Record the two output values**

Save these — you will need them in Task 5:

```
CONVEX_DEPLOYMENT=prod:your-deployment-name-here
NEXT_PUBLIC_CONVEX_URL=https://your-deployment-name.convex.cloud
```

---

## Task 5: Create Vercel Project and Set Env Vars

- [ ] **Step 5.1: Install Vercel CLI (if not already installed)**

```bash
npm install -g vercel
```

Verify: `vercel --version` should print a version string.

- [ ] **Step 5.2: Link the project to Vercel**

From the repo root:
```bash
vercel link
```

When prompted:
- "Set up and deploy?" → `Y`
- "Which scope?" → select your Vercel team/account
- "Link to existing project?" → `N` (creates a new project named `polaris`)
- "What's your project's name?" → `polaris`
- "In which directory is your code located?" → `.` (current directory)

This creates a `.vercel/project.json` file. Do **not** commit it (it is already in `.gitignore`).

- [ ] **Step 5.3: Set all production environment variables**

Run each command below. Replace `<VALUE>` with the actual value from `.env.local` (or the new production Convex values from Task 4).

```bash
# Convex — use production values from Task 4
vercel env add CONVEX_DEPLOYMENT production
vercel env add NEXT_PUBLIC_CONVEX_URL production

# Clerk
vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY production
vercel env add CLERK_SECRET_KEY production
vercel env add CLERK_JWT_ISSUER_DOMAIN production
vercel env add NEXT_PUBLIC_CLERK_SIGN_IN_URL production
vercel env add NEXT_PUBLIC_CLERK_SIGN_UP_URL production
vercel env add NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL production
vercel env add NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL production

# Domain URLs
vercel env add NEXT_PUBLIC_APP_URL production
vercel env add NEXT_PUBLIC_MARKETING_URL production
vercel env add NEXT_PUBLIC_POLARIS_ORIGIN production

# Polaris internal
vercel env add POLARIS_CONVEX_INTERNAL_KEY production
vercel env add POLARIS_ENCRYPTION_KEY production

# AI providers
vercel env add ANTHROPIC_API_KEY production
vercel env add GOOGLE_GENERATIVE_AI_API_KEY production

# GitHub OAuth
vercel env add GITHUB_OAUTH_CLIENT_ID production
vercel env add GITHUB_OAUTH_CLIENT_SECRET production

# Stripe
vercel env add STRIPE_SECRET_KEY production
vercel env add STRIPE_WEBHOOK_SECRET production
vercel env add STRIPE_PRICE_PRO_MONTHLY production
vercel env add STRIPE_PRICE_TEAM_MONTHLY production

# Inngest
vercel env add INNGEST_EVENT_KEY production
vercel env add INNGEST_SIGNING_KEY production

# Other services
vercel env add FIRECRAWL_API_KEY production
vercel env add SENTRY_DSN production
vercel env add NEXT_PUBLIC_SENTRY_DSN production
```

For each `vercel env add` command, the CLI will prompt for the value. Enter the value from `.env.local`, **except** for these which use new values:

| Variable | Value to enter |
|----------|----------------|
| `CONVEX_DEPLOYMENT` | `prod:your-deployment-name` (from Task 4) |
| `NEXT_PUBLIC_CONVEX_URL` | `https://your-deployment-name.convex.cloud` (from Task 4) |
| `NEXT_PUBLIC_APP_URL` | `https://app.getpolaris.xyz` |
| `NEXT_PUBLIC_MARKETING_URL` | `https://getpolaris.xyz` |
| `NEXT_PUBLIC_POLARIS_ORIGIN` | `https://app.getpolaris.xyz` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `/dashboard` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | `/dashboard` |

- [ ] **Step 5.4: Deploy to Vercel**

```bash
vercel --prod
```

Expected: build succeeds and outputs a production URL like `https://polaris-xyz.vercel.app`.

- [ ] **Step 5.5: Confirm the build succeeded**

```bash
vercel inspect --logs
```

Scroll through and confirm no build errors. The app will work at the `*.vercel.app` URL before the custom domains are wired up.

---

## Task 6: Add Custom Domains in Vercel

- [ ] **Step 6.1: Add `getpolaris.xyz`**

```bash
vercel domains add getpolaris.xyz
```

Expected output:
```
Domain getpolaris.xyz added to polaris
```

- [ ] **Step 6.2: Add `app.getpolaris.xyz`**

```bash
vercel domains add app.getpolaris.xyz
```

Expected output:
```
Domain app.getpolaris.xyz added to polaris
```

- [ ] **Step 6.3: Get the DNS values Vercel requires**

```bash
vercel domains inspect getpolaris.xyz
vercel domains inspect app.getpolaris.xyz
```

Vercel will print the exact DNS records required. They will match what's in this plan, but always use the values printed by Vercel (they are authoritative).

---

## Task 7: Configure GoDaddy DNS

Log in to GoDaddy → DNS Management for `getpolaris.xyz`.

- [ ] **Step 7.1: Add A record for root domain**

| Type | Name | Value | TTL |
|------|------|-------|-----|
| `A` | `@` | `76.76.21.21` | 600 |

If an existing A record for `@` exists, **edit** it rather than adding a new one.

- [ ] **Step 7.2: Add/update CNAME for `www`**

| Type | Name | Value | TTL |
|------|------|-------|-----|
| `CNAME` | `www` | `cname.vercel-dns.com` | 600 |

- [ ] **Step 7.3: Add CNAME for `app` subdomain**

| Type | Name | Value | TTL |
|------|------|-------|-----|
| `CNAME` | `app` | `cname.vercel-dns.com` | 600 |

- [ ] **Step 7.4: Verify DNS propagation**

```bash
dig getpolaris.xyz A +short
dig app.getpolaris.xyz CNAME +short
```

Expected:
```
76.76.21.21
cname.vercel-dns.com.
```

If `dig` is not available:

```bash
nslookup getpolaris.xyz
nslookup app.getpolaris.xyz
```

DNS propagates in minutes with a 600s TTL. Vercel's dashboard will show a green checkmark once it verifies.

---

## Task 8: Update External Webhooks

Once DNS is live and both domains respond:

- [ ] **Step 8.1: Stripe — update webhook endpoint**

1. Go to [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks)
2. Find the existing webhook pointing to `build.praxiomai.xyz`
3. Update the endpoint URL to: `https://app.getpolaris.xyz/api/webhooks`
4. Save. The `STRIPE_WEBHOOK_SECRET` does not change.

- [ ] **Step 8.2: Inngest — update serve URL**

1. Go to [Inngest Cloud → Apps](https://app.inngest.com/apps)
2. Find the Polaris app
3. Update the serve URL to: `https://app.getpolaris.xyz/api/inngest`

- [ ] **Step 8.3: GitHub OAuth App — update callback URL**

1. Go to GitHub → Settings → Developer settings → OAuth Apps → Polaris
2. Update "Authorization callback URL" to: `https://app.getpolaris.xyz/api/github/oauth/callback`
3. Save

- [ ] **Step 8.4: Clerk — add allowed origins**

1. Go to [Clerk Dashboard](https://dashboard.clerk.com) → your application
2. Navigate to **Domains** (or **Allowed redirect origins**)
3. Add `https://getpolaris.xyz` and `https://app.getpolaris.xyz`
4. In **Webhooks**, find the existing endpoint and update the URL to: `https://app.getpolaris.xyz/api/webhooks/clerk`

---

## Task 9: Smoke Tests

Once both domains resolve and TLS is green in Vercel:

- [ ] **Step 9.1: Marketing domain — landing page**

Visit `https://getpolaris.xyz` in a browser.
Expected: marketing landing page renders, no errors in console.

- [ ] **Step 9.2: Marketing domain — redirect**

Visit `https://getpolaris.xyz/dashboard`.
Expected: browser redirects to `https://app.getpolaris.xyz/dashboard`, then Clerk redirects to `/sign-in` (unauthenticated).

- [ ] **Step 9.3: App domain — root redirect**

Visit `https://app.getpolaris.xyz`.
Expected: redirects to `https://app.getpolaris.xyz/dashboard`, then Clerk redirects to `/sign-in`.

- [ ] **Step 9.4: App domain — sign-in page**

Visit `https://app.getpolaris.xyz/sign-in`.
Expected: Clerk sign-in page renders correctly.

- [ ] **Step 9.5: App domain — authenticated access**

Sign in, then visit `https://app.getpolaris.xyz/dashboard`.
Expected: dashboard renders, Convex data loads (check Network tab for `convex.cloud` requests returning 200).

- [ ] **Step 9.6: Health check API**

```bash
curl -s https://app.getpolaris.xyz/api/health | jq .
```

Expected: JSON response with provider statuses, all `"ok": true` (or at worst non-500).

- [ ] **Step 9.7: Sitemap and robots**

```bash
curl -s https://getpolaris.xyz/sitemap.xml | head -5
curl -s https://getpolaris.xyz/robots.txt
```

Expected: sitemap URLs all start with `https://getpolaris.xyz/`, robots.txt shows correct sitemap URL.

---

## Notes

- **Sentry org slug:** `next.config.ts` has `org: "john-doe-fb"` which looks like a placeholder. Source map uploads to Sentry will silently fail until this is updated to the real Sentry org slug. Not blocking for launch but flag it.
- **E2B / Upstash:** Keys are not in `.env.local` — if these services are needed at runtime, add their keys to Vercel env vars before going live.
- **`www.getpolaris.xyz`:** The routing logic handles `www` redirects to the app domain for non-marketing paths. If you want `www` to also serve marketing (i.e., be an alias for the root), add it as a third domain in Vercel and point the `www` CNAME to `cname.vercel-dns.com` (already included in GoDaddy DNS step).
