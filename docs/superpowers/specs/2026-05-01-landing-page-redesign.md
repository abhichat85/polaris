# Landing Page Redesign — Design & Implementation Spec

**Date:** 2026-05-01  
**Status:** Approved for implementation  
**Scope:** `src/app/(marketing)/page.tsx` and `src/features/marketing/components/` only. No other routes, no backend changes.

---

## 1. Problem

The current landing page (`src/app/(marketing)/page.tsx`) is a functional placeholder: a hero section, three feature cards, and a CTA. It communicates what Polaris does at the most literal level but conveys no personality, no urgency, and no clarity about who the product is for. It looks unfinished to anyone who arrives with genuine intent.

---

## 2. Goals

- Replace the placeholder with a mature, opinionated landing page that reflects Polaris's actual positioning.
- Copy must be precise and written for the target user (founder / builder / PM who can read code).
- Visual design must be polished: asymmetric layouts, animated elements, depth through surfaces — not flat cards on a white-ish background.
- Use Framer Motion for scroll-triggered entrance animations and hero micro-interactions.
- The Three.js particle background in the hero signals "real tech product" without being gratuitous.
- No new routes. No changes to auth, pricing page logic, or API routes.

---

## 3. Approved Design

### 3.1 Page Structure (7 sections)

| # | Section | Notes |
|---|---------|-------|
| 1 | Hero | Asymmetric 2-col: copy left, live spec/chat panel right, Three.js background |
| 2 | How it works | 3-step grid with hover top-line animation |
| 3 | What makes it different | 4 alternating 2-col feature blocks (text + visual panel) |
| 4 | Who it's for | 3 persona cards with hover-lift and indigo reveal |
| 5 | FAQ | Sidebar layout — label/title pinned left, Q&A list right |
| 6 | Pricing teaser | 3 tier cards mirroring `/pricing` style; links to full pricing page |
| 7 | Final CTA | Centered with radial glow, links to `/sign-up` |

The marketing header and footer are unchanged.

---

### 3.2 Hero Section

**Layout:** CSS grid, `grid-cols: 1fr 480px`, `gap: 80px`, centered in a `max-w-[1200px]` container. Left-aligned text — not centered.

**Left column — copy:**
- Eyebrow pill: `AI CLOUD IDE` — indigo background, pulsing dot
- H1: `The AI IDE that builds from spec, not instinct.` — `spec` in `text-primary` color, `not instinct.` in a dimmed foreground
- Subtext: explains what "spec" means concretely and the full workflow (describe → live preview → Vercel → GitHub)
- CTAs: `Start building free` (primary button with indigo glow shadow) + `See pricing →` (ghost link)
- Fine print: "No credit card required. Free tier: 50K tokens/month, 1 deploy."

**Right column — spec/chat panel:**
A styled card (`code-panel`) that shows a fictional but realistic in-progress Polaris session:
- Window chrome: three dot buttons (decorative), filename `spec.json — dashboard-app`, `Building…` badge
- **Spec list**: 5 items with status dots (done = green, in-progress = pulsing indigo, pending = muted). Items: User auth, Dashboard, Realtime notifications (active), Stripe billing, Deploy
- **Chat preview**: user message + AI "typing…" indicator (3-dot bounce animation)
- **Live preview strip**: URL + green `LIVE` badge with pulsing dot

**Background:**
- Three.js `PointsMaterial` particle field (800 particles, indigo `#4d5fff`, opacity 0.45, slow rotation)
- 30 subtle connecting line segments (opacity 0.04)
- Two CSS radial glow blobs (blurred ellipses) — one left-top, one right-bottom
- CSS grid overlay (40px lines at 1.5% white opacity, masked radially)

**Animations (Framer Motion):**
- Hero eyebrow, h1, subtext, CTAs, fine print: `fadeUp` variants, staggered by 0.1s each
- Right panel: `fadeUp` with 0.2s delay

---

### 3.3 How It Works

**Layout:** Full-width section on `surface-0`. Header is a 2-col grid (title left, subtext right). Steps are a 3-col CSS grid with a `1px` gap on `rgba(255,255,255,0.04)` background (creates hairline dividers between cards without borders).

**Steps:**
1. **Describe it** — Write in plain English. Polaris generates a spec and confirms before writing code.
2. **Watch it build** — Real Next.js + Supabase app in a cloud sandbox. Live preview from the first run.
3. **Ship it** — One click to Vercel + Supabase. Code to your GitHub. No lock-in.

