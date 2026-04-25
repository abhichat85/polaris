# Praxiom Design System
## Constitutional Design Document v2.0

This document is the **single source of truth** for all design decisions in the Praxiom application. It is written to be directly consumable by AI coding agents (Claude Code, Cursor, Lovable) and human engineers. Every new component, page, or feature must conform to this document. When in doubt, defer to patterns already present in `AppSidebar.tsx`, `DashboardView.tsx`, and `index.css`.

---

## 1. Brand Identity

### 1.1 Brand Philosophy
Praxiom is **structured intelligence** — a tool for founders who move fast and think clearly. The visual language reflects this:

- **Depth over decoration** — layered dark surfaces create hierarchy without borders or color noise
- **Restraint signals confidence** — Electric Indigo is reserved for moments of action and intelligence, never decoration
- **Precision typography** — tight tracking, tabular numbers, monospace labels communicate analytical precision
- **Zero ornamentation** — no gradients on surfaces, no rounded pill shapes on primary UI, no shadows for decoration

### 1.2 Tagline
*"The AI co-pilot for startup founders."*

### 1.3 Logo Treatment
- **Wordmark only**: `font-heading text-lg font-semibold tracking-tight text-foreground`
- No icon logo in current implementation

---

## 2. Color System

### 2.1 Philosophy
The color system is built on two principles:
1. **Surface depth replaces borders** — elevation is communicated through progressively lighter surface tokens (`surface-0` through `surface-4`), not border lines
2. **One accent color** — Electric Indigo (`235 100% 65%`) is the only non-neutral hue allowed in structural UI

### 2.2 Core Semantic Tokens (CSS Custom Properties)

#### Dark Mode (default — `:root`)

| Token | HSL Value | Usage |
|-------|-----------|-------|
| `--background` | `0 0% 5%` | Root page background |
| `--foreground` | `0 0% 95%` | Primary text |
| `--card` | `0 0% 8%` | Card surfaces |
| `--card-foreground` | `0 0% 95%` | Text on cards |
| `--popover` | `0 0% 7%` | Dropdown/popover backgrounds |
| `--popover-foreground` | `0 0% 95%` | Text on popovers |
| `--primary` | `235 100% 65%` | Primary actions, active states, brand accent |
| `--primary-foreground` | `0 0% 100%` | Text on primary backgrounds |
| `--secondary` | `0 0% 12%` | Secondary surfaces |
| `--secondary-foreground` | `0 0% 95%` | Text on secondary |
| `--muted` | `0 0% 10%` | Subtle backgrounds |
| `--muted-foreground` | `0 0% 55%` | Secondary text, labels, descriptions |
| `--accent` | `0 0% 12%` | Accent hover states |
| `--accent-foreground` | `0 0% 100%` | Text on accent |
| `--border` | `transparent` | Borders are NOT used for structure — use surface depth |
| `--input` | `0 0% 10%` | Input backgrounds |
| `--ring` | `235 100% 65%` | Focus rings (matches primary) |
| `--radius` | `0.75rem` | Base border radius (12px) |

#### Light Mode (`.light`)

| Token | HSL Value |
|-------|-----------|
| `--background` | `0 0% 98%` |
| `--foreground` | `0 0% 10%` |
| `--card` | `0 0% 100%` |
| `--primary` | `235 100% 55%` |
| `--secondary` | `0 0% 96%` |
| `--muted-foreground` | `0 0% 45%` |
| `--input` | `0 0% 96%` |

### 2.3 Surface Depth System

This is the most important pattern in the app. Use `surface-N` tokens to layer UI elements. **Do not use explicit border lines for structural separation** — use surface contrast instead.

| Token | Dark HSL | Light HSL | Meaning |
|-------|----------|-----------|---------|
| `--surface-0` | `0 0% 4%` | `0 0% 100%` | Deepest — main app background |
| `--surface-1` | `0 0% 6%` | `0 0% 98%` | Sidebar, top headers |
| `--surface-2` | `0 0% 9%` | `0 0% 96%` | Table headers, content area bg |
| `--surface-3` | `0 0% 12%` | `0 0% 94%` | Cards, interactive elements, nav items |
| `--surface-4` | `0 0% 15%` | `0 0% 92%` | Hovered/elevated cards, progress track |

