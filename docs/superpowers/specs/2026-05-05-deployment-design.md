# Deployment Design — getpolaris.xyz + app.getpolaris.xyz

**Date:** 2026-05-05  
**Status:** Approved

---

## Overview

Deploy the Polaris Next.js app to Vercel as a **single project** serving two domains:

| Domain | Content |
|--------|---------|
| `getpolaris.xyz` | Marketing only — `(marketing)` route group |
| `app.getpolaris.xyz` | Everything else — app, auth, API routes |

Backend: Convex functions deployed to a **new production deployment** (separate from the current dev deployment).

---

## 1. Middleware (Subdomain Routing)

A new `src/middleware.ts` composes Clerk's `clerkMiddleware` with subdomain routing logic.

**Routing rules:**

| Host | Path | Action |
|------|------|--------|
| `getpolaris.xyz` | `/`, `/about`, `/pricing`, `/legal/*`, `/status` | Pass through (marketing) |
| `getpolaris.xyz` | Anything else | Redirect to `https://app.getpolaris.xyz{path}` |
| `app.getpolaris.xyz` | `/` | Redirect to `/dashboard` |
| `app.getpolaris.xyz` | `/dashboard/*`, `/projects/*`, `/settings/*` | Clerk auth guard (`auth.protect()`) |
| `app.getpolaris.xyz` | Everything else | Pass through |

**Matcher:** Excludes `_next/static`, `_next/image`, `favicon.ico`, and static file extensions so Vercel's CDN is not interrupted.

**Clerk integration:** `clerkMiddleware` wraps the subdomain logic. Protected routes call `auth.protect()` which redirects unauthenticated users to `/sign-in` on `app.getpolaris.xyz`.

---

## 2. Convex Production Deployment

Run `pnpm convex:deploy` to create a production Convex deployment. This outputs:
- `CONVEX_DEPLOYMENT` (production deployment name)
- `NEXT_PUBLIC_CONVEX_URL` (production Convex URL)

The dev values in `.env.local` remain unchanged for local development. Production values go into Vercel env vars only.

---

## 3. Vercel Project Setup

**Project:** Connected to `abhichat85/polaris` GitHub repo, deploying from `main` branch.

**Environment variables** (set in Vercel dashboard, Production environment):

| Variable | Value |
|----------|-------|
| `CONVEX_DEPLOYMENT` | Production value from `pnpm convex:deploy` |
| `NEXT_PUBLIC_CONVEX_URL` | Production value from `pnpm convex:deploy` |
| `NEXT_PUBLIC_APP_URL` | `https://app.getpolaris.xyz` |
| `NEXT_PUBLIC_MARKETING_URL` | `https://getpolaris.xyz` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Same as `.env.local` |
| `CLERK_SECRET_KEY` | Same as `.env.local` |
| `CLERK_JWT_ISSUER_DOMAIN` | Same as `.env.local` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `/dashboard` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | `/dashboard` |
| `POLARIS_CONVEX_INTERNAL_KEY` | Same as `.env.local` |
| `POLARIS_ENCRYPTION_KEY` | Same as `.env.local` |
| `ANTHROPIC_API_KEY` | Same as `.env.local` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Same as `.env.local` |
| `GITHUB_OAUTH_CLIENT_ID` | Same as `.env.local` |
| `GITHUB_OAUTH_CLIENT_SECRET` | Same as `.env.local` |
| `STRIPE_SECRET_KEY` | Same as `.env.local` |
| `STRIPE_WEBHOOK_SECRET` | Same as `.env.local` |
| `STRIPE_PRICE_PRO_MONTHLY` | Same as `.env.local` |
| `STRIPE_PRICE_TEAM_MONTHLY` | Same as `.env.local` |
| `INNGEST_EVENT_KEY` | Same as `.env.local` |
| `INNGEST_SIGNING_KEY` | Same as `.env.local` |
| `FIRECRAWL_API_KEY` | Same as `.env.local` |
| `SENTRY_DSN` | Same as `.env.local` |
| `NEXT_PUBLIC_SENTRY_DSN` | Same as `.env.local` |