**Step card styling:** Large muted step number (font-size 48px, opacity 0.1), h3, body text. On hover: `surface-2` background + 2px indigo top line reveals via opacity transition.

**Animations:** Each card fades up on scroll entry (Framer Motion `whileInView`), staggered 0.1s.

---

### 3.4 What Makes It Different (Features)

**Layout:** `surface-1` background. 4 alternating feature blocks. Each block is a `grid-cols: 1fr 1fr` with `gap: 80px`. Odd blocks: text left, visual right. Even blocks: text right, visual left (CSS `direction: rtl` on the grid container, `direction: ltr` on children).

**Feature blocks:**

| # | Title | Left/Right | Visual |
|---|-------|-----------|--------|
| 1 | The spec is the source of truth | Text left | Spec list with status dots |
| 2 | You own the output, completely | Text right | Git terminal output |
| 3 | Real execution, not a preview | Text left | Browser preview wireframe |
| 4 | One click to production | Text right | Vercel + Supabase + GitHub deploy steps |

Each block has a small index label (`01 / 04`), an h3 headline, and 2–3 sentences of body copy. **Bold text** in the body is used for the single most important phrase per block.

**Animations:** Each feature block fades up when it enters the viewport.

---

### 3.5 Who It's For

**Layout:** `surface-0`. Section header (label + title + subtext). 3-col card grid.

**Cards:**
1. **The founder who moves fast** — icon ⚡, body copy, "not for" note at the bottom separated by a hairline
2. **The builder who owns their stack** — icon 🔧
3. **The PM who can prototype** — icon 📋

**Card styling:** `surface-1` background, 1px border at `rgba(255,255,255,0.04)`. On hover: border shifts to `rgba(77,95,255,0.2)`, card lifts `translateY(-4px)`, indigo gradient line appears at top via `::before` pseudo-element. All transitions 250ms.

---

### 3.6 FAQ

**Layout:** `surface-1`. The section inner is a 2-col grid: `280px 1fr`. Left column has the label and section title. Right column has the Q&A list.

**Questions:**
1. *Is this like Bolt or v0?* — Full answer explaining Polaris is a full IDE with a persistent spec, not just a prompt-to-code generator.
2. *Do I need to know how to code?* — Must be comfortable reading code and steering. Not for pure no-code users.
3. *What happens to my code if I cancel?* — Nothing. It's in your GitHub. Subscription pays for the agent; output was always yours.

**Item styling:** Each Q+A separated by `1px border-bottom rgba(255,255,255,0.04)`. No accordion — all expanded.

---

### 3.7 Pricing Teaser

**Layout:** `surface-0`. Header (label + title + subtext). 3-col card grid matching the visual language of `/pricing` but simplified.

**Tiers (data sourced from `/pricing` page — keep in sync):**
- Free: $0/month — 50K tokens, 3 projects, 1 deploy, community support
- Pro (highlighted): $20/month — 2M tokens, 50 projects, 100 deploys, private repos, 24h email support, $20 daily ceiling
- Team: $50/seat/month — 10M tokens, 200 projects, 5 seats, shared workspace, audit log, 4h priority support, $100 daily ceiling

**Highlighted card:** indigo 2px top bar (`linear-gradient(90deg, primary, #a060ff)`), slightly elevated surface, indigo glow shadow, primary CTA button.

**Note below grid:** links to full `/pricing` page.

---

### 3.8 Final CTA

**Layout:** `surface-0`, `160px` vertical padding, text-center. `max-w-[600px]` centered container.

**Copy:**
- Eyebrow: `GET STARTED TODAY`
- H2: `Your spec is waiting. Start writing it.`
- Subtext: "Free to start. No credit card. Your first app can be live in under two minutes."
- Primary CTA button → `/sign-up`
- Ghost link: `or read the pricing →` → `/pricing`

**Background:** Single radial glow orb (`800px × 400px`, indigo, `blur(40px)`, centered, `z-index: 0`).

---

## 4. Animation Specification

All scroll animations use **Framer Motion** `motion` components with `whileInView` + `viewport={{ once: true, margin: "-40px" }}`.

**`fadeUp` variant (standard):**
```ts
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } }
}
```

**Stagger container:**
```ts
const stagger = {
  visible: { transition: { staggerChildren: 0.1 } }
}
```