**Rule:** Each UI layer should be one step lighter than its parent container. A card (`surface-3`) on a content area (`surface-2`) on the main background (`surface-0`).

### 2.4 Semantic State Colors

| Token | Dark HSL | Light HSL | Usage |
|-------|----------|-----------|-------|
| `--destructive` | `0 65% 50%` | `0 70% 45%` | Errors, delete actions |
| `--destructive-foreground` | `0 0% 100%` | `0 0% 100%` | Text on destructive |
| `--success` | `150 70% 45%` | `150 65% 40%` | Success states |
| `--success-foreground` | `0 0% 100%` | `0 0% 100%` | Text on success |
| `--warning` | `35 90% 55%` | `35 85% 50%` | Warnings, risk indicators |
| `--warning-foreground` | `0 0% 10%` | `0 0% 10%` | Text on warning |
| `--info` | `210 80% 55%` | `210 80% 50%` | Informational states |
| `--info-foreground` | `0 0% 100%` | `0 0% 100%` | Text on info |

### 2.5 Extended Tailwind Color Palette

```typescript
// tailwind.config.ts — key extensions
colors: {
  surface: { 0, 1, 2, 3 },          // hsl(var(--surface-N))
  steel: { DEFAULT, dark, light },    // 0 0% 70/50/85%
  silver: { DEFAULT, bright, dim },   // 0 0% 85/95/70%
  success: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
  info: "hsl(var(--info))",
}
```

### 2.6 Sidebar Tokens

| Token | Dark HSL | Light HSL |
|-------|----------|-----------|
| `--sidebar-background` | `0 0% 5%` | `0 0% 98%` |
| `--sidebar-foreground` | `0 0% 92%` | `0 0% 15%` |
| `--sidebar-primary` | `235 100% 65%` | `235 100% 55%` |
| `--sidebar-accent` | `0 0% 10%` | `0 0% 94%` |
| `--sidebar-accent-foreground` | `0 0% 92%` | `0 0% 15%` |

### 2.7 Color Usage Rules

1. **Electric Indigo only for**: primary buttons, active nav indicators, focus rings, progress fills, active badges, upload CTAs, selected states
2. **Never use colored backgrounds** for structural elements — only semantic states (success/warning/error/info)
3. **Never use `#FFFFFF` for text** — use `--foreground` (95% lightness)
4. **Never use border lines** for layout separation — use surface depth contrast
5. **Indigo at low opacity** (`primary/10`, `primary/15`) is allowed as a tinted background for selected/active regions
6. **Status colors at low opacity** (`success/15`, `warning/15`) for badge/chip backgrounds

---

## 3. Typography

### 3.1 Font Stack

| Role | Family | Weights | Tailwind Class |
|------|--------|---------|----------------|
| Headings, display | **Outfit** | 300–700 | `font-heading` |
| Body, UI text | **Inter** | 300–700 (+ italic 400) | `font-body` / default |
| Code, stats, labels | **JetBrains Mono** | 400–600 | `font-mono` |

**Never substitute fonts.** All three are loaded from Google Fonts. Outfit is for every heading, stat value, and wordmark. Inter is for every paragraph, label, description, and navigation item. JetBrains Mono is for every code block, numeric stat, monospace label, and progress indicator.

### 3.2 Font Features

```css
/* Inter */
font-feature-settings: "cv02" "cv03" "cv04" "cv11";

/* JetBrains Mono — all numeric displays */
font-variant-numeric: tabular-nums;
font-feature-settings: "tnum";
```

### 3.3 Type Scale (App UI)

