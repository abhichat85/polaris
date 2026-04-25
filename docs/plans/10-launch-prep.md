# Sub-Plan 10 — Launch Prep

> **Authority:** Derives from `docs/CONSTITUTION.md` (esp. Articles I §1.5, II §2.7, V, XVIII) and `docs/ROADMAP.md` Phase 4 Days 14-17.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship Polaris from "feature complete" to "first 50 invited beta users can sign up, onboard, build, deploy, ask questions, and trust us with their data" — without skipping the legal, operational, and brand foundations the constitution mandates. By the end of this sub-plan, `build.praxiomai.xyz` is live, `status.praxiomai.xyz` is monitored, every legal page is in place, GDPR rights are honored by working code (export + delete, not just policy), the cookie banner respects opt-outs, the marketing site renders without IDE chrome, and the soft-launch checklist is fully ticked.

**Architecture:** Marketing route group `(marketing)` lives next to `(app)` in the App Router but uses its own `layout.tsx` with no IDE shell — just header, footer, and `<main>`. Onboarding is its own feature module (`src/features/onboarding/`) backed by a small Convex `user_profiles` table that stores resume state. GDPR export and account deletion are server route handlers that fan out across every Convex table the user owns and external providers (Stripe, Clerk, E2B, Vercel, Supabase, GitHub). Status monitoring proxies upstream provider health checks through `/api/health/[provider]/route.ts` so the public status page never leaks our API keys. Beta gating uses Clerk's allowlist; non-listed signups are diverted to a Convex `waitlist` table.

**Tech Stack:** Next.js App Router (route groups), Convex (`user_profiles`, `waitlist` tables), Clerk (allowlist + webhook), `@floating-ui/react` (onboarding tour), `react-markdown` (legal pages), Stripe API (subscription cancel on delete), `nodemailer` or Resend (deletion confirmation email), BetterStack (status page), Sentry (already integrated — wire opt-in here), `vitest` + `@playwright/test` (tests), `zod` (request validation).

**Phase:** 4 — Launch (Days 14-17 of 17-day plan).

**Constitution articles you must re-read before starting:**
- Article I §1.5 (competitive positioning, "Polaris by Praxiom" branding)
- Article II §2.7 (free-tier honesty — pricing copy must match runtime enforcement from sub-plan 08)
- Article V (stack — no analytics SaaS in v1, Convex-native telemetry only)
- Article XVIII (Praxiom integration contract — schema fields exist, badge is a stub link)
- Article XIX §19.x (any data-export / deletion ordering rules for cascades)

---

## Table of Contents

