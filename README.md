# Polaris — AI-Powered Cloud IDE

**Polaris** is an AI-native cloud IDE where you describe what you want to build and a running, full-stack app appears in under 90 seconds. It is an independent, production product by [Praxiom](https://praxiomai.xyz), shipping at **[build.praxiomai.xyz](https://build.praxiomai.xyz)**.

---

## The End State

> Describe an app. See it running. Iterate in plain English. Ship to the web in one click.

Polaris sits in the same space as Cursor, Bolt, and Lovable — but is built for the workflow where **the AI agent is the primary author** and the human is the director. The full v1 product:

1. **Prompt → Live App in <90s.** Type a description, Claude scaffolds a full-stack Next.js + Supabase project, boots it inside a sandboxed environment (E2B), and hands you a live preview URL — all without leaving the browser.

2. **AI Agent that actually edits files.** The agent runs in a real loop: it reads your codebase, writes changes file-by-file, runs terminal commands, and shows you every tool call as it happens. No mock responses. Streaming progress. Cancel mid-run and pick up from a checkpoint.

3. **Code editor that keeps you in control.** Full CodeMirror 6 editor with inline AI (ghost-text suggestions, Cmd+K quick edit), syntax highlighting for every major language, and a file explorer — so you can always read and edit the raw code.

4. **Manual spec panel.** A lightweight requirement tracker inside every project: list features, write acceptance criteria, mark status. The AI references it; you own it.

5. **GitHub integration.** Import any existing repo, iterate on it with the AI, and push clean commits back. Pre-push secret scanning blocks accidental credential leaks.

6. **One-click deploy.** Connect Vercel + Supabase once. After that, a single button provisions a Supabase database, injects env vars, and deploys to a live URL.

7. **Billing that makes sense.** Free tier to try it, Pro at $29/month for serious use, Team at $99/month. Hard quota enforcement — no surprise bills, no runaway sandbox costs.

8. **Production-grade infrastructure.** Rate limiting, error tracking (Sentry), structured logging with PII redaction, retry policies on every external API, sandbox cost ceilings, a real status page.

---

## What Makes It Different

| Axis | Bolt / Lovable | Cursor | Polaris |
|---|---|---|---|
| **Primary output** | Runnable apps | Edited local code | Runnable apps |
| **Agent transparency** | Hidden | Partial | Full tool-call stream |
| **Editor access** | Limited | Full | Full (CodeMirror 6) |
| **GitHub round-trip** | Export only | Local git | Import + push |
| **Deploy target** | Netlify/Vercel | Self-managed | Vercel + Supabase (auto) |
| **Spec / requirements** | None | None | Built-in spec panel |
| **Generated stack** | Varies | Any | Next.js 15 + Supabase |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| **Editor** | CodeMirror 6 with custom extensions |
| **Backend / DB** | Convex (real-time, source of truth) |
| **Background jobs** | Inngest |
| **AI** | Claude Sonnet 4.6 via Anthropic SDK (raw, no Vercel AI SDK) |
| **Sandbox** | E2B (via `SandboxProvider` abstraction — swappable) |
| **Auth** | Clerk (with GitHub OAuth) |
| **Generated apps** | Next.js 15 + Supabase Auth + Supabase Postgres |
| **Deploy pipeline** | Vercel REST API + Supabase Management API |
| **Billing** | Stripe |
| **Rate limiting** | Upstash Redis |
| **Observability** | Sentry, structured logging |
| **UI** | shadcn/ui, Radix UI |

---

## Current Status

The codebase covers the full foundation: authentication, real-time database, file system, code editor with inline AI (ghost text + Cmd+K), conversation system, file explorer, and background job infrastructure.

**In active development (17-day sprint to v1):**

| Phase | Days | Focus | Status |
|---|---|---|---|
| **Phase 1** | 1–4 | Agent loop, E2B sandbox, scaffolding, streaming UI, spec panel | In progress |
| **Phase 2** | 5–9 | GitHub integration, Vercel + Supabase deploy, Stripe billing | Upcoming |
| **Phase 3** | 10–13 | Hardening: rate limiting, Sentry, Playwright, CI | Upcoming |
| **Phase 4** | 14–17 | Onboarding, marketing site, legal pages, soft launch | Upcoming |

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the full 17-day plan and [`CONSTITUTION.md`](CONSTITUTION.md) for architectural decisions.

---

## Getting Started (Development)

### Prerequisites

- Node.js 20.09+
- npm or pnpm
- Accounts: Clerk, Convex, Inngest, Anthropic, E2B

### Installation

```bash
git clone https://github.com/code-with-antonio/polaris.git
cd polaris
npm install
cp .env.example .env.local
```

Configure `.env.local`:

```env
# Auth
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Database
NEXT_PUBLIC_CONVEX_URL=
CONVEX_DEPLOYMENT=
POLARIS_CONVEX_INTERNAL_KEY=   # Random string

# AI
ANTHROPIC_API_KEY=

# Sandbox (Phase 1)
E2B_API_KEY=

# Background jobs
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# Error tracking (optional)
SENTRY_DSN=
```

### Running locally

```bash
# Terminal 1 — Convex
npx convex dev

# Terminal 2 — Next.js
npm run dev

# Terminal 3 — Inngest
npx inngest-cli@latest dev
```

Open [http://localhost:3000](http://localhost:3000).

### Scripts

```bash
npm run dev      # Development server
npm run build    # Production build
npm run lint     # ESLint
npm run test     # Vitest unit tests (Phase 3+)
```

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── agent/          # Main agent loop (Phase 1)
│   │   ├── scaffold/       # App generation (Phase 1)
│   │   ├── suggestion/     # Inline ghost-text AI
│   │   └── quick-edit/     # Cmd+K editor AI
│   └── projects/           # IDE pages
├── features/
│   ├── agent/              # ModelAdapter, AgentRunner, ToolExecutor
│   ├── sandbox/            # SandboxProvider, E2BProvider
│   ├── editor/             # CodeMirror + extensions
│   ├── conversations/      # Chat system
│   ├── specs/              # Spec panel (Phase 1)
│   ├── github/             # GitHub integration (Phase 2)
│   └── projects/           # Project management
├── inngest/                # Background job functions
└── lib/                    # Utilities, crypto

convex/
├── schema.ts               # Database schema
├── projects.ts
├── files.ts
├── conversations.ts
├── specs.ts
└── system.ts

docs/
├── ROADMAP.md              # 17-day sprint plan
├── CONSTITUTION.md         # Architecture decisions + constraints
└── plans/                  # Per-subsystem implementation plans
```

---

## Architecture Principles

A few decisions that are locked in (see [`CONSTITUTION.md`](CONSTITUTION.md) for rationale):

- **Convex is source of truth.** E2B sandboxes are a write-through cache. On any drift, Convex wins.
- **No Vercel AI SDK.** All AI calls go through a custom `ModelAdapter` / `ClaudeAdapter` using raw Anthropic SDK. This keeps streaming predictable and avoids the abstraction tax.
- **Seven tools, no more.** The agent uses exactly: `read_file`, `write_file`, `edit_file`, `create_file`, `delete_file`, `list_files`, `run_command`. `edit_file` is the surgical-edit primitive (exact-substring replace, must be unique); `write_file` is reserved for full rewrites. Adding tools requires a constitutional amendment.
- **All four error recovery layers from Day 1.** API retry → tool feedback → checkpoint + resume → hard limits (50 iterations / 150K tokens / 5 minutes).
- **Generated apps are Next.js 15 + Supabase.** No variation. This makes scaffolding testable and deploys deterministic.

---

## Contributing

This is a private sprint toward a soft launch with 50 beta users. External contributions are not open yet.

If you find a security issue, email `security@praxiomai.xyz`.

---

## License

Proprietary. All rights reserved. © 2026 Praxiom.