| Context | Size | Weight | Tracking | Font |
|---------|------|--------|----------|------|
| View title (dashboard H1) | `text-3xl` | 700 | `-0.02em` | Outfit |
| Section heading | `text-xl` | 600 | `-0.01em` | Outfit |
| Card title | `text-base` | 500 | default | Outfit |
| Body text | `text-sm` | 400 | default | Inter |
| Nav item | `text-sm` | 500 | `-0.01em` | Inter |
| Description / label | `text-xs` | 400–500 | default | Inter |
| Section micro-label | `text-[10px]` | 600 | `0.14em` + uppercase | Inter |
| Badge / chip text | `text-[10px]`–`text-[11px]` | 600 | wide | Inter |
| Tiny stat | `text-[9px]` | 400 | default | JetBrains Mono |
| Stat value | `text-3xl` | 700 | `-0.03em` | JetBrains Mono |
| Inline code | `text-sm` | 400 | default | JetBrains Mono |

### 3.4 Global Heading Style

```css
h1, h2, h3, h4, h5, h6 {
  font-family: Outfit;
  font-weight: 600;
  letter-spacing: -0.01em;
}
```

### 3.5 Text Color Hierarchy

| Level | Class | Typical Usage |
|-------|-------|---------------|
| Primary | `text-foreground` | Headings, values, selected states |
| Secondary | `text-muted-foreground` | Descriptions, nav items, labels |
| Tertiary | `text-muted-foreground/70` | Supporting copy |
| Faint | `text-muted-foreground/50` | Timestamps, lowest-priority text |
| Accent | `text-primary` | Active states, links, highlights |
| Bright | `text-silver-bright` | Wordmark, top-level stat values |

---

## 4. Spacing & Layout

### 4.1 Base Unit
Tailwind default (4px). All spacing uses Tailwind utility classes.

### 4.2 Full-Screen App Shell

The app is a full-screen SPA with **no page scroll**. Everything fits in `h-screen`.

```
flex h-screen w-full overflow-hidden bg-surface-0
  ├── AppSidebar (fixed left, w-60 expanded / w-16 collapsed)
  └── Main column (flex-1 flex flex-col min-w-0)
        ├── Top Header (h-14, shrink-0, bg-surface-1)
        └── Content row (flex-1 flex overflow-hidden)
              ├── Content area (flex-1 overflow-y-auto scrollbar-thin)
              │     padding: p-5 md:p-6 lg:p-8
              └── Chat panel (hidden md:flex, w-0→480px animated)
```

### 4.3 Sidebar Dimensions

| State | Width | Class |
|-------|-------|-------|
| Expanded | 240px | `w-60` |
| Collapsed | 64px | `w-16` |

- **Logo bar**: `h-14 flex items-center px-3 bg-surface-1`
- **Nav section label**: `text-[10px] font-semibold uppercase tracking-widest opacity-60`
- **Nav item**: `w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium`
- **Active indicator**: `w-[2px] h-4 rounded-r-full bg-primary` (left-edge accent bar, not background fill)
- **Active item bg**: `bg-surface-3`
- **Bottom bar**: `bg-surface-1` separated by `h-px bg-surface-3`

### 4.4 Top Header

```tsx
<header className="h-14 flex items-center justify-between px-4 sm:px-6 bg-surface-1 shrink-0">
```

- **Height**: `h-14` (56px)
- **Left**: View title `text-sm font-heading font-semibold tracking-[-0.01em] text-foreground`
- **Center**: GlobalSearch (desktop only)
- **Right**: Action icons

### 4.5 Content Area Padding

| Breakpoint | Padding |
|------------|---------|
| Default | `p-5` (20px) |
| `md` | `p-6` (24px) |
| `lg` | `p-8` (32px) |

### 4.6 Standard Gap Scale

| Gap | Value | Usage |
|-----|-------|-------|
| `gap-1` | 4px | Tight icon+text |
| `gap-1.5` | 6px | Icon+label in badges |
| `gap-2` | 8px | Button internals |
| `gap-2.5` | 10px | Row items |
| `gap-3` | 12px | Card internals |
| `gap-4` | 16px | Grid columns, card rows |
| `gap-6` | 24px | Dashboard grid |

### 4.7 Grid Systems

**Dashboard stat grid:**
```tsx
<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
```