**Hero entrance:** Framer Motion `initial="hidden" animate="visible"` (not scroll-triggered — fires immediately on mount).

**Three.js particle animation:** Pure Three.js RAF loop — no Framer Motion. `points.rotation.y` increments by `0.0003` per frame; `points.rotation.x` oscillates as `sin(t * 0.5) * 0.05`.

**Spec panel typing indicator:** Pure CSS keyframe animation (`bounce`, 3 spans staggered 150ms).

**Pulsing dots (live indicator, active spec item):** Pure CSS `@keyframes pulse` on `box-shadow`.

---

## 5. Component Architecture

The landing page is a single file: `src/app/(marketing)/page.tsx`. It should be split into focused sub-components in `src/features/marketing/components/`:

| File | Purpose |
|------|---------|
| `hero-section.tsx` | Hero layout, copy, CTA buttons. Imports `spec-panel.tsx` and `hero-canvas.tsx` |
| `hero-canvas.tsx` | Three.js particle field — client component (`"use client"`) |
| `spec-panel.tsx` | The fictional spec/chat panel — client component (typing animation) |
| `how-it-works-section.tsx` | 3-step grid |
| `features-section.tsx` | 4 alternating feature blocks |
| `for-section.tsx` | 3 persona cards |
| `faq-section.tsx` | 2-col FAQ layout |
| `pricing-teaser-section.tsx` | Mini pricing cards |
| `cta-section.tsx` | Final CTA |

`src/app/(marketing)/page.tsx` becomes a thin composition of these imports.

---

## 6. Dependencies

| Package | Purpose | Status |
|---------|---------|--------|
| `framer-motion` | Scroll animations, hero entrance | ✅ Already installed (v12.26.2) |
| `three` | Particle background canvas | ❌ Must be added |
| `@types/three` | TypeScript types for Three.js | ❌ Must be added (devDependency) |

Run `pnpm add three && pnpm add -D @types/three` before implementing `hero-canvas.tsx`. No other new dependencies.

---

## 7. Tailwind / CSS Constraints

All styling uses the existing design system tokens:
- Surfaces: `bg-surface-0` through `bg-surface-3` (do not use raw hex values in JSX)
- Text: `text-foreground`, `text-muted-foreground`
- Primary: `text-primary`, `bg-primary`
- The Three.js canvas and glow blobs are the only places where raw color values are acceptable (canvas API and inline filter styles don't support CSS custom properties)

Animations not covered by Tailwind utility classes (hover top-line, glow shadows) are expressed as `className` strings using arbitrary values or `style` props — whichever is cleaner. Do not add a new CSS file.

---

## 8. Responsive Behavior

All multi-column layouts collapse to single-column at the `md` breakpoint (768px):

| Section | Desktop | Mobile |
|---------|---------|--------|
| Hero | `grid-cols: 1fr 480px` | Single col — spec panel moves below copy, hides if viewport < 480px |
| How it works | 3-col step grid | Single col, steps stacked |
| Features | Alternating 2-col blocks | Single col — visual panel below text, `reverse` direction ignored |
| Who it's for | 3-col card grid | Single col |
| FAQ | 2-col `280px 1fr` | Single col — header above Q&A list |
| Pricing | 3-col card grid | Single col |

The spec panel in the hero is decorative on mobile — hide it with `hidden md:block` so the mobile hero is just headline + subtext + CTAs. The Three.js canvas is also `hidden md:block`.

---

## 9. What Does Not Change

- `src/app/(marketing)/layout.tsx` — unchanged
- `src/features/marketing/components/marketing-header.tsx` — unchanged
- `src/features/marketing/components/footer.tsx` — unchanged
- `src/app/(marketing)/pricing/page.tsx` — unchanged
- All other routes — untouched

---

## 10. Success Criteria

- [ ] All 7 sections render correctly on desktop (1280px+) and mobile (375px+)
- [ ] Three.js canvas initializes and animates without console errors
- [ ] Framer Motion scroll animations fire once per element on viewport entry
- [ ] Typing indicator in spec panel loops continuously
- [ ] All CTA links point to correct routes (`/sign-up`, `/pricing`)
- [ ] No TypeScript errors (`pnpm tsc --noEmit` passes)
- [ ] No new ESLint errors
- [ ] `framer-motion` and `three` are in `package.json` dependencies (not devDependencies)