- [File Structure](#file-structure)
- [Task 1: user_profiles + waitlist Convex Schema](#task-1-user_profiles--waitlist-convex-schema)
- [Task 2: Convex Functions for Onboarding State and Waitlist](#task-2-convex-functions-for-onboarding-state-and-waitlist)
- [Task 3: Clerk Allowlist + Beta Gating Webhook](#task-3-clerk-allowlist--beta-gating-webhook)
- [Task 4: WelcomeFlow Multi-Step Component](#task-4-welcomeflow-multi-step-component)
- [Task 5: StarterPrompts Component](#task-5-starterprompts-component)
- [Task 6: FirstProjectGuide Tour Overlay](#task-6-firstprojectguide-tour-overlay)
- [Task 7: OnboardingComplete Hook + Redirect Guard](#task-7-onboardingcomplete-hook--redirect-guard)
- [Task 8: Marketing Route Group Layout](#task-8-marketing-route-group-layout)
- [Task 9: Landing Page](#task-9-landing-page)
- [Task 10: Pricing Page](#task-10-pricing-page)
- [Task 11: About Page + Footer Component](#task-11-about-page--footer-component)
- [Task 12: Legal Pages (Terms / Privacy / DPA / Cookies)](#task-12-legal-pages)
- [Task 13: Cookie Consent Banner](#task-13-cookie-consent-banner)
- [Task 14: GDPR Data Export Endpoint](#task-14-gdpr-data-export-endpoint)
- [Task 15: Account Deletion Endpoint](#task-15-account-deletion-endpoint)
- [Task 16: Account Settings UI Wiring](#task-16-account-settings-ui-wiring)
- [Task 17: Internal Health Probe Endpoints](#task-17-internal-health-probe-endpoints)
- [Task 18: Status Page Provider Configuration](#task-18-status-page-provider-configuration)
- [Task 19: Support Inbox + SLA Document](#task-19-support-inbox--sla-document)
- [Task 20: Telemetry Convex Queries](#task-20-telemetry-convex-queries)
- [Task 21: DNS Cutover Checklist](#task-21-dns-cutover-checklist)
- [Task 22: Soft Launch Checklist](#task-22-soft-launch-checklist)
- [Task 23: End-to-End Launch Rehearsal](#task-23-end-to-end-launch-rehearsal)

---

## File Structure

### Files to create

```
convex/user_profiles.ts                                              ← NEW: onboarding state queries/mutations
convex/waitlist.ts                                                   ← NEW: waitlist enroll mutation + admin list query
convex/account.ts                                                    ← NEW: cascade-delete + export-bundle helpers (internal mutations)

src/features/onboarding/components/welcome-flow.tsx                  ← NEW
src/features/onboarding/components/starter-prompts.tsx               ← NEW
src/features/onboarding/components/first-project-guide.tsx           ← NEW
src/features/onboarding/components/onboarding-complete.tsx           ← NEW (server side hook caller)
src/features/onboarding/lib/starter-prompt-catalog.ts                ← NEW: 3 hand-picked prompts + thumbnails
src/features/onboarding/lib/tour-steps.ts                            ← NEW: tooltip tour step defs

src/features/marketing/components/footer.tsx                         ← NEW
src/features/marketing/components/cookie-consent.tsx                 ← NEW
src/features/marketing/components/marketing-header.tsx               ← NEW
src/features/marketing/components/feature-blurb.tsx                  ← NEW
src/features/marketing/components/pricing-card.tsx                   ← NEW (display-only mirror of PlanPicker)
src/features/marketing/lib/cookie-storage.ts                         ← NEW: localStorage abstraction for consent

src/app/(marketing)/layout.tsx                                       ← NEW: no IDE chrome
src/app/(marketing)/page.tsx                                         ← NEW: landing
src/app/(marketing)/pricing/page.tsx                                 ← NEW
src/app/(marketing)/about/page.tsx                                   ← NEW
src/app/(marketing)/legal/terms/page.tsx                             ← NEW
src/app/(marketing)/legal/privacy/page.tsx                           ← NEW
src/app/(marketing)/legal/dpa/page.tsx                               ← NEW
src/app/(marketing)/legal/cookies/page.tsx                           ← NEW
src/app/(marketing)/legal/_lib/legal-layout.tsx                      ← NEW: shared prose wrapper

src/app/api/account/export/route.ts                                  ← NEW: GET, streams JSON
src/app/api/account/delete/route.ts                                  ← NEW: DELETE, two-phase
src/app/api/account/delete/confirm/route.ts                          ← NEW: GET, token confirmation landing
src/app/api/health/anthropic/route.ts                                ← NEW
src/app/api/health/e2b/route.ts                                      ← NEW
src/app/api/health/convex/route.ts                                   ← NEW
src/app/api/health/vercel/route.ts                                   ← NEW
src/app/api/health/supabase/route.ts                                 ← NEW
src/app/api/clerk/webhook/route.ts                                   ← NEW (or extend if exists): allowlist + waitlist routing
src/app/api/waitlist/route.ts                                        ← NEW: POST, public, captures email

docs/launch-dns-cutover.md                                           ← NEW
docs/launch-checklist.md                                             ← NEW
docs/legal-templates/                                                ← NEW: source markdown for legal pages
docs/legal-templates/terms.md                                        ← NEW
docs/legal-templates/privacy.md                                      ← NEW
docs/legal-templates/dpa.md                                          ← NEW
docs/legal-templates/cookies.md                                      ← NEW
docs/support-sla.md                                                  ← NEW

tests/unit/account/export-completeness.test.ts                       ← NEW
tests/unit/account/delete-cascade.test.ts                            ← NEW
tests/unit/onboarding/welcome-flow.test.tsx                          ← NEW
tests/unit/onboarding/starter-prompts.test.tsx                       ← NEW
tests/unit/marketing/cookie-consent.test.tsx                         ← NEW
tests/unit/marketing/cookie-storage.test.ts                          ← NEW
tests/unit/health/probes.test.ts                                     ← NEW
tests/e2e/onboarding.spec.ts                                         ← NEW
tests/e2e/account-deletion.spec.ts                                   ← NEW
```

### Files to modify

```
convex/schema.ts                                                     ← Add user_profiles, waitlist tables
src/app/(app)/layout.tsx                                             ← Add onboarding redirect guard
src/middleware.ts                                                    ← Allow marketing + waitlist routes for unauthenticated
src/features/billing/components/account-settings.tsx                 ← Add Export Data + Delete Account buttons (sub-plan 08 file)
.env.example                                                         ← Add SUPPORT_EMAIL, BETTERSTACK_KEY, RESEND_API_KEY, NEXT_PUBLIC_PRAXIOM_URL
package.json                                                         ← Add @floating-ui/react, react-markdown, resend (or nodemailer)
```

---

## Task 1: user_profiles + waitlist Convex Schema

**Why first:** The onboarding flow, the beta gate, the redirect guard, and the GDPR export all read from `user_profiles`. Get the table shape locked before any UI work.

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1.1: Add `user_profiles` table**

```typescript
// convex/schema.ts (excerpt)
user_profiles: defineTable({
  userId: v.string(),                       // Clerk user id
  onboardingComplete: v.boolean(),
  onboardingStep: v.union(
    v.literal("greeting"),
    v.literal("starter_prompts"),
    v.literal("first_project"),
    v.literal("done"),
  ),
  selectedStarterPromptId: v.optional(v.string()),
  firstProjectId: v.optional(v.id("projects")),
  cookieConsent: v.optional(v.object({
    essential: v.boolean(),                 // always true; recorded for audit
    analytics: v.boolean(),
    sentry: v.boolean(),
    decidedAt: v.number(),
  })),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_user", ["userId"]),
```

- [ ] **Step 1.2: Add `waitlist` table**

```typescript
waitlist: defineTable({
  email: v.string(),
  source: v.optional(v.string()),           // "signup_rejected" | "landing_form"
  notes: v.optional(v.string()),
  invitedAt: v.optional(v.number()),
  createdAt: v.number(),
}).index("by_email", ["email"]),
```

- [ ] **Step 1.3: Push schema**

```bash
npx convex dev --once
```

Expected: schema applies without conflict. If a `user_profiles` table already exists from earlier scaffolding, reconcile fields by hand — do NOT drop it.

- [ ] **Step 1.4: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(convex): add user_profiles and waitlist tables"
```

---

## Task 2: Convex Functions for Onboarding State and Waitlist

**Files:**
- Create: `convex/user_profiles.ts`
- Create: `convex/waitlist.ts`

- [ ] **Step 2.1: `user_profiles.ts` — get + ensure**

```typescript
// convex/user_profiles.ts
import { v } from "convex/values"
import { query, mutation } from "./_generated/server"

export const getForCurrentUser = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("user_profiles")
      .withIndex("by_user", q => q.eq("userId", userId))
      .unique()
  },
})

export const ensure = mutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const existing = await ctx.db
      .query("user_profiles")
      .withIndex("by_user", q => q.eq("userId", userId))
      .unique()
    if (existing) return existing._id
    const now = Date.now()
    return await ctx.db.insert("user_profiles", {
      userId,
      onboardingComplete: false,
      onboardingStep: "greeting",
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const setStep = mutation({
  args: {
    userId: v.string(),
    step: v.union(
      v.literal("greeting"),
      v.literal("starter_prompts"),
      v.literal("first_project"),
      v.literal("done"),
    ),
    selectedStarterPromptId: v.optional(v.string()),
    firstProjectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("user_profiles")
      .withIndex("by_user", q => q.eq("userId", args.userId))
      .unique()
    if (!profile) throw new Error("Profile not found")
    await ctx.db.patch(profile._id, {
      onboardingStep: args.step,
      onboardingComplete: args.step === "done",
      ...(args.selectedStarterPromptId && { selectedStarterPromptId: args.selectedStarterPromptId }),
      ...(args.firstProjectId && { firstProjectId: args.firstProjectId }),
      updatedAt: Date.now(),
    })
  },
})

export const setCookieConsent = mutation({
  args: {
    userId: v.string(),
    essential: v.boolean(),
    analytics: v.boolean(),
    sentry: v.boolean(),
  },
  handler: async (ctx, { userId, essential, analytics, sentry }) => {
    const profile = await ctx.db
      .query("user_profiles")
      .withIndex("by_user", q => q.eq("userId", userId))
      .unique()
    if (!profile) return
    await ctx.db.patch(profile._id, {
      cookieConsent: { essential, analytics, sentry, decidedAt: Date.now() },
      updatedAt: Date.now(),
    })
  },
})
```

- [ ] **Step 2.2: `waitlist.ts` — enroll**

```typescript
// convex/waitlist.ts
import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

export const enroll = mutation({
  args: { email: v.string(), source: v.optional(v.string()) },
  handler: async (ctx, { email, source }) => {
    const normalized = email.trim().toLowerCase()
    const existing = await ctx.db
      .query("waitlist")
      .withIndex("by_email", q => q.eq("email", normalized))
      .unique()
    if (existing) return existing._id
    return await ctx.db.insert("waitlist", {
      email: normalized,
      source,
      createdAt: Date.now(),
    })
  },
})

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    return await ctx.db.query("waitlist").order("desc").take(limit ?? 200)
  },
})
```

- [ ] **Step 2.3: Commit**

```bash
git add convex/user_profiles.ts convex/waitlist.ts
git commit -m "feat(convex): user_profiles + waitlist mutations and queries"
```

---

## Task 3: Clerk Allowlist + Beta Gating Webhook

**Why now:** No invited-only soft launch without this. Clerk has a built-in allowlist; we still need a webhook to (a) auto-create `user_profiles` on signup and (b) catch attempted-but-rejected signups and route them to the waitlist.

**Files:**
- Create / modify: `src/app/api/clerk/webhook/route.ts`
- Create: `src/app/api/waitlist/route.ts`

- [ ] **Step 3.1: Configure Clerk allowlist via dashboard**

In Clerk Dashboard → User & Authentication → Restrictions:
- Toggle "Allowlist" ON.
- Toggle "Block sign-ups not in allowlist" ON.
- Paste the 50 invited emails (one per line). Source of truth for the list lives in `docs/launch-checklist.md` — see Task 22.

- [ ] **Step 3.2: Webhook endpoint with svix verification**

```typescript
// src/app/api/clerk/webhook/route.ts
import { Webhook } from "svix"
import { headers } from "next/headers"
import { fetchMutation } from "convex/nextjs"
import { api } from "@/../convex/_generated/api"

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET
  if (!secret) return new Response("no secret", { status: 500 })

  const payload = await req.text()
  const h = await headers()
  const wh = new Webhook(secret)
  let evt: any
  try {
    evt = wh.verify(payload, {
      "svix-id": h.get("svix-id")!,
      "svix-timestamp": h.get("svix-timestamp")!,
      "svix-signature": h.get("svix-signature")!,
    })
  } catch {
    return new Response("bad sig", { status: 400 })
  }

  if (evt.type === "user.created") {
    await fetchMutation(api.user_profiles.ensure, { userId: evt.data.id })
  }
  // Clerk emits "user.createdAttempt.blocked" or similar when allowlist rejects;
  // routed through Clerk dashboard "Restrictions" feature -> custom redirect URL.
  return new Response("ok")
}
```

- [ ] **Step 3.3: Public waitlist endpoint**

```typescript
// src/app/api/waitlist/route.ts
import { z } from "zod"
import { fetchMutation } from "convex/nextjs"
import { api } from "@/../convex/_generated/api"

const Body = z.object({
  email: z.string().email(),
  source: z.string().max(64).optional(),
})

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) return Response.json({ error: "invalid email" }, { status: 400 })
  await fetchMutation(api.waitlist.enroll, parsed.data)
  return Response.json({ ok: true })
}
```

- [ ] **Step 3.4: Sign-in / sign-up rejection page**

Clerk's allowlist denial fires a `user_locked` or rejection redirect. In `src/app/sign-up/[[...sign-up]]/page.tsx` (or the Clerk-mounted page), pass `afterSignUpUrl="/welcome"` and configure a fallback redirect to `/beta-closed?email=...` when blocked. Build a tiny page:

`src/app/beta-closed/page.tsx` — shows the message "Polaris is in private beta. Get notified when we open up." with an `<input type="email">` posting to `/api/waitlist`.

- [ ] **Step 3.5: Middleware allowance**

```typescript
// src/middleware.ts (excerpt)
const PUBLIC = createRouteMatcher([
  "/", "/pricing", "/about", "/legal/(.*)",
  "/sign-in(.*)", "/sign-up(.*)", "/beta-closed",
  "/api/waitlist", "/api/clerk/webhook", "/api/health/(.*)",
])
```

- [ ] **Step 3.6: Commit**

```bash
git add src/app/api/clerk/webhook/route.ts src/app/api/waitlist/route.ts \
        src/app/beta-closed/page.tsx src/middleware.ts
git commit -m "feat(auth): Clerk webhook + waitlist routing + middleware allowances"
```

---

## Task 4: WelcomeFlow Multi-Step Component

**Files:**
- Create: `src/features/onboarding/components/welcome-flow.tsx`
- Test: `tests/unit/onboarding/welcome-flow.test.tsx`

- [ ] **Step 4.1: Failing test — renders greeting when step is "greeting"**

```typescript
// tests/unit/onboarding/welcome-flow.test.tsx
import { render, screen } from "@testing-library/react"
import { WelcomeFlow } from "@/features/onboarding/components/welcome-flow"

vi.mock("convex/react", () => ({
  useQuery: () => ({ onboardingStep: "greeting", onboardingComplete: false }),
  useMutation: () => vi.fn(),
}))

it("renders greeting copy when step is greeting", () => {
  render(<WelcomeFlow userId="u1" />)
  expect(screen.getByText(/Welcome to Polaris/i)).toBeInTheDocument()
})

it("renders StarterPrompts when step is starter_prompts", () => {
  vi.doMock("convex/react", () => ({
    useQuery: () => ({ onboardingStep: "starter_prompts", onboardingComplete: false }),
    useMutation: () => vi.fn(),
  }))
  // re-import inside test ...
})
```

- [ ] **Step 4.2: Implement `WelcomeFlow`**

```typescript
// src/features/onboarding/components/welcome-flow.tsx
"use client"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/../convex/_generated/api"
import { StarterPrompts } from "./starter-prompts"
import { FirstProjectGuide } from "./first-project-guide"

export function WelcomeFlow({ userId }: { userId: string }) {
  const profile = useQuery(api.user_profiles.getForCurrentUser, { userId })
  const setStep = useMutation(api.user_profiles.setStep)

  if (profile === undefined) return null
  if (!profile || profile.onboardingComplete) return null

  switch (profile.onboardingStep) {
    case "greeting":
      return (
        <Greeting
          onContinue={() => setStep({ userId, step: "starter_prompts" })}
        />
      )
    case "starter_prompts":
      return <StarterPrompts userId={userId} />
    case "first_project":
      return <FirstProjectGuide userId={userId} />
    default:
      return null
  }
}

function Greeting({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur">
      <div className="max-w-lg space-y-6 text-center">
        <h1 className="text-3xl font-semibold">Welcome to Polaris</h1>
        <p className="text-muted-foreground">
          The AI cloud IDE for spec-driven development. Describe what you want
          to build; iterate with the agent; ship.
        </p>
        <button onClick={onContinue} className="btn-primary">Get started</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4.3: Make tests pass; commit**

```bash
git add src/features/onboarding/components/welcome-flow.tsx \
        tests/unit/onboarding/welcome-flow.test.tsx
git commit -m "feat(onboarding): WelcomeFlow step orchestrator"
```

---

## Task 5: StarterPrompts Component

**Files:**
- Create: `src/features/onboarding/lib/starter-prompt-catalog.ts`
- Create: `src/features/onboarding/components/starter-prompts.tsx`
- Test: `tests/unit/onboarding/starter-prompts.test.tsx`

- [ ] **Step 5.1: Catalog**

```typescript
// src/features/onboarding/lib/starter-prompt-catalog.ts
export interface StarterPrompt {
  id: string
  title: string
  prompt: string
  thumbnail: string  // /onboarding/thumbs/{id}.png — shipped in /public
}

export const STARTER_PROMPTS: StarterPrompt[] = [
  {
    id: "task-tracker",
    title: "Personal Task Tracker",
    prompt: "Build a personal task tracker with categories, due dates, and a clean kanban view. Use Next.js, Tailwind, and Convex for storage.",
    thumbnail: "/onboarding/thumbs/task-tracker.png",
  },
  {
    id: "feedback-tool",
    title: "Team Feedback Tool",
    prompt: "Build a team feedback tool where members can post anonymous feedback, react with emojis, and threading on responses.",
    thumbnail: "/onboarding/thumbs/feedback-tool.png",
  },
  {
    id: "invoice-generator",
    title: "Simple Invoice Generator",
    prompt: "Build a simple invoice generator: form for line items, computed totals, downloadable PDF, saved invoices list.",
    thumbnail: "/onboarding/thumbs/invoice-generator.png",
  },
]
```

- [ ] **Step 5.2: Failing test**

```typescript
// tests/unit/onboarding/starter-prompts.test.tsx
it("renders 3 prompt cards", () => {
  render(<StarterPrompts userId="u1" />)
  expect(screen.getAllByRole("button", { name: /Use this prompt/i })).toHaveLength(3)
})

it("calls createProject mutation on selection", async () => {
  const create = vi.fn().mockResolvedValue({ projectId: "p1" })
  // mock useMutation to return create
  render(<StarterPrompts userId="u1" />)
  await userEvent.click(screen.getAllByRole("button", { name: /Use this prompt/i })[0])
  expect(create).toHaveBeenCalledWith(expect.objectContaining({
    initialPrompt: expect.stringContaining("task tracker"),
  }))
})
```

- [ ] **Step 5.3: Component**

```typescript
"use client"
import { useRouter } from "next/navigation"
import { useMutation } from "convex/react"
import Image from "next/image"
import { api } from "@/../convex/_generated/api"
import { STARTER_PROMPTS } from "../lib/starter-prompt-catalog"

export function StarterPrompts({ userId }: { userId: string }) {
  const setStep = useMutation(api.user_profiles.setStep)
  const createProject = useMutation(api.projects.createWithInitialPrompt)
  const router = useRouter()

  async function pick(id: string, prompt: string) {
    const { projectId } = await createProject({ initialPrompt: prompt })
    await setStep({
      userId,
      step: "first_project",
      selectedStarterPromptId: id,
      firstProjectId: projectId,
    })
    router.push(`/projects/${projectId}`)
  }

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {STARTER_PROMPTS.map(p => (
        <article key={p.id} className="rounded-lg border p-4">
          <Image src={p.thumbnail} alt="" width={400} height={240} />
          <h3 className="mt-2 font-medium">{p.title}</h3>
          <p className="text-sm text-muted-foreground">{p.prompt}</p>
          <button onClick={() => pick(p.id, p.prompt)} className="btn-primary mt-3">
            Use this prompt
          </button>
        </article>
      ))}
    </div>
  )
}
```

- [ ] **Step 5.4: Add 3 thumbnail PNGs**

Drop placeholder 400×240 PNGs at `public/onboarding/thumbs/{id}.png`. Real screenshots can be swapped in by design before launch — placeholders unblock dev.

- [ ] **Step 5.5: Commit**

```bash
git add src/features/onboarding/lib/starter-prompt-catalog.ts \
        src/features/onboarding/components/starter-prompts.tsx \
        public/onboarding/thumbs/ \
        tests/unit/onboarding/starter-prompts.test.tsx
git commit -m "feat(onboarding): StarterPrompts with 3 hand-picked prompts"
```

---

## Task 6: FirstProjectGuide Tour Overlay

**Files:**
- Install: `@floating-ui/react`
- Create: `src/features/onboarding/lib/tour-steps.ts`
- Create: `src/features/onboarding/components/first-project-guide.tsx`

- [ ] **Step 6.1: Install dependency**

```bash
npm install @floating-ui/react
```

- [ ] **Step 6.2: Tour steps**

```typescript
// src/features/onboarding/lib/tour-steps.ts
export interface TourStep {
  selector: string         // CSS selector targeting an element rendered in the project page
  title: string
  body: string
  placement: "top" | "bottom" | "left" | "right"
}

export const TOUR_STEPS: TourStep[] = [
  { selector: "[data-tour='chat-panel']",   title: "Chat with the agent", body: "Describe changes; the agent edits files for you.", placement: "right" },
  { selector: "[data-tour='editor']",       title: "Code editor",         body: "Edit any file directly. Changes round-trip with the agent.", placement: "bottom" },
  { selector: "[data-tour='preview']",      title: "Live preview",        body: "Your app runs in a sandbox and reloads on every change.", placement: "left" },
  { selector: "[data-tour='spec-panel']",   title: "Spec panel",          body: "Capture intent. The agent works against your spec.", placement: "left" },
]
```

- [ ] **Step 6.3: Component**

```typescript
"use client"
import { useEffect, useState } from "react"
import { useFloating, offset, shift, flip, autoUpdate } from "@floating-ui/react"
import { useMutation } from "convex/react"
import { api } from "@/../convex/_generated/api"
import { TOUR_STEPS } from "../lib/tour-steps"

export function FirstProjectGuide({ userId }: { userId: string }) {
  const [idx, setIdx] = useState(0)
  const [target, setTarget] = useState<Element | null>(null)
  const setStep = useMutation(api.user_profiles.setStep)

  useEffect(() => {
    setTarget(document.querySelector(TOUR_STEPS[idx].selector))
  }, [idx])

  const { refs, floatingStyles } = useFloating({
    placement: TOUR_STEPS[idx].placement,
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
    elements: { reference: target ?? undefined },
  })

  if (!target) return null
  const step = TOUR_STEPS[idx]
  const isLast = idx === TOUR_STEPS.length - 1

  return (
    <div ref={refs.setFloating} style={floatingStyles}
         className="z-50 max-w-xs rounded-md border bg-popover p-3 shadow-lg">
      <h4 className="font-medium">{step.title}</h4>
      <p className="text-sm text-muted-foreground">{step.body}</p>
      <div className="mt-3 flex justify-between gap-2">
        <button onClick={() => setStep({ userId, step: "done" })} className="text-xs">
          Skip tour
        </button>
        <button
          onClick={() =>
            isLast ? setStep({ userId, step: "done" }) : setIdx(idx + 1)
          }
          className="btn-primary text-xs"
        >
          {isLast ? "Finish" : "Next"}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 6.4: Add `data-tour` attributes to project page targets**

In `src/app/(app)/projects/[id]/page.tsx` (or wherever the IDE shell lives), add `data-tour` attributes on the chat panel, editor, preview, and spec panel containers. Without these, the tour silently no-ops — file an issue if a target is missing rather than guessing.

- [ ] **Step 6.5: Commit**

```bash
git add package.json package-lock.json \
        src/features/onboarding/lib/tour-steps.ts \
        src/features/onboarding/components/first-project-guide.tsx \
        src/app/(app)/projects/
git commit -m "feat(onboarding): FirstProjectGuide tooltip tour"
```

---

## Task 7: OnboardingComplete Hook + Redirect Guard

**Why:** Returning users with `onboardingComplete=false` should re-enter the flow at their last step; brand-new users should land in `/welcome` not `/projects`.

**Files:**
- Create: `src/features/onboarding/components/onboarding-complete.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 7.1: Add a server-side guard**

```typescript
// src/app/(app)/layout.tsx (excerpt)
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { fetchQuery } from "convex/nextjs"
import { api } from "@/../convex/_generated/api"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")
  const profile = await fetchQuery(api.user_profiles.getForCurrentUser, { userId })
  if (!profile || !profile.onboardingComplete) redirect("/welcome")
  return <>{children}</>
}
```

- [ ] **Step 7.2: Create `/welcome` page**

```typescript
// src/app/(app)/welcome/page.tsx
import { auth } from "@clerk/nextjs/server"
import { WelcomeFlow } from "@/features/onboarding/components/welcome-flow"

export default async function WelcomePage() {
  const { userId } = await auth()
  if (!userId) return null
  return <WelcomeFlow userId={userId} />
}
```

(Note: `/welcome` is exempt from the redirect-to-welcome rule; the layout above checks `redirect("/welcome")` only when accessing `/projects`-style routes — restructure path matching if needed.)

- [ ] **Step 7.3: Commit**

```bash
git add src/app/(app)/layout.tsx src/app/(app)/welcome/page.tsx
git commit -m "feat(onboarding): redirect guard + /welcome entry"
```

---

## Task 8: Marketing Route Group Layout

**Files:**
- Create: `src/app/(marketing)/layout.tsx`
- Create: `src/features/marketing/components/marketing-header.tsx`

- [ ] **Step 8.1: Layout**

```typescript
// src/app/(marketing)/layout.tsx
import { MarketingHeader } from "@/features/marketing/components/marketing-header"
import { Footer } from "@/features/marketing/components/footer"
import { CookieConsent } from "@/features/marketing/components/cookie-consent"

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <Footer />
      <CookieConsent />
    </div>
  )
}
```

- [ ] **Step 8.2: Header**

```typescript
// src/features/marketing/components/marketing-header.tsx
import Link from "next/link"

export function MarketingHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-semibold">Polaris</Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/pricing">Pricing</Link>
          <Link href="/about">About</Link>
          <Link href="https://status.praxiomai.xyz" target="_blank">Status</Link>
          <Link href="/sign-in" className="btn-primary">Sign in</Link>
        </nav>
      </div>
    </header>
  )
}
```

- [ ] **Step 8.3: Commit**

```bash
git add src/app/(marketing)/layout.tsx src/features/marketing/components/marketing-header.tsx
git commit -m "feat(marketing): route group layout without IDE chrome"
```

---

## Task 9: Landing Page

**Files:**
- Create: `src/app/(marketing)/page.tsx`
- Create: `src/features/marketing/components/feature-blurb.tsx`

- [ ] **Step 9.1: Feature blurb component**

```typescript
// src/features/marketing/components/feature-blurb.tsx
export function FeatureBlurb({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  )
}
```

- [ ] **Step 9.2: Landing page sections**

```typescript
// src/app/(marketing)/page.tsx
import Link from "next/link"
import { FeatureBlurb } from "@/features/marketing/components/feature-blurb"

export default function LandingPage() {
  return (
    <>
      <section className="mx-auto max-w-4xl px-6 py-24 text-center">
        <h1 className="text-5xl font-semibold tracking-tight">
          AI cloud IDE for spec-driven development
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Describe what you want to build. Iterate with the agent. Ship to production.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/sign-up" className="btn-primary">Sign up</Link>
          <Link href="/pricing" className="btn-secondary">See pricing</Link>
        </div>
        <div className="mt-12 aspect-video rounded-lg border bg-muted">
          {/* TODO: replace with actual screencast iframe or <video> tag once recorded */}
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Demo video — coming soon
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-4xl gap-8 px-6 py-16 md:grid-cols-3">
        <FeatureBlurb title="Generate" body="From prompt to working app in one turn." />
        <FeatureBlurb title="Iterate" body="Refine with the agent until it matches your spec." />
        <FeatureBlurb title="Ship"     body="Deploy to Vercel from a button. GitHub round-trips for free." />
      </section>

      <section className="mx-auto max-w-4xl px-6 py-16">
        <h2 className="text-2xl font-semibold">FAQ</h2>
        <dl className="mt-6 space-y-4">
          <Faq q="Is Polaris free to try?" a="Yes — the free tier includes 5 messages per day, no credit card required." />
          <Faq q="What models do you use?" a="Claude Sonnet by default. GPT-5 and Gemini 2.5 are stubs in v1." />
          <Faq q="Can I export my code?" a="Yes — connect GitHub on any plan and round-trip your project." />
          <Faq q="How is my data handled?" a="See our Privacy Policy and DPA. Your code is processed by AI providers per their terms." />
        </dl>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-16 text-center">
        <h2 className="text-2xl font-semibold">Pricing</h2>
        <p className="text-muted-foreground">Free, Pro, Team. <Link href="/pricing" className="underline">See full pricing →</Link></p>
      </section>
    </>
  )
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-md border p-4">
      <dt className="font-medium">{q}</dt>
      <dd className="mt-1 text-sm text-muted-foreground">{a}</dd>
    </div>
  )
}
```

- [ ] **Step 9.3: Commit**

```bash
git add src/app/(marketing)/page.tsx src/features/marketing/components/feature-blurb.tsx
git commit -m "feat(marketing): landing page with hero, features, FAQ, pricing teaser"
```

---

## Task 10: Pricing Page

**Files:**
- Create: `src/features/marketing/components/pricing-card.tsx`
- Create: `src/app/(marketing)/pricing/page.tsx`

- [ ] **Step 10.1: Pricing card (display-only mirror of `PlanPicker` from sub-plan 08)**

```typescript
// src/features/marketing/components/pricing-card.tsx
import Link from "next/link"

export interface PricingTier {
  name: string
  price: string
  bullets: string[]
  cta: string
  href: string
  highlighted?: boolean
}

export function PricingCard({ tier }: { tier: PricingTier }) {
  return (
    <div className={`rounded-lg border p-6 ${tier.highlighted ? "ring-2 ring-primary" : ""}`}>
      <h3 className="text-lg font-medium">{tier.name}</h3>
      <p className="mt-2 text-3xl font-semibold">{tier.price}</p>
      <ul className="mt-4 space-y-2 text-sm">
        {tier.bullets.map(b => <li key={b}>• {b}</li>)}
      </ul>
      <Link href={tier.href} className="btn-primary mt-6 block text-center">
        {tier.cta}
      </Link>
    </div>
  )
}
```

- [ ] **Step 10.2: Pricing page — must match runtime enforcement**

> **CONSTITUTION §2.7 — free-tier honesty.** Numbers below MUST match the limits enforced in sub-plan 08's `usage` policy. If they drift, free-tier users will hit caps that don't match what we advertised. Run `npm run test:unit -- billing` to verify usage limits before publishing.

```typescript
// src/app/(marketing)/pricing/page.tsx
import { PricingCard, PricingTier } from "@/features/marketing/components/pricing-card"

const TIERS: PricingTier[] = [
  {
    name: "Free",
    price: "$0",
    bullets: [
      "5 agent messages / day",
      "1 active project",
      "Public deploys to *.polaris.app",
      "GitHub round-trip",
    ],
    cta: "Sign up",
    href: "/sign-up",
  },
  {
    name: "Pro",
    price: "$20/mo",
    bullets: [
      "Unlimited agent messages (fair use)",
      "Unlimited projects",
      "Custom domains",
      "Priority Claude Sonnet access",
      "DPA available",
    ],
    cta: "Start Pro",
    href: "/sign-up?plan=pro",
    highlighted: true,
  },
  {
    name: "Team",
    price: "$50/seat/mo",
    bullets: [
      "Everything in Pro",
      "Org workspaces + roles",
      "SSO (coming soon)",
      "Shared billing",
      "Priority support",
    ],
    cta: "Contact sales",
    href: "mailto:support@praxiomai.xyz?subject=Team%20plan%20inquiry",
  },
]

export default function PricingPage() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="text-center text-3xl font-semibold">Pricing</h1>
      <p className="mt-2 text-center text-muted-foreground">
        Free works. Pro unlocks everything. Team adds collaboration.
      </p>
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {TIERS.map(t => <PricingCard key={t.name} tier={t} />)}
      </div>
    </section>
  )
}
```

- [ ] **Step 10.3: Commit**

```bash
git add src/features/marketing/components/pricing-card.tsx src/app/(marketing)/pricing/page.tsx
git commit -m "feat(marketing): pricing page with Free/Pro/Team tiers"
```

---

## Task 11: About Page + Footer Component

**Files:**
- Create: `src/app/(marketing)/about/page.tsx`
- Create: `src/features/marketing/components/footer.tsx`

- [ ] **Step 11.1: About page**

```typescript
// src/app/(marketing)/about/page.tsx
import Link from "next/link"
export default function AboutPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16 prose">
      <h1>About Polaris</h1>
      <p>
        Polaris is the AI cloud IDE for spec-driven development. We believe
        software should be described, not just typed — and that the agent and
        the human should be reading from the same spec.
      </p>
      <p>
        Polaris is built by{" "}
        <Link href="https://praxiomai.xyz" target="_blank">Praxiom</Link>.
        Our mission is to make working with AI feel like working with a clear,
        opinionated teammate.
      </p>
    </section>
  )
}
```

- [ ] **Step 11.2: Footer with "Polaris by Praxiom" line (D-010)**

```typescript
// src/features/marketing/components/footer.tsx
import Link from "next/link"

export function Footer() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 md:flex-row md:justify-between">
        <p className="text-sm">
          Polaris by{" "}
          <Link href="https://praxiomai.xyz" className="underline" target="_blank">
            Praxiom
          </Link>
          {/* Article XVIII stub: link to praxiomai.xyz; replace with badge component when Praxiom integration ships */}
        </p>
        <nav className="flex flex-wrap gap-4 text-sm">
          <Link href="/legal/terms">Terms</Link>
          <Link href="/legal/privacy">Privacy</Link>
          <Link href="/legal/dpa">DPA</Link>
          <Link href="/legal/cookies">Cookies</Link>
          <Link href="https://status.praxiomai.xyz" target="_blank">Status</Link>
          <a href="mailto:support@praxiomai.xyz">Support</a>
        </nav>
      </div>
    </footer>
  )
}
```

- [ ] **Step 11.3: Commit**

```bash
git add src/app/(marketing)/about/page.tsx src/features/marketing/components/footer.tsx
git commit -m "feat(marketing): about page + footer with Polaris-by-Praxiom line"
```

---

## Task 12: Legal Pages (Terms / Privacy / DPA / Cookies)

**Strategy:** Do NOT hand-author full legal text. Use Vercel and Stripe public templates as the base. Customize the marked sections only. Source markdown lives in `docs/legal-templates/{terms,privacy,dpa,cookies}.md` so legal review can diff against template revisions; pages render that markdown via `react-markdown`.

**Files:**
- Create: `docs/legal-templates/{terms,privacy,dpa,cookies}.md`
- Create: `src/app/(marketing)/legal/_lib/legal-layout.tsx`
- Create: `src/app/(marketing)/legal/{terms,privacy,dpa,cookies}/page.tsx`

- [ ] **Step 12.1: Install markdown renderer**

```bash
npm install react-markdown remark-gfm
```

- [ ] **Step 12.2: Source markdown — Terms (template + customizations only)**

Create `docs/legal-templates/terms.md`. Start from the **Vercel Terms of Service** public template. Customize ONLY these sections — leave the rest as-is so legal review can diff:

- §"AI Processing Disclosure" — describe that user prompts and code are sent to Anthropic; link to Anthropic's terms.
- §"Sandbox Execution" — describe E2B sandbox isolation, no persistent state, code runs in user's name.
- §"GitHub Access Scope" — list the OAuth scopes requested (`repo`, `user:email`); user can revoke at github.com/settings/applications.
- §"Generated Code Warranty" — explicit "no warranty on generated code; user is responsible for review."
- §"Dispute Resolution" — Praxiom jurisdiction (TBD with counsel — placeholder: Delaware, US arbitration).

> **Open question:** Final jurisdiction must be confirmed by counsel. Track in `docs/launch-checklist.md`.

- [ ] **Step 12.3: Source markdown — Privacy**

Create `docs/legal-templates/privacy.md`. Start from the **Stripe Privacy Policy** public template. Customize:

- §"What we collect" — auth identifiers (Clerk), user content (prompts, files, conversations) for AI processing, telemetry (usage counters in Convex), billing (via Stripe).
- §"Retention" — user content kept until account deletion; logs 90 days; backups 30 days.
- §"GDPR rights" — list export and delete URLs (`/api/account/export`, account settings → Delete).
- §"Sub-processors" — Anthropic, OpenAI (when GPT enabled), Google (when Gemini enabled), E2B, Vercel, Convex, Clerk, Stripe, Sentry, Supabase, GitHub.
- §"Contact" — `support@praxiomai.xyz`.

- [ ] **Step 12.4: Source markdown — DPA**

Create `docs/legal-templates/dpa.md`. Use a standard DPA template (e.g., Vercel/Stripe DPA structures). Note this is offered to Pro/Team users on request — the published page is the template they will counter-sign.

- [ ] **Step 12.5: Source markdown — Cookies**

Create `docs/legal-templates/cookies.md`. Short. List:
- Essential: Clerk session, Convex auth.
- Analytics (off by default in v1): none — placeholder for future.
- Sentry: opt-in only via cookie banner.

- [ ] **Step 12.6: Shared legal layout**

```typescript
// src/app/(marketing)/legal/_lib/legal-layout.tsx
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

export function LegalLayout({ source, title }: { source: string; title: string }) {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16 prose prose-neutral">
      <h1>{title}</h1>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </article>
  )
}
```

- [ ] **Step 12.7: Page wrappers (one per doc)**

```typescript
// src/app/(marketing)/legal/terms/page.tsx
import fs from "node:fs/promises"
import path from "node:path"
import { LegalLayout } from "../_lib/legal-layout"

export default async function TermsPage() {
  const source = await fs.readFile(
    path.join(process.cwd(), "docs/legal-templates/terms.md"),
    "utf8",
  )
  return <LegalLayout title="Terms of Service" source={source} />
}
```

Repeat for `privacy`, `dpa`, `cookies`. Same structure, different file.

- [ ] **Step 12.8: Commit**

```bash
git add docs/legal-templates/ src/app/(marketing)/legal/ package.json package-lock.json
git commit -m "feat(legal): Terms, Privacy, DPA, Cookies pages from markdown templates"
```

---

## Task 13: Cookie Consent Banner

**Files:**
- Create: `src/features/marketing/lib/cookie-storage.ts`
- Create: `src/features/marketing/components/cookie-consent.tsx`
- Test: `tests/unit/marketing/cookie-storage.test.ts`
- Test: `tests/unit/marketing/cookie-consent.test.tsx`

- [ ] **Step 13.1: Failing test for storage**

```typescript
// tests/unit/marketing/cookie-storage.test.ts
import { describe, it, expect, beforeEach } from "vitest"
import { getConsent, setConsent } from "@/features/marketing/lib/cookie-storage"

beforeEach(() => localStorage.clear())

it("returns null when no consent recorded", () => {
  expect(getConsent()).toBeNull()
})

it("round-trips a consent object", () => {
  setConsent({ essential: true, analytics: false, sentry: true, decidedAt: 1 })
  expect(getConsent()).toEqual({ essential: true, analytics: false, sentry: true, decidedAt: 1 })
})
```

- [ ] **Step 13.2: Storage implementation**

```typescript
// src/features/marketing/lib/cookie-storage.ts
export interface ConsentRecord {
  essential: true
  analytics: boolean
  sentry: boolean
  decidedAt: number
}

const KEY = "polaris.cookieConsent.v1"

export function getConsent(): ConsentRecord | null {
  if (typeof window === "undefined") return null
  const raw = localStorage.getItem(KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as ConsentRecord } catch { return null }
}

export function setConsent(c: ConsentRecord): void {
  if (typeof window === "undefined") return
  localStorage.setItem(KEY, JSON.stringify(c))
}
```

- [ ] **Step 13.3: Banner component**

```typescript
// src/features/marketing/components/cookie-consent.tsx
"use client"
import { useEffect, useState } from "react"
import { getConsent, setConsent } from "../lib/cookie-storage"

export function CookieConsent() {
  const [show, setShow] = useState(false)

  useEffect(() => { setShow(getConsent() === null) }, [])

  if (!show) return null

  function decide(analytics: boolean, sentry: boolean) {
    setConsent({ essential: true, analytics, sentry, decidedAt: Date.now() })
    if (sentry) {
      // Sentry init is gated on this elsewhere; trigger an enable hook.
      window.dispatchEvent(new CustomEvent("polaris:consent-changed"))
    }
    setShow(false)
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background p-4 shadow-lg">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm">
          We use essential cookies. Optional analytics & error reporting (Sentry)
          help us improve Polaris. <a href="/legal/cookies" className="underline">Cookie Policy</a>
        </p>
        <div className="flex gap-2">
          <button onClick={() => decide(false, false)} className="btn-secondary text-sm">Essentials only</button>
          <button onClick={() => decide(true, true)}   className="btn-primary text-sm">Accept all</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 13.4: Sentry opt-in respect**

In the file that initializes Sentry (likely `instrumentation.ts` or `sentry.client.config.ts`), check `getConsent()?.sentry === true` before calling `Sentry.init`. If consent is missing or off, do not initialize. Listen for `polaris:consent-changed` to lazy-init when the user grants later.

- [ ] **Step 13.5: Test for opt-out behavior**

```typescript
// tests/unit/marketing/cookie-consent.test.tsx
it("does not show banner when consent already recorded", () => {
  setConsent({ essential: true, analytics: false, sentry: false, decidedAt: 1 })
  render(<CookieConsent />)
  expect(screen.queryByText(/Accept all/)).not.toBeInTheDocument()
})

it("persists 'essentials only' choice as analytics=false sentry=false", async () => {
  render(<CookieConsent />)
  await userEvent.click(screen.getByText(/Essentials only/))
  expect(getConsent()).toMatchObject({ analytics: false, sentry: false })
})
```

- [ ] **Step 13.6: Commit**

```bash
git add src/features/marketing/lib/cookie-storage.ts \
        src/features/marketing/components/cookie-consent.tsx \
        tests/unit/marketing/
git commit -m "feat(marketing): cookie consent banner with Sentry opt-in"
```

---

## Task 14: GDPR Data Export Endpoint

**Files:**
- Create: `convex/account.ts` (helper queries — internal-only `query` functions used by route handler)
- Create: `src/app/api/account/export/route.ts`
- Test: `tests/unit/account/export-completeness.test.ts`

- [ ] **Step 14.1: Convex export bundle helper**

```typescript
// convex/account.ts
import { v } from "convex/values"
import { query } from "./_generated/server"

export const exportBundle = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const profile     = await ctx.db.query("user_profiles").withIndex("by_user", q => q.eq("userId", userId)).unique()
    const projects    = await ctx.db.query("projects").withIndex("by_owner", q => q.eq("ownerId", userId)).collect()
    const projectIds  = projects.map(p => p._id)

    // Collect everything tied to this user's projects.
    const files         = await collectByProject(ctx, "files", projectIds)
    const conversations = await collectByProject(ctx, "conversations", projectIds)
    const conversationIds = conversations.map(c => c._id)
    const messages      = await collectByConversation(ctx, "messages", conversationIds)
    const integrations  = await ctx.db.query("integrations").withIndex("by_user", q => q.eq("userId", userId)).collect()
    const deployments   = await collectByProject(ctx, "deployments", projectIds)
    const usage         = await ctx.db.query("usage").withIndex("by_user", q => q.eq("userId", userId)).collect()
    const plan          = await ctx.db.query("plans").withIndex("by_user", q => q.eq("userId", userId)).unique()

    // Strip secrets (decrypted tokens MUST NOT leak).
    const sanitizedIntegrations = integrations.map(i => ({
      ...i,
      accessToken: undefined,
      refreshToken: undefined,
      encryptedToken: undefined,
    }))

    return {
      exportedAt: Date.now(),
      schemaVersion: 1,
      profile,
      projects,
      files,
      conversations,
      messages,
      integrations: sanitizedIntegrations,
      deployments,
      usage,
      plan,
    }
  },
})

// helpers omitted; collect rows where row.projectId is in projectIds, etc.
```

- [ ] **Step 14.2: Failing completeness test**

```typescript
// tests/unit/account/export-completeness.test.ts
import { describe, it, expect } from "vitest"

const REQUIRED_TOP_LEVEL_KEYS = [
  "exportedAt", "schemaVersion",
  "profile", "projects", "files", "conversations", "messages",
  "integrations", "deployments", "usage", "plan",
]

it("export bundle includes every required key", () => {
  const bundle = buildExportBundleFromSeed()  // helper that calls the Convex query against a seeded test DB
  for (const key of REQUIRED_TOP_LEVEL_KEYS) {
    expect(bundle).toHaveProperty(key)
  }
})

it("integrations are stripped of secret fields", () => {
  const bundle = buildExportBundleFromSeed({ withIntegration: true })
  for (const i of bundle.integrations) {
    expect(i).not.toHaveProperty("accessToken")
    expect(i).not.toHaveProperty("refreshToken")
    expect(i).not.toHaveProperty("encryptedToken")
  }
})
```

- [ ] **Step 14.3: HTTP route**

```typescript
// src/app/api/account/export/route.ts
import { auth } from "@clerk/nextjs/server"
import { fetchQuery } from "convex/nextjs"
import { api } from "@/../convex/_generated/api"

export const runtime = "nodejs"
export const maxDuration = 60  // up to 60s for large users

export async function GET() {
  const { userId } = await auth()
  if (!userId) return new Response("Unauthorized", { status: 401 })

  const bundle = await fetchQuery(api.account.exportBundle, { userId })
  const filename = `polaris-export-${new Date().toISOString().slice(0, 10)}.json`

  return new Response(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
```

- [ ] **Step 14.4: Commit**

```bash
git add convex/account.ts src/app/api/account/export/route.ts \
        tests/unit/account/export-completeness.test.ts
git commit -m "feat(account): GDPR data export endpoint + completeness test"
```

---

## Task 15: Account Deletion Endpoint

**Files:**
- Modify: `convex/account.ts` (add cascade mutations)
- Create: `src/app/api/account/delete/route.ts`
- Create: `src/app/api/account/delete/confirm/route.ts`
- Test: `tests/unit/account/delete-cascade.test.ts`

- [ ] **Step 15.1: Cascade mutation in Convex**

```typescript
// convex/account.ts (append)
import { mutation } from "./_generated/server"

export const cascadeDelete = mutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    // Order matters: delete dependents before parents.
    const projects = await ctx.db.query("projects").withIndex("by_owner", q => q.eq("ownerId", userId)).collect()
    const projectIds = projects.map(p => p._id)

    await deleteAllByProject(ctx, "agent_checkpoints", projectIds)
    await deleteAllByProject(ctx, "deployments", projectIds)
    await deleteAllByProject(ctx, "files", projectIds)

    const conversations = await collectByProject(ctx, "conversations", projectIds)
    const conversationIds = conversations.map(c => c._id)
    await deleteAllByConversation(ctx, "messages", conversationIds)
    for (const c of conversations) await ctx.db.delete(c._id)

    for (const p of projects) await ctx.db.delete(p._id)

    const integrations = await ctx.db.query("integrations").withIndex("by_user", q => q.eq("userId", userId)).collect()
    for (const i of integrations) await ctx.db.delete(i._id)

    const usage = await ctx.db.query("usage").withIndex("by_user", q => q.eq("userId", userId)).collect()
    for (const u of usage) await ctx.db.delete(u._id)

    const plan = await ctx.db.query("plans").withIndex("by_user", q => q.eq("userId", userId)).unique()
    if (plan) await ctx.db.delete(plan._id)

    const profile = await ctx.db.query("user_profiles").withIndex("by_user", q => q.eq("userId", userId)).unique()
    if (profile) await ctx.db.delete(profile._id)

    return { deletedProjects: projects.length, deletedConversations: conversations.length }
  },
})
```

- [ ] **Step 15.2: Two-phase HTTP route — request + confirm**

The DELETE route does NOT delete on first call. It generates a single-use token, stores a hash in Convex (`deletion_tokens` ad-hoc table or a row on `user_profiles`), and emails a confirmation link. The confirm route GETs with the token, validates it, then runs the cascade.

```typescript
// src/app/api/account/delete/route.ts
import { auth, clerkClient } from "@clerk/nextjs/server"
import { randomBytes, createHash } from "node:crypto"
import { Resend } from "resend"

export async function DELETE() {
  const { userId } = await auth()
  if (!userId) return new Response("Unauthorized", { status: 401 })

  const token = randomBytes(32).toString("hex")
  const hash = createHash("sha256").update(token).digest("hex")
  const expiresAt = Date.now() + 30 * 60 * 1000  // 30 min

  // Store token hash on user_profiles or dedicated table — schema decision:
  await fetchMutation(api.user_profiles.setDeletionToken, { userId, hash, expiresAt })

  const user = await (await clerkClient()).users.getUser(userId)
  const email = user.emailAddresses[0]?.emailAddress
  if (!email) return new Response("No email on file", { status: 400 })

  const confirmUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/account/delete/confirm?t=${token}`
  await new Resend(process.env.RESEND_API_KEY!).emails.send({
    from: "Polaris <support@praxiomai.xyz>",
    to: email,
    subject: "Confirm Polaris account deletion",
    text: `Click to permanently delete your Polaris account: ${confirmUrl}\n\nThis link expires in 30 minutes. If you didn't request this, ignore this email.`,
  })

  return Response.json({ ok: true, message: "Confirmation email sent" })
}
```

```typescript
// src/app/api/account/delete/confirm/route.ts
export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) return new Response("Unauthorized", { status: 401 })
  const token = new URL(req.url).searchParams.get("t")
  if (!token) return new Response("Missing token", { status: 400 })

  const hash = createHash("sha256").update(token).digest("hex")
  const ok = await fetchMutation(api.user_profiles.consumeDeletionToken, { userId, hash })
  if (!ok) return new Response("Invalid or expired token", { status: 400 })

  // Cascade order: external first (so we don't orphan billing), then Convex, then Clerk.
  await cancelStripeSubscription(userId)         // helper from sub-plan 08
  await killActiveSandboxes(userId)              // helper from sub-plan 02
  await fetchMutation(api.account.cascadeDelete, { userId })
  await (await clerkClient()).users.deleteUser(userId)

  // Compliance log (append-only).
  await logDeletion({ userId, at: Date.now() })

  return Response.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/goodbye`)
}
```

- [ ] **Step 15.3: Failing cascade test**

```typescript
// tests/unit/account/delete-cascade.test.ts
it("leaves no orphan rows for the deleted user", async () => {
  const userId = await seedFullAccount()  // creates rows across every table
  await runCascadeDelete(userId)

  for (const table of ["projects", "files", "conversations", "messages",
                        "integrations", "deployments", "usage", "plans",
                        "agent_checkpoints", "user_profiles"]) {
    const rows = await listRowsForUser(table, userId)
    expect(rows, `orphans found in ${table}`).toHaveLength(0)
  }
})
```

- [ ] **Step 15.4: Add a `goodbye` page**

`src/app/goodbye/page.tsx` — simple "Your account has been deleted. We're sorry to see you go."

- [ ] **Step 15.5: Commit**

```bash
git add convex/account.ts src/app/api/account/delete/ src/app/goodbye/page.tsx \
        tests/unit/account/delete-cascade.test.ts .env.example
git commit -m "feat(account): two-phase deletion with cascade across Convex, Stripe, sandboxes, Clerk"
```

---

## Task 16: Account Settings UI Wiring

**Files:**
- Modify: `src/features/billing/components/account-settings.tsx`

- [ ] **Step 16.1: Add Export and Delete buttons**

```typescript
// excerpt
async function handleExport() {
  const r = await fetch("/api/account/export")
  if (!r.ok) { toast.error("Export failed"); return }
  const blob = await r.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "polaris-export.json"
  a.click()
  URL.revokeObjectURL(url)
}

async function handleDelete() {
  if (!confirm("This will email you a confirmation link. Continue?")) return
  const r = await fetch("/api/account/delete", { method: "DELETE" })
  if (r.ok) toast.success("Check your email for the confirmation link.")
}
```

Render two buttons in a "Danger zone" section: `<button onClick={handleExport}>Export my data</button>` and `<button onClick={handleDelete} className="btn-destructive">Delete account</button>`.

- [ ] **Step 16.2: Commit**

```bash
git add src/features/billing/components/account-settings.tsx
git commit -m "feat(account): UI for export + delete in account settings"
```

---

## Task 17: Internal Health Probe Endpoints

**Why:** The public status page must NOT have our API keys. We host five trivial `/api/health/*` endpoints that probe the upstream and return a normalized response; the status provider polls those.

**Files:**
- Create: `src/app/api/health/{anthropic,e2b,convex,vercel,supabase}/route.ts`
- Test: `tests/unit/health/probes.test.ts`

- [ ] **Step 17.1: Shared probe shape**

Each route returns `{ status: "ok" | "degraded" | "down", latencyMs: number, checkedAt: number }` with HTTP 200 if reachable, 503 if down. Status providers can use either the JSON or HTTP status.

```typescript
// src/app/api/health/anthropic/route.ts
export const runtime = "edge"
export const dynamic = "force-dynamic"

export async function GET() {
  const t0 = Date.now()
  try {
    const r = await fetch("https://api.anthropic.com/v1/models", {
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(5_000),
    })
    const latencyMs = Date.now() - t0
    if (!r.ok) return Response.json({ status: "down", latencyMs, checkedAt: Date.now() }, { status: 503 })
    return Response.json({ status: latencyMs > 2000 ? "degraded" : "ok", latencyMs, checkedAt: Date.now() })
  } catch {
    return Response.json({ status: "down", latencyMs: Date.now() - t0, checkedAt: Date.now() }, { status: 503 })
  }
}
```

- [ ] **Step 17.2: E2B probe** — `GET https://api.e2b.dev/health`. Same shape.

- [ ] **Step 17.3: Convex probe** — call `fetchQuery(api.healthcheck.ping, {})`. Add a no-op `ping` query.

- [ ] **Step 17.4: Vercel probe** — `GET https://api.vercel.com/v2/teams` with token. Same shape.

- [ ] **Step 17.5: Supabase probe** — `GET https://api.supabase.com/v1/projects` with PAT. Same shape.

- [ ] **Step 17.6: Test**

```typescript
// tests/unit/health/probes.test.ts
it("returns 503 when upstream errors", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")))
  const { GET } = await import("@/app/api/health/anthropic/route")
  const r = await GET()
  expect(r.status).toBe(503)
})
```

- [ ] **Step 17.7: Commit**

```bash
git add src/app/api/health/ tests/unit/health/
git commit -m "feat(health): five internal probe endpoints for status page"
```

---

## Task 18: Status Page Provider Configuration

**Decision:** **BetterStack** (Uptime). Reasons: free tier covers 10 monitors (we need 6); supports custom domain CNAME for `status.praxiomai.xyz`; built-in incident communications via email + SMS; status page is hosted by them, no infra on our side.

**Files (docs only — no code):**
- Update: `docs/launch-checklist.md` (Task 22 already covers this; here we capture provider config)
- Note: This is configured in BetterStack's dashboard, not in our repo.

- [ ] **Step 18.1: Create BetterStack workspace**

Sign up at betterstack.com/uptime. Create a status page at `status.praxiomai.xyz`. In BetterStack:
- Settings → Custom domain → `status.praxiomai.xyz`. They'll give a CNAME target.
- DNS: add the CNAME on praxiomai.xyz domain (Day 0 task already done — verify).

- [ ] **Step 18.2: Configure 6 monitors**

| Name              | URL                                                  | Method | Expected |
|-------------------|------------------------------------------------------|--------|----------|
| Polaris IDE       | `https://build.praxiomai.xyz`                        | HEAD   | 200      |
| Anthropic         | `https://build.praxiomai.xyz/api/health/anthropic`   | GET    | 200      |
| E2B               | `https://build.praxiomai.xyz/api/health/e2b`         | GET    | 200      |
| Convex            | `https://build.praxiomai.xyz/api/health/convex`      | GET    | 200      |
| Vercel API        | `https://build.praxiomai.xyz/api/health/vercel`      | GET    | 200      |
| Supabase Mgmt     | `https://build.praxiomai.xyz/api/health/supabase`    | GET    | 200      |

Frequency: 1 minute. Region: nearest to Vercel deploy region.

- [ ] **Step 18.3: Subscriber notifications**

Enable email + SMS subscriptions on the public status page. Subscribe `support@praxiomai.xyz` and the on-call phone (TBD; placeholder). Configure incident routing → Slack webhook (optional, if Slack is set up).

- [ ] **Step 18.4: Document in repo**

Add a section to `docs/launch-checklist.md` summarizing the BetterStack setup so the config is reproducible. (Don't paste the API key.)

- [ ] **Step 18.5: Commit (docs only)**

```bash
git add docs/launch-checklist.md
git commit -m "docs(launch): document BetterStack status page configuration"
```

---

## Task 19: Support Inbox + SLA Document

**Files:**
- Create: `docs/support-sla.md`

- [ ] **Step 19.1: Configure Google Workspace inbox**

Outside the repo: in praxiomai.xyz Google Workspace, create the alias `support@praxiomai.xyz` → forwards to founder inbox initially. Configure auto-reply with the SLA copy from §19.2 below.

> **Decision recorded:** Gmail Workspace (not Help Scout) for v1. Cheaper; we can migrate when ticket volume justifies. Track in `docs/support-sla.md`.

- [ ] **Step 19.2: Write SLA doc**

```markdown
# Polaris Support — Soft Launch SLA

**Email:** support@praxiomai.xyz
**Coverage:** Beta (50 invited users), best-effort.

## Response targets

| Severity | Target first response | Definition |
|----------|-----------------------|------------|
| Sev 1    | 4 hours (business)    | Cannot sign in / cannot deploy / data loss suspected. |
| Sev 2    | 24 hours              | Feature broken; workaround possible. |
| Sev 3    | 48 hours              | Question / minor issue / feature request. |

These are targets, not guarantees, during the beta period.

## Auto-reply text

> Thanks for emailing Polaris support. We aim to respond within 24 hours during
> the beta. For urgent issues, please describe what you tried, what you expected,
> and any error message. — The Polaris team
```

- [ ] **Step 19.3: Commit**

```bash
git add docs/support-sla.md
git commit -m "docs(support): SLA targets + auto-reply copy for beta"
```

---

## Task 20: Telemetry Convex Queries

**Constitution V:** No external analytics SaaS in v1. Compute the 5 launch KPIs from existing Convex tables.

**Files:**
- Create: `convex/telemetry.ts`

- [ ] **Step 20.1: KPI queries**

```typescript
// convex/telemetry.ts
import { query } from "./_generated/server"

// Internal-only queries. Gate behind admin auth in handler if exposed via UI.

export const signupCount = query({
  args: {},
  handler: async (ctx) => {
    const profiles = await ctx.db.query("user_profiles").collect()
    return profiles.length
  },
})

export const onboardingCompletionRate = query({
  args: {},
  handler: async (ctx) => {
    const profiles = await ctx.db.query("user_profiles").collect()
    if (profiles.length === 0) return 0
    return profiles.filter(p => p.onboardingComplete).length / profiles.length
  },
})

export const timeToFirstProject = query({
  args: {},
  handler: async (ctx) => {
    // For each user, ms between user_profile.createdAt and first project.createdAt.
    const profiles = await ctx.db.query("user_profiles").collect()
    const out: number[] = []
    for (const p of profiles) {
      const first = await ctx.db
        .query("projects")
        .withIndex("by_owner", q => q.eq("ownerId", p.userId))
        .order("asc")
        .first()
      if (first) out.push(first._creationTime - p.createdAt)
    }
    return median(out)
  },
})

export const timeToFirstDeploy = query({
  args: {},
  // Same idea, joining user_profiles → deployments.
  handler: async (ctx) => { /* ... */ return 0 },
})

export const freeToPaidConversion = query({
  args: {},
  handler: async (ctx) => {
    const plans = await ctx.db.query("plans").collect()
    if (plans.length === 0) return 0
    return plans.filter(p => p.tier !== "free").length / plans.length
  },
})
```

- [ ] **Step 20.2: Commit**

```bash
git add convex/telemetry.ts
git commit -m "feat(telemetry): native Convex queries for launch KPIs"
```

---

## Task 21: DNS Cutover Checklist

**Files:**
- Create: `docs/launch-dns-cutover.md`

- [ ] **Step 21.1: Write the checklist**

```markdown
# DNS Cutover — Launch Day

Run these checks **the morning of launch**. None should be assumed; verify each.

## Domain: build.praxiomai.xyz

- [ ] `dig CNAME build.praxiomai.xyz +short` returns Vercel target (e.g. `cname.vercel-dns.com`)
- [ ] Vercel project → Settings → Domains shows `build.praxiomai.xyz` with green checkmark
- [ ] SSL cert: `curl -Iv https://build.praxiomai.xyz` shows valid cert (Let's Encrypt via Vercel), expiry > 30 days
- [ ] Hitting `https://build.praxiomai.xyz` serves the production deployment (not preview)

## Status page: status.praxiomai.xyz

- [ ] `dig CNAME status.praxiomai.xyz +short` returns BetterStack target
- [ ] Page loads with "All systems operational"
- [ ] All 6 monitors show green

## Email DNS for praxiomai.xyz

- [ ] MX records point to Google Workspace
- [ ] SPF record present and includes `_spf.google.com`
- [ ] DKIM selector `google._domainkey` resolves
- [ ] DMARC record present (`v=DMARC1; p=quarantine; rua=mailto:dmarc@praxiomai.xyz`)
- [ ] Test send `support@praxiomai.xyz` ↔ external Gmail; check headers for SPF=pass, DKIM=pass, DMARC=pass
- [ ] Test send via Resend from `support@praxiomai.xyz` (deletion confirmation flow); same checks

## Clerk

- [ ] Allowlist enabled with 50 invited emails
- [ ] Webhook configured pointing at `https://build.praxiomai.xyz/api/clerk/webhook`
- [ ] Test signup with non-allowlisted email → redirected to `/beta-closed`
- [ ] Test signup with allowlisted email → lands in `/welcome`

## Final go/no-go

- [ ] All boxes above ticked → proceed to `docs/launch-checklist.md`
```

- [ ] **Step 21.2: Commit**

```bash
git add docs/launch-dns-cutover.md
git commit -m "docs(launch): DNS cutover checklist"
```

---

## Task 22: Soft Launch Checklist

**Files:**
- Create: `docs/launch-checklist.md`

- [ ] **Step 22.1: Author the checklist**

```markdown
# Polaris Soft Launch — Go/No-Go

> Run sequentially the day before launch. Do not skip.

## 1. Phase 1-3 DoD

- [ ] Sub-plan 01 (agent loop) all green
- [ ] Sub-plan 02 (E2B sandbox) all green
- [ ] Sub-plan 03 (file editor) all green
- [ ] Sub-plan 04 (streaming UI) all green
- [ ] Sub-plan 05 (deploys) all green
- [ ] Sub-plan 06 (GitHub) all green
- [ ] Sub-plan 07 (specs) all green
- [ ] Sub-plan 08 (billing) all green
- [ ] Sub-plan 09 (hardening) all green

## 2. Infrastructure

- [ ] DNS cutover checklist passed (`docs/launch-dns-cutover.md`)
- [ ] Vercel production env vars set (`.env.example` parity)
- [ ] Convex production deployed; schema applied
- [ ] Stripe LIVE mode keys swapped in; webhook pointed at prod URL
- [ ] Sentry production project + DSN configured; alert routing → support@
- [ ] Status page live at status.praxiomai.xyz; all 6 monitors green
- [ ] Support inbox (`support@praxiomai.xyz`) reaches founder; auto-reply on

## 3. Beta gate

- [ ] Clerk allowlist contains 50 invited emails (source of truth: this file's hidden gist)
- [ ] Test: non-allowlisted email lands on `/beta-closed`
- [ ] Test: allowlisted email signs up → lands on `/welcome`
- [ ] Welcome email drafted (manual sends to the 50 — keep this artisanal in v1)

## 4. Onboarding

- [ ] Fresh test account: greeting → starter prompt → first project → tour → done
- [ ] Resume mid-flow works (close tab on starter_prompts step; reopen → resumes there)
- [ ] All 3 starter prompts produce a working project

## 5. Legal & privacy

- [ ] Terms, Privacy, DPA, Cookies pages render
- [ ] Cookie banner appears for first-time visitors
- [ ] "Essentials only" choice persists; Sentry not initialized
- [ ] GDPR export downloads complete JSON
- [ ] Account deletion: confirmation email arrives; clicking link cascades correctly

## 6. Open items requiring counsel

- [ ] Final dispute resolution jurisdiction in ToS
- [ ] DPA template counter-signed-ready

## 7. Telemetry

- [ ] `convex/telemetry.ts` queries all return non-error values

## 8. Communications

- [ ] 50 welcome emails drafted & queued
- [ ] Founder available for first 24h post-launch (no travel)
- [ ] Slack/Discord channel for beta users? (decision: defer to post-launch; route to email for v1)
```

- [ ] **Step 22.2: Commit**

```bash
git add docs/launch-checklist.md
git commit -m "docs(launch): soft launch checklist"
```

---

## Task 23: End-to-End Launch Rehearsal

- [ ] **Step 23.1: Full dress rehearsal in staging**

Use a non-production Vercel preview URL plus a Convex dev deployment. Walk through the full path:

1. Open landing page → click "Sign up".
2. Sign up with an allowlisted email.
3. Complete onboarding (greeting → starter prompt → first project → tour).
4. Send a message; agent edits a file; preview reloads (sub-plan 02 gives this).
5. Deploy the project (sub-plan 05).
6. Open account settings → click "Export my data" → file downloads → open JSON → spot-check it has projects + messages.
7. Click "Delete account" → confirmation email arrives → click link → redirected to `/goodbye`.
8. Sign back in with the same email → should hit `/beta-closed` (Clerk user gone) or sign-up flow → confirms cascade.

- [ ] **Step 23.2: Negative paths**

- Non-allowlisted email signup → `/beta-closed` → submits to waitlist → row appears in Convex `waitlist` table.
- Cookie banner: "Essentials only" → reload → banner does not reappear → `localStorage.polaris.cookieConsent.v1` exists with `analytics:false, sentry:false`.
- Visit `/legal/terms` → renders the customized template.
- `https://build.praxiomai.xyz/api/health/anthropic` → returns `status: ok` JSON.

- [ ] **Step 23.3: Document any issues found**

If issues arise during rehearsal, file as follow-up steps inside this sub-plan rather than punting to a separate doc — they are launch-blockers by definition.

- [ ] **Step 23.4: No commit**

This is verification only.

---

## Self-Review Checklist

Before marking this sub-plan complete, verify:

- [ ] All 23 tasks have green commits (where commits apply)
- [ ] `npm run test:unit` passes (onboarding, cookie consent, export, cascade, health probes)
- [ ] `npm run typecheck` passes
- [ ] `docs/launch-dns-cutover.md` ticked end-to-end
- [ ] `docs/launch-checklist.md` ticked end-to-end
- [ ] No `// TODO` placeholders in legal pages — only intentional ones in template markdown reviewed by counsel
- [ ] Footer reads "Polaris by Praxiom" with link to praxiomai.xyz (D-010, Article XVIII stub)
- [ ] Pricing page numbers match runtime enforcement in sub-plan 08 (Article II §2.7 honesty)
- [ ] No external analytics SaaS imported (Article V — Convex-native telemetry only)
- [ ] Sentry init guarded by cookie consent
- [ ] Account deletion is two-phase and cascades through Stripe + sandboxes + Convex + Clerk
- [ ] All 6 status monitors are green
- [ ] CONSTITUTION conformance: re-read Articles I §1.5, II §2.7, V, XVIII; spot-check that code matches

## Risk register

The launch surface area is broad. Capture the risks we are accepting versus mitigating, and the trigger that would force us to roll back.

| Risk | Likelihood | Impact | Mitigation | Rollback trigger |
|------|------------|--------|------------|------------------|
| Stripe LIVE keys leak into a preview deploy | Low | High | Use Vercel "production-only" env var scoping; verify in DNS cutover step that preview URLs don't have live keys | Any signed Stripe webhook from a non-production URL → revoke key, rotate |
| Clerk allowlist accidentally disabled | Low | High (anyone signs up) | Daily check during launch week; webhook log review | More than 5 unexpected signups in 1h |
| Account deletion drops a row in Stripe but not Convex (or vice versa) | Medium | Medium | Two-phase delete with explicit ordering (Stripe → sandboxes → Convex → Clerk); cascade test seeds every table | Orphan check query in `convex/telemetry.ts` finds residual rows for a deleted Clerk userId |
| Cookie banner causes layout shift / flash on landing | Medium | Low | `useEffect` reads localStorage; banner only mounts after hydration; SSR returns null | UX feedback during rehearsal |
| Anthropic outage during launch window | Medium | High | Status page surfaces immediately; pre-drafted incident message; agent surfaces user-friendly error from sub-plan 09 | Anthropic monitor down for >15 min during launch hour |
| GDPR export response too large for serverless edge | Low | Medium | Route runs `nodejs` runtime with `maxDuration = 60`; bundle size capped by per-user data which is small in beta | Export request times out → switch to Convex action with chunked response |
| Beta user emails get flagged as spam (Resend deletion confirmation) | Medium | Medium | Verified domain on Resend; SPF/DKIM/DMARC pass tested in DNS cutover | Bounce rate > 5% → fall back to Workspace SMTP |
| DPA / Terms language exposed before counsel review | Medium | High legal | Behind-the-scenes: pages render markdown from `docs/legal-templates/`; do NOT publish until counsel sign-off recorded in launch checklist | Counsel flags any clause as unacceptable |

If any "rollback trigger" fires post-launch, the action is the same: revert DNS for `build.praxiomai.xyz` to a maintenance page (Vercel project supports a maintenance redirect), notify the 50 users via the same email list used to invite, and patch.

## Deferred to post-launch

- Help Scout migration when ticket volume warrants (currently Gmail Workspace).
- Slack / Discord beta community channel.
- Real demo screencast video (placeholder shipped at launch).
- Real starter-prompt thumbnail screenshots (placeholders shipped at launch).
- Praxiom badge component upgrade — Article XVIII contract currently fulfilled by a textual link in the footer; replace with shared component when Praxiom integration ships.
- External analytics (PostHog / Amplitude) — gated by cookie consent infra already in place.

## Open questions

- **Jurisdiction in ToS** — placeholder is Delaware/US arbitration; final decision blocks legal sign-off. Owner: founder + counsel.
- **On-call phone for SMS incident alerts** — placeholder; needs assignment before launch day.
- **Welcome email copy** — drafted but not finalized; needs founder review.
- **Resend vs nodemailer** — plan assumes Resend; revisit if budget is tight (nodemailer + Workspace SMTP works at zero marginal cost but worse deliverability).