**Feature/content grid:**
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
```

---

## 5. Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `rounded-sm` | 8px | Small tags, mini badges |
| `rounded-md` | 10px | Inputs, small buttons |
| `rounded-lg` | 12px (`--radius`) | **Standard** — cards, nav items, tooltips, dropdowns |
| `rounded-xl` | 16px | Large cards, dropzones, modals |
| `rounded-2xl` | 24px | Mobile drawers, feature containers |
| `rounded-full` | 50% | Avatar circles, pill badges |

**Rule:** Within a component, never mix radius families. A card uses `rounded-lg` for all its children, not `rounded-xl` for some.

---

## 6. Shadows & Elevation

Praxiom uses **surface depth** as the primary elevation signal. Shadows are used sparingly and only for floating elements.

| Context | Shadow |
|---------|--------|
| Subtle hover card | `0 1px 3px hsl(0 0% 0% / 0.1)` |
| Dropdown menu | `0 8px 24px hsl(0 0% 0% / 0.45), 0 0 0 1px hsl(var(--surface-4))` |
| Popover/tooltip | `0 2px 8px hsl(0 0% 0% / 0.3)` |
| Inset border (normal) | `inset 0 0 0 1px hsl(var(--surface-4))` |
| Inset border (active/primary) | `inset 0 0 0 1px hsl(235 100% 65% / 0.3)` |

**Tailwind custom shadow classes** (defined in config, use where appropriate):
```
shadow-elegant  → var(--shadow-md)    → 0 4px 16px black/40
shadow-glow     → var(--shadow-glow)  → 0 0 40px indigo/20
shadow-steel    → var(--shadow-steel) → 0 4px 20px gray/20
```

---

## 7. Components

### 7.1 Buttons

**Base style:**
```tsx
inline-flex items-center justify-center gap-2 whitespace-nowrap
rounded-md text-sm font-medium
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background
disabled:pointer-events-none disabled:opacity-50
```

**Variants:**

| Variant | Background | Text | Border | Usage |
|---------|-----------|------|--------|-------|
| `default` | `bg-primary` | `text-primary-foreground` | none | Primary CTAs |
| `destructive` | `bg-destructive` | `text-destructive-foreground` | none | Delete/danger |
| `outline` | `bg-transparent` hover→`bg-surface-3` | `text-foreground` | none | Secondary actions |
| `secondary` | `bg-secondary` | `text-secondary-foreground` | none | Tertiary actions |
| `ghost` | transparent hover→`bg-surface-3` | `text-muted-foreground` | none | Icon buttons, minimal |
| `link` | transparent | `text-primary` | none | Text links |

**Sizes:**

| Size | Height | Padding | Radius |
|------|--------|---------|--------|
| `sm` | `h-8` | `px-3` | `rounded-md` |
| `default` | `h-9` | `px-4 py-2` | `rounded-md` |
| `lg` | `h-10` | `px-6` | `rounded-md` |
| `icon` | `h-9 w-9` | — | `rounded-md` |

### 7.2 Cards

**Standard card (content container):**
```tsx
<div className="rounded-lg bg-surface-3 p-4">
```

**Interactive card (hover lift):**
```tsx
<div className="rounded-lg bg-surface-3 hover:bg-surface-4 transition-colors cursor-pointer p-4">
```

**Card with icon header (stat card):**
```tsx
<div className="p-4 rounded-lg bg-surface-3 hover:bg-surface-4 transition-colors">
  <div className="flex items-center gap-2 mb-3">
    <Icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
  </div>
  <p className="text-3xl font-mono font-bold tabular-nums tracking-[-0.03em] text-foreground">{value}</p>
  <p className="text-[10px] mt-1.5 font-mono text-muted-foreground">{change}</p>
</div>
```

**shadcn Card component:**
- Base: `rounded-lg bg-surface-2`
- Header: `flex flex-col gap-1 p-4`
- Title: `text-base font-medium text-foreground` (Outfit)
- Description: `text-sm text-muted-foreground` (Inter)
- Content: `p-4 pt-0`
- Footer: `flex items-center p-4 pt-0`

### 7.3 Inputs

```tsx
<input className="
  flex h-9 w-full rounded-md
  bg-input px-3 py-1
  text-sm text-foreground
  placeholder:text-muted-foreground/50
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
  disabled:opacity-50