**Custom domains** (both added to the same Vercel project):
- `getpolaris.xyz`
- `app.getpolaris.xyz`

---

## 4. DNS Configuration (GoDaddy)

Records to add in GoDaddy DNS panel for `getpolaris.xyz`:

| Type | Name | Value |
|------|------|-------|
| `A` | `@` | `76.76.21.21` |
| `CNAME` | `www` | `cname.vercel-dns.com` |
| `CNAME` | `app` | `cname.vercel-dns.com` |

Vercel auto-provisions TLS for both domains. DNS propagation is typically under 10 minutes with Vercel's IPs; up to 48h in worst case.

---

## 5. Code Changes

### 5a. New file: `src/middleware.ts`

Implements the subdomain routing table from Section 1, composing with `clerkMiddleware` from `@clerk/nextjs/server`.

### 5b. URL reference updates

| File | Change |
|------|--------|
| `src/app/robots.ts` | Switch from `NEXT_PUBLIC_APP_URL` to `NEXT_PUBLIC_MARKETING_URL`; fallback → `https://getpolaris.xyz` |
| `src/app/sitemap.ts` | Switch from `NEXT_PUBLIC_APP_URL` to `NEXT_PUBLIC_MARKETING_URL`; fallback → `https://getpolaris.xyz` |
| `src/app/(marketing)/layout.tsx` | OpenGraph `url` hardcode → `https://getpolaris.xyz` |
| `src/features/marketing/components/footer.tsx` | Display text `build.praxiomai.xyz` → `app.getpolaris.xyz` |
| `src/lib/scaffold/runtime-tap-injection.ts` | Fallback `https://build.praxiomai.xyz` → `https://app.getpolaris.xyz` |
| `src/app/api/webhooks/clerk/route.ts` | Update stale URL comment → `https://app.getpolaris.xyz/api/webhooks/clerk` |

### 5c. Marketing URL env var usage

`robots.ts` and `sitemap.ts` currently read from `process.env.NEXT_PUBLIC_APP_URL`. After this deployment that variable points to `app.getpolaris.xyz`, which is wrong for SEO/sitemap purposes. They are switched to `process.env.NEXT_PUBLIC_MARKETING_URL` (fallback `https://getpolaris.xyz`).

### 5d. New Vercel env var: `NEXT_PUBLIC_POLARIS_ORIGIN`

`src/lib/scaffold/runtime-tap-injection.ts` reads `process.env.NEXT_PUBLIC_POLARIS_ORIGIN`. Add this to Vercel env vars:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_POLARIS_ORIGIN` | `https://app.getpolaris.xyz` |

---

## 6. External Webhook Updates

After the Vercel deployment is live, update webhook endpoints in external service dashboards:

| Service | Setting | New URL |
|---------|---------|---------|
| Stripe | Webhook endpoint | `https://app.getpolaris.xyz/api/webhooks` |
| Inngest | Serve URL | `https://app.getpolaris.xyz/api/inngest` |
| GitHub OAuth App | Callback URL | `https://app.getpolaris.xyz/api/github/oauth/callback` |
| Clerk | Allowed redirect URLs | Add `https://app.getpolaris.xyz` |

---

## 7. Out of Scope

- Sentry org slug (`next.config.ts` shows `org: "john-doe-fb"`) — needs updating separately for source map uploads to work correctly.
- E2B / Upstash Redis keys — not in `.env.local` currently; add to Vercel if needed at runtime.
- CI/CD pipeline — Vercel's GitHub integration handles automatic deploys on push to `main`.

---

## Success Criteria

- `https://getpolaris.xyz` renders the marketing landing page
- `https://getpolaris.xyz/dashboard` redirects to `https://app.getpolaris.xyz/dashboard`
- `https://app.getpolaris.xyz` redirects to `https://app.getpolaris.xyz/dashboard`
- `https://app.getpolaris.xyz/dashboard` requires auth (redirects to `/sign-in` if unauthenticated)
- `https://app.getpolaris.xyz/sign-in` renders the Clerk sign-in page
- Both domains have valid TLS certificates
- Convex backend is connected to the production deployment