" />
```

**Never add border lines to inputs** — the `bg-input` surface contrast against the page background provides sufficient affordance.

### 7.4 Badges & Status Chips

```tsx
/* Status badge (semantic) */
<span className="text-[10px] px-2 py-0.5 rounded-md font-semibold uppercase tracking-wide
  bg-primary/10 text-primary">          /* active/selected */
  bg-warning/15 text-warning">          /* pending/warning */
  bg-success/15 text-success">          /* complete/success */
  bg-destructive/10 text-destructive">  /* error/failed */
  bg-surface-4 text-muted-foreground">  /* neutral/processing */
```

**Nav badge (count indicator):**
```tsx
<span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full
  bg-primary/15 text-primary">   /* active item */
  bg-surface-4 text-muted-foreground">  /* inactive item */
```

### 7.5 Progress Bars

```tsx
<div className="h-1.5 rounded-full overflow-hidden bg-surface-4">
  <div
    className="h-full rounded-full transition-all duration-500"
    style={{ width: `${pct}%`, backgroundColor: statusColor }}
  />
</div>
```

Progress fill colors (by completion %):
- **0–80%**: `hsl(150 60% 45%)` (green)
- **80–95%**: `hsl(40 95% 55%)` (amber)
- **95–100%**: `hsl(0 80% 60%)` (red)

**Shimmer progress bar** (loading/processing state):
```tsx
<div className="h-px w-full bg-surface-3 overflow-hidden rounded-full">
  <div className="h-full w-1/3 animate-shimmer-line bg-primary/60 rounded-full" />
</div>
```

### 7.6 Dropzone

```tsx
<div className="
  rounded-2xl p-10 flex flex-col items-center gap-3
  bg-surface-3 cursor-pointer
  transition-all duration-200
  /* default inset border */
  [box-shadow:inset_0_0_0_1px_hsl(var(--surface-4))]
  /* drag-active state */
  data-[drag=active]:bg-primary/5
  data-[drag=active]:[box-shadow:inset_0_0_0_1px_hsl(235_100%_65%_/_0.3)]
">
  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
    <Upload className="w-6 h-6 text-primary" />
  </div>
</div>
```

### 7.7 Chat Panel

- **Width**: animates `maxWidth` 0 → 480px (0.3s easeOut via Framer Motion)
- **Desktop**: `hidden md:flex flex-col overflow-hidden border-l border-surface-2`
- **Mobile**: `fixed inset-0 z-50` drawer, panel `h-[90dvh] rounded-t-2xl`
- **Messages**: left-aligned for both user and assistant
- **Streaming cursor**: `::after { content: "▊"; animation: blink 0.8s step-end infinite; }`
- **Tool step block**: `border-l-2 border-primary/40 pl-3`

### 7.8 Workspace Selector (Sidebar)

```tsx
/* Trigger button */
<button className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg
  bg-surface-3
  [box-shadow:0_1px_3px_hsl(0_0%_0%_/_0.1)]
  hover:bg-surface-4 transition-colors">
  /* Avatar */
  <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center
    text-white text-xs font-bold shrink-0">
    {initial}
  </div>
  <span className="text-sm font-medium truncate text-foreground">{name}</span>
  <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground ml-auto shrink-0" />
</button>

/* Dropdown */
<div className="rounded-xl py-1.5
  bg-popover
  [box-shadow:0_8px_24px_hsl(0_0%_0%_/_0.45),0_0_0_1px_hsl(var(--surface-4))]">
```

---

## 8. Icons

### 8.1 Library
**Lucide React** (`lucide-react`) — exclusively.

### 8.2 Icon Sizes

| Context | Size |
|---------|------|
| Standard UI icons | `w-4 h-4` |
| Small/inline | `w-3.5 h-3.5` |
| Large action icons | `w-5 h-5` |
| Upload/feature badge | `w-6 h-6` |
| Sidebar logo area | `w-5 h-5` |
| Mobile hamburger | `w-5 h-5` |

### 8.3 Icon Colors

| Context | Color |
|---------|-------|
| Default/inactive | `text-muted-foreground` |
| Active/selected | `text-primary` |
| Hover transition | `hover:text-foreground` or `group-hover:text-primary` |
| Destructive | `text-destructive` |
| Success | `text-success` |
| Warning | `text-warning` |

---

## 9. Animations & Interactions

### 9.1 Transition Speeds

| Duration | Usage |
|----------|-------|
| `duration-150` (default) | Color changes, opacity, standard hover |
| `duration-200` | Small scale/position changes |
| `duration-300` | Panel opens, medium interactions |
| `duration-500` | Progress bar fill, longer state changes |

**Rule:** Always use `transition-colors` for color-only changes. Use `transition-all` only when multiple properties change simultaneously.

### 9.2 Keyframe Animations (Defined in `index.css`)

| Name | Duration | Usage |
|------|----------|-------|
| `blink` | 0.8s step-end ∞ | Streaming cursor |
| `chat-enter` | 0.2s ease-out | New message appear |
| `pulse-dot` | 1.4s ease-out ∞ | Loading indicator dots |
| `shimmer` | 2s linear ∞ | Thinking/loading background |
| `shimmer-line` | 1.8s ease-in-out ∞ | 1px processing progress bar |
| `fade-in-up` | 0.4s ease-out | View transitions |
| `fade-in` | 0.3s ease-out | General fade-ins |
| `slide-in-right` | 0.3s ease-out | Panel slide-in |
| `scale-in` | 0.2s ease-out | Dropdown/modal appear |
| `accordion-down/up` | 0.2s ease-out | Expandable sections |

### 9.3 Framer Motion Patterns

Used for: chat panel width animation, message list entrance.

```typescript
/* Chat panel open/close */
animate={{ maxWidth: isOpen ? 480 : 0 }}
transition={{ duration: 0.3, ease: "easeOut" }}

/* Message entrance */
initial={{ opacity: 0, y: 6 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.2, ease: "easeOut" }}
```

### 9.4 Hover Patterns

**Interactive card:**
```tsx
className="hover:bg-surface-4 transition-colors cursor-pointer"
```

**Icon on hover:**
```tsx
className="group"
// child icon:
className="text-muted-foreground group-hover:text-primary transition-colors"
```

**Never use `hover:-translate-y-1` in the app UI** — card lift is a marketing site pattern. App UI uses color transitions only.

---

## 10. Scrollbars

```css
.scrollbar-thin {
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--surface-3)) transparent;
}
.scrollbar-thin::-webkit-scrollbar { width: 3px; }
.scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
.scrollbar-thin::-webkit-scrollbar-thumb {
  background-color: hsl(var(--surface-3));
  border-radius: 3px;
  transition: background-color 0.2s;
}
.scrollbar-thin::-webkit-scrollbar-thumb:hover {
  background-color: hsl(var(--surface-4));
}
```

Apply `scrollbar-thin` to every scrollable content area.

---

## 11. Code & Syntax Highlighting

Applied via custom `highlight.js` theme in `index.css`.

| Token type | Color |
|-----------|-------|
| Base text | `hsl(0 0% 82%)` |
| Keyword / tag | `hsl(235 85% 72%)` — indigo |
| String / bullet | `hsl(150 55% 62%)` — green |
| Comment | `hsl(0 0% 42%)` italic |
| Number | `hsl(35 85% 62%)` — amber |
| Function | `hsl(190 75% 62%)` — cyan |
| Type | `hsl(270 55% 68%)` — purple |
| Regexp | `hsl(10 70% 65%)` — red |
| Operator | `hsl(0 0% 52%)` |
| Background | `transparent` (inherits code block) |

---

## 12. Document Editor (TipTap / ProseMirror)

- **Checkbox** (unchecked): `bg-surface-3`, `border-radius: 4px`, `1rem × 1rem`
- **Checkbox** (checked): `bg-primary` + white `✓` checkmark; text gets `line-through opacity-50`
- **Table headers**: `bg-surface-2`, `text-xs uppercase tracking-wide font-semibold`
- **Table cell borders** (dark): `1px hsl(0 0% 100% / 0.05)` horizontal, `1px hsl(0 0% 100% / 0.03)` vertical
- **Selected cell**: `bg-primary/8`
- **Image focused**: `outline: 2px solid primary`, `outline-offset: 2px`, `border-radius: 8px`

---

## 13. Plan Tiers

The application supports four plan tiers. All billing UI must handle all four.

| Tier | Display Label | Badge Variant |
|------|--------------|---------------|
| `trial` | Free Trial | amber |
| `pro` | Pro | blue |
| `growth` | Growth | emerald |
| `power` | Power | violet |

---

## 14. Backgrounds & Ambient Effects

### Subtle ambient glow (behind key sections only)
```tsx
<div className="absolute inset-0 pointer-events-none overflow-hidden">
  <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2
    w-[600px] h-[400px] rounded-full blur-[160px]
    bg-primary/5" />
</div>
```

Use sparingly — maximum one glow per view, only on landing/onboarding pages. **Never in the main app workspace.**

### Grid pattern (decorative, low opacity)
```tsx
style={{
  backgroundImage: 'linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)',
  backgroundSize: '40px 40px'
}}
className="opacity-5"
```

---

## 15. Accessibility

- **Focus rings**: `ring-2 ring-primary ring-offset-2 ring-offset-background`
- **Disabled state**: `opacity-50 pointer-events-none`
- **Minimum contrast**: AA (4.5:1 for text, 3:1 for UI components)
- **Canvas/decorative elements**: `aria-hidden="true"`
- **Animated elements**: respect `prefers-reduced-motion` via browser defaults

---

## 16. Responsive Strategy

| Breakpoint | Key Changes |
|------------|-------------|
| Default (<640px) | Single column, collapsed sidebar, chat as bottom drawer |
| `md` (768px) | Sidebar visible, chat panel inline, 2-col grids |
| `lg` (1024px) | 4-col stat grids, larger content padding |

**Mobile-specific:**
- Chat opens as `fixed inset-0 z-50` bottom drawer (`h-[90dvh] rounded-t-2xl`)
- Sidebar is hidden, accessed via hamburger
- Content padding: `p-5` (tightest)

---

## 17. Anti-Patterns — What Never to Do

1. **Never add colored backgrounds** to structural layout elements — only semantic states
2. **Never use border lines** (`border border-white/10`, `border-steel-dark/20`) for card or section separation — use surface depth
3. **Never use `font-sans`** (DM Sans or system) for headings — always Outfit via `font-heading`
4. **Never use card lift** (`hover:-translate-y-1`) in the app workspace — this is a marketing pattern
5. **Never use `#FFFFFF` for text** — use `text-foreground` (95% lightness)
6. **Never add decorative gradients or glows** inside the main workspace views
7. **Never use `rounded-full` for non-circular elements** — avatars and pill badges only
8. **Never add explicit border styling to inputs** — surface contrast is sufficient
9. **Never break the 4-token surface progression** — don't skip from surface-1 to surface-4
10. **Never use colored text on colored backgrounds** without verifying WCAG AA contrast
11. **Never apply `shadow-glow`** to anything other than primary CTAs
12. **Never use bounce, spring, or playful animations** — this is operational software
13. **Never use `gradient-text`** on body copy — reserved for hero/marketing headline accents only
14. **Never put `font-mono` on headings** — monospace is only for stats, code, and micro-labels

---

> This document is the single source of truth for all design decisions in Polaris. Every new feature must reference it. When building with AI agents, include this document as system context.
>
> **Applies to:** Polaris (`build.praxiomai.xyz`) — inherited from Praxiom Design System v2.0
>
> Last updated: 2026-03-30 · v2.0 · Added to Polaris docs: 2026-04-26
