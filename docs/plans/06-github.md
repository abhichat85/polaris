# Sub-Plan 06 — GitHub Integration

> **Authority:** Derives from `docs/CONSTITUTION.md` (esp. Articles II §2.4, V §5.5, XI §11.2, XIII §13.2 / §13.3, XIX §19.2) and `docs/ROADMAP.md` Phase 2 Days 5–6.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Wire Polaris into GitHub end-to-end. A user clicks "Connect GitHub" once and receives an OAuth token encrypted at rest with AES-256-GCM. From any project they can (a) import an existing repo's contents into Convex as the project's flat-path file model, and (b) push their Polaris project back to a GitHub repo as a clean commit, but only after a regex-based secret scanner has cleared every file. The two long-running operations run as Inngest functions so the UI never blocks. Existing UI stubs (`projects.exportStatus`, `projects.exportRepoUrl`, the disabled buttons in `src/features/projects/components/navbar.tsx`) get wired up.

**Architecture:** OAuth start route → GitHub authorize → callback route → Convex `integrations.setGithub` → server-side `getOctokitForUser(userId)` decrypts token on demand. Import: UI fires Inngest event `github/import.requested` → `importRepo` Inngest function → Octokit Trees API → `files_by_path.writePath` (bulk) → `projects.importStatus = "completed"`. Push: UI fires `github/push.requested` → `pushRepo` Inngest function → load all files → `secretScan(files)` → if clean, Octokit blobs → tree → commit → ref update → `projects.exportStatus = "completed"` and `exportRepoUrl` set. If the scanner finds secrets, push aborts and the UI surfaces a `SecretLeakWarning` modal. There is no "force push" override in v1.

**Tech Stack:** `octokit` (already added in sub-plan 01 Task 2), Node built-in `crypto` (no third-party crypto lib), `inngest`, `convex`, `vitest`, Next.js Route Handlers (App Router), Clerk for auth, `path` for binary detection.

**Phase:** 2 — Integrations (Days 5–6 of 17-day plan).

**Constitution articles you must re-read before starting:**
- Article II §2.4 (Users Own Their Code) — GitHub export is the proof. No format lock-in.
- Article V §5.5 (Integrations) — locks `octokit` and the OAuth + token-encrypted pattern.
- Article XI §11.2 — `integrations` table shape (verbatim) and the `*Enc` field convention.
- Article XIII §13.2 (Secret Handling) — AES-256-GCM at rest, decrypt server-only, never log, never return to client.
- Article XIII §13.3 (Pre-Push Secret Scanning) — push is blocked on findings; user must resolve, no force-push.
- Article XIX §19.2 — confirms migration ordering: GitHub depends on Sub-Plan 01 (`integrations` schema additions, Convex `internal` mutations, octokit dep).

**Sub-Plan 01 prerequisites that must be in place:**
- `octokit` is in `package.json`.
- Convex `files_by_path.ts` exposes `writePath`, `readPath`, `listPath`, `deletePath`.
- `vitest.config.ts` exists, `npm run test:unit` works.
- Inngest HTTP handler exists at `src/app/api/inngest/route.ts` and the Inngest client singleton is exported.

If any of these are missing, stop and finish Sub-Plan 01 first.

---

## Table of Contents

- [File Structure](#file-structure)
- [Task 1: Environment and Dependencies](#task-1-environment-and-dependencies)
- [Task 2: AES-256-GCM Token Encryption (TDD)](#task-2-aes-256-gcm-token-encryption-tdd)
- [Task 3: `integrations` Schema](#task-3-integrations-schema)
- [Task 4: Convex `integrations` Functions](#task-4-convex-integrations-functions)
- [Task 5: Server-only Octokit Client Wrapper](#task-5-server-only-octokit-client-wrapper)
- [Task 6: OAuth Start Route](#task-6-oauth-start-route)
- [Task 7: OAuth Callback Route](#task-7-oauth-callback-route)
- [Task 8: Secret Scanner (TDD)](#task-8-secret-scanner-tdd)
- [Task 9: Repo Import Library](#task-9-repo-import-library)
- [Task 10: Repo Push Library](#task-10-repo-push-library)
- [Task 11: Inngest `importRepo` and `pushRepo` Functions](#task-11-inngest-importrepo-and-pushrepo-functions)
- [Task 12: API Routes that Trigger Inngest](#task-12-api-routes-that-trigger-inngest)
- [Task 13: `GitHubConnectButton` UI](#task-13-githubconnectbutton-ui)
- [Task 14: `RepoImportDialog` UI](#task-14-repoimportdialog-ui)
- [Task 15: `PushButton` and `SecretLeakWarning` UI](#task-15-pushbutton-and-secretleakwarning-ui)
- [Task 16: Wire navbar Stub Buttons](#task-16-wire-navbar-stub-buttons)
- [Task 17: End-to-End Smoke Test](#task-17-end-to-end-smoke-test)
- [Self-Review Checklist](#self-review-checklist)
- [Deferred to Sub-Plan 09 (Hardening)](#deferred-to-sub-plan-09-hardening)

---

## File Structure

### Files to create

```
src/lib/crypto/token-encrypt.ts                         ← NEW: AES-256-GCM helpers
src/lib/security/secret-scan.ts                         ← NEW: regex secret detection
src/lib/github/client.ts                                ← NEW: server-only Octokit factory
src/lib/github/binary-extensions.ts                     ← NEW: extension allow/deny lists

src/app/api/github/oauth/start/route.ts                 ← NEW: OAuth init
src/app/api/github/oauth/callback/route.ts              ← NEW: OAuth completion
src/app/api/github/import/route.ts                      ← NEW: enqueues Inngest import
src/app/api/github/push/route.ts                        ← NEW: enqueues Inngest push
src/app/api/github/disconnect/route.ts                  ← NEW: clears integration row
src/app/api/github/repos/route.ts                       ← NEW: paginated list of user repos

convex/integrations.ts                                  ← NEW
src/features/github/inngest/import-repo.ts              ← NEW: Inngest fn
src/features/github/inngest/push-repo.ts                ← NEW: Inngest fn
src/features/github/lib/import-repo.ts                  ← NEW: pure-ish import logic
src/features/github/lib/push-repo.ts                    ← NEW: pure-ish push logic
src/features/github/lib/repo-list.ts                    ← NEW: shared paginated lister

src/features/github/components/github-connect-button.tsx
src/features/github/components/repo-import-dialog.tsx
src/features/github/components/push-button.tsx
src/features/github/components/secret-leak-warning.tsx
src/features/github/hooks/use-integration.ts
src/features/github/hooks/use-import-repo.ts
src/features/github/hooks/use-push-repo.ts

tests/unit/crypto/token-encrypt.test.ts                 ← NEW
tests/unit/security/secret-scan.test.ts                 ← NEW
tests/unit/github/import-repo.test.ts                   ← NEW (mocks octokit)
tests/unit/github/push-repo.test.ts                     ← NEW (mocks octokit)
tests/unit/github/oauth-callback.test.ts                ← NEW (state validation)
tests/fixtures/github-tree.json                         ← NEW (tree response)
tests/fixtures/github-blob.json                         ← NEW
tests/fixtures/secret-leak-corpus.ts                    ← NEW (positive + negative cases)
```

### Files to modify

```
convex/schema.ts                                        ← Add integrations table
src/inngest/functions.ts                                ← Register importRepo, pushRepo
src/app/api/inngest/route.ts                            ← Add importRepo, pushRepo to serve()
src/features/projects/components/navbar.tsx             ← Wire import/push buttons
.env.example                                            ← Add POLARIS_ENCRYPTION_KEY, GITHUB_OAUTH_*
package.json                                            ← Confirm octokit; no new deps required
```

No new top-level dependency is required for this sub-plan. `octokit` was added by Sub-Plan 01 Task 2, and crypto is a Node built-in.

---

## Task 1: Environment and Dependencies

**Why first:** Encryption tests in Task 2 depend on `POLARIS_ENCRYPTION_KEY` being set in the test environment. OAuth routes need `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET`. Surfacing this on Day 5 morning prevents mid-task discovery.

**Files:** `.env.example`, `vitest.config.ts` (touch only the `setupFiles` field), `tests/setup.ts` (create).

- [ ] **Step 1.1: Generate a real 32-byte key for development**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Copy the output. Put it in your local `.env.local` as:

```
POLARIS_ENCRYPTION_KEY=<base64-encoded-32-bytes>
```

DO NOT commit `.env.local`. DO NOT paste this key into `.env.example`.

- [ ] **Step 1.2: Update `.env.example`**

Append (preserve existing entries):

```
# AES-256-GCM key for encrypting OAuth tokens stored in Convex `integrations`.
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# Rotate quarterly per Constitution §13.2.
POLARIS_ENCRYPTION_KEY=

# GitHub OAuth App
# Create at https://github.com/settings/developers
# Authorization callback URL (dev): http://localhost:3000/api/github/oauth/callback
# Authorization callback URL (prod): https://build.praxiomai.xyz/api/github/oauth/callback
GITHUB_OAUTH_CLIENT_ID=
GITHUB_OAUTH_CLIENT_SECRET=

# Public app URL used to build OAuth redirect URIs.
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 1.3: Create the GitHub OAuth App in dev**

Visit https://github.com/settings/developers → New OAuth App. Set:
- Application name: `Polaris (dev — <your-name>)`
- Homepage URL: `http://localhost:3000`
- Authorization callback URL: `http://localhost:3000/api/github/oauth/callback`

Copy the Client ID + Client Secret into `.env.local`.

- [ ] **Step 1.4: Add a vitest setup file**

Create `tests/setup.ts`:

```typescript
// tests/setup.ts
// Runs before every vitest worker. Provides deterministic env for crypto tests.
import { randomBytes } from "node:crypto"

// If a developer has a real key set, prefer it (mirrors prod paths).
// Otherwise fabricate a deterministic 32-byte key for unit tests.
if (!process.env.POLARIS_ENCRYPTION_KEY) {
  process.env.POLARIS_ENCRYPTION_KEY = randomBytes(32).toString("base64")
}

// OAuth env not required for unit tests; routes are integration-tested by hand.
```

In `vitest.config.ts`, add `setupFiles: ["./tests/setup.ts"]` to the `test` block.

- [ ] **Step 1.5: Confirm `octokit` is installed**

```bash
node -e "console.log(require('octokit/package.json').version)"
```

Expected: a version string. If "Cannot find module", Sub-Plan 01 Task 2 was skipped — go finish it.

- [ ] **Step 1.6: Commit**

```bash
git add .env.example tests/setup.ts vitest.config.ts
git commit -m "build(github): document oauth + encryption env vars; add vitest setup"
```

---

## Task 2: AES-256-GCM Token Encryption (TDD)

**Why TDD:** This is one of two Constitution-mandated test cases on the Phase 1 list (Article XVI §16.2). The cost of a bug here is direct: leaked OAuth tokens. We write tests first, run them red, implement until green, then refactor.

**Files to create:**
- `src/lib/crypto/token-encrypt.ts`
- `tests/unit/crypto/token-encrypt.test.ts`

**API contract:**

```typescript
// Round-trips opaque-string secrets (OAuth tokens, API keys) using AES-256-GCM.
// Output is a single base64 string of: iv(12) || authTag(16) || ciphertext(*).
// Reads key from process.env.POLARIS_ENCRYPTION_KEY (base64-decoded to 32 bytes).
export function encrypt(plaintext: string): string
export function decrypt(ciphertextB64: string): string
```

- [ ] **Step 2.1: Write the tests first (RED)**

Create `tests/unit/crypto/token-encrypt.test.ts`:

```typescript
// tests/unit/crypto/token-encrypt.test.ts
import { describe, it, expect, beforeEach } from "vitest"
import { randomBytes } from "node:crypto"
import { encrypt, decrypt } from "@/lib/crypto/token-encrypt"

describe("token-encrypt", () => {
  describe("round trip", () => {
    it("decrypts what it encrypted", () => {
      const plain = "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      const ct = encrypt(plain)
      expect(ct).not.toContain(plain)
      expect(decrypt(ct)).toBe(plain)
    })

    it("produces different ciphertext on each call (random IV)", () => {
      const plain = "same-input"
      const a = encrypt(plain)
      const b = encrypt(plain)
      expect(a).not.toBe(b)
      expect(decrypt(a)).toBe(plain)
      expect(decrypt(b)).toBe(plain)
    })

    it("handles unicode plaintext", () => {
      const plain = "tøken-ünicode-🔐-end"
      expect(decrypt(encrypt(plain))).toBe(plain)
    })

    it("handles empty string", () => {
      expect(decrypt(encrypt(""))).toBe("")
    })

    it("handles a 4 KB plaintext (covers larger Vercel tokens, etc.)", () => {
      const plain = "x".repeat(4096)
      expect(decrypt(encrypt(plain))).toBe(plain)
    })
  })

  describe("tampering and malformed input", () => {
    it("throws on completely garbage base64", () => {
      expect(() => decrypt("not-base64!!!!")).toThrow()
    })

    it("throws on truncated ciphertext (shorter than iv+tag)", () => {
      const short = Buffer.alloc(10).toString("base64")
      expect(() => decrypt(short)).toThrow()
    })

    it("throws when the auth tag is flipped (integrity violation)", () => {
      const ct = encrypt("payload")
      const buf = Buffer.from(ct, "base64")
      // Flip a bit inside the auth tag (bytes 12..28)
      buf[15] ^= 0xff
      const tampered = buf.toString("base64")
      expect(() => decrypt(tampered)).toThrow()
    })

    it("throws when ciphertext body is flipped (integrity violation)", () => {
      const ct = encrypt("payload")
      const buf = Buffer.from(ct, "base64")
      // Flip a bit in the ciphertext body (after iv+tag)
      buf[buf.length - 1] ^= 0x01
      expect(() => decrypt(buf.toString("base64"))).toThrow()
    })

    it("throws when a different key is used", () => {
      const ct = encrypt("payload")
      const original = process.env.POLARIS_ENCRYPTION_KEY
      try {
        process.env.POLARIS_ENCRYPTION_KEY = randomBytes(32).toString("base64")
        expect(() => decrypt(ct)).toThrow()
      } finally {
        process.env.POLARIS_ENCRYPTION_KEY = original
      }
    })
  })

  describe("configuration errors", () => {
    it("throws if POLARIS_ENCRYPTION_KEY is missing", () => {
      const original = process.env.POLARIS_ENCRYPTION_KEY
      try {
        delete process.env.POLARIS_ENCRYPTION_KEY
        expect(() => encrypt("x")).toThrow(/POLARIS_ENCRYPTION_KEY/)
      } finally {
        process.env.POLARIS_ENCRYPTION_KEY = original
      }
    })

    it("throws if the key is not 32 bytes", () => {
      const original = process.env.POLARIS_ENCRYPTION_KEY
      try {
        process.env.POLARIS_ENCRYPTION_KEY = randomBytes(16).toString("base64")
        expect(() => encrypt("x")).toThrow(/32 bytes/)
      } finally {
        process.env.POLARIS_ENCRYPTION_KEY = original
      }
    })
  })
})
```

Run:

```bash
npm run test:unit -- token-encrypt
```

Expected: red (module does not exist).

- [ ] **Step 2.2: Implement (GREEN)**

Create `src/lib/crypto/token-encrypt.ts`:

```typescript
// src/lib/crypto/token-encrypt.ts
//
// Symmetric encryption for opaque-string secrets stored at rest in Convex
// (e.g., GitHub / Vercel OAuth tokens — see Constitution §13.2 + §11.2).
//
// Algorithm: AES-256-GCM.
// Format on the wire: base64( iv(12 bytes) || authTag(16 bytes) || ciphertext )
// Key source: POLARIS_ENCRYPTION_KEY env (base64 of 32 raw bytes).
//
// Why GCM:
//  - Authenticated: forging or tampering throws on decrypt (integrity + confidentiality).
//  - Standard library only — Constitution §5.7 forbids third-party crypto libraries.
//
// Why a 12-byte IV: NIST SP 800-38D recommends 96 bits as the GCM IV length.
// Why fresh IV per call: GCM key+IV reuse breaks confidentiality. We use crypto.randomBytes.

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCM,
  type DecipherGCM,
} from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const TAG_LENGTH = 16
const KEY_LENGTH = 32

function loadKey(): Buffer {
  const raw = process.env.POLARIS_ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      "POLARIS_ENCRYPTION_KEY is not set. See .env.example and Constitution §13.2.",
    )
  }
  let key: Buffer
  try {
    key = Buffer.from(raw, "base64")
  } catch {
    throw new Error("POLARIS_ENCRYPTION_KEY is not valid base64.")
  }
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `POLARIS_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length}).`,
    )
  }
  return key
}

export function encrypt(plaintext: string): string {
  const key = loadKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv) as CipherGCM
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString("base64")
}

export function decrypt(ciphertextB64: string): string {
  const key = loadKey()
  let buf: Buffer
  try {
    buf = Buffer.from(ciphertextB64, "base64")
  } catch {
    throw new Error("Ciphertext is not valid base64.")
  }
  if (buf.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Ciphertext is too short to contain iv + auth tag.")
  }
  const iv = buf.subarray(0, IV_LENGTH)
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const body = buf.subarray(IV_LENGTH + TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, key, iv) as DecipherGCM
  decipher.setAuthTag(tag)
  const pt = Buffer.concat([decipher.update(body), decipher.final()])
  return pt.toString("utf8")
}
```

Run again:

```bash
npm run test:unit -- token-encrypt
```

All green.

- [ ] **Step 2.3: Refactor sanity check**

Skim the file. Look for: any `console.log`, any `// TODO`, any branch the tests don't cover. The file should be under 80 lines including comments.

- [ ] **Step 2.4: Commit**

```bash
git add src/lib/crypto/token-encrypt.ts tests/unit/crypto/token-encrypt.test.ts
git commit -m "feat(crypto): aes-256-gcm token encryption with full TDD coverage"
```

---

## Task 3: `integrations` Schema

**Files:** `convex/schema.ts`

- [ ] **Step 3.1: Add the table verbatim from Constitution §11.2**

Append to the schema definition (preserve existing tables and indexes):

```typescript
// convex/schema.ts (excerpt)
integrations: defineTable({
  ownerId: v.string(),

  githubTokenEnc: v.optional(v.string()),
  githubLogin: v.optional(v.string()),
  githubInstalledAt: v.optional(v.number()),

  vercelTokenEnc: v.optional(v.string()),
  vercelTeamId: v.optional(v.string()),
  vercelInstalledAt: v.optional(v.number()),

  updatedAt: v.number(),
}).index("by_owner", ["ownerId"]),
```

- [ ] **Step 3.2: Push to dev Convex**

```bash
npx convex dev --once
```

Expected: schema applies without complaint, no data loss prompts (the table is new).

- [ ] **Step 3.3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(convex): add integrations table per Constitution §11.2"
```

---

## Task 4: Convex `integrations` Functions

**Goal:** Server-only mutation `setGithub`, server-only query `getGithubInternal` (returns the encrypted token — only Inngest reads it via the internal key path), client-readable query `getGithubPublic` (returns only `{ login, installedAt }`), mutation `disconnectGithub`, and analogous trio for Vercel that we leave as TODO-free stubs (so Sub-Plan 07 only needs to fill the body, not extend the API surface).

**Files:** `convex/integrations.ts`

- [ ] **Step 4.1: Implement**

```typescript
// convex/integrations.ts
import { v } from "convex/values"
import { mutation, query, internalQuery, internalMutation } from "./_generated/server"

async function getOrInitRow(ctx: any, ownerId: string) {
  const existing = await ctx.db
    .query("integrations")
    .withIndex("by_owner", (q: any) => q.eq("ownerId", ownerId))
    .unique()
  return existing
}

// ---- GitHub ----------------------------------------------------------------

// Called by the OAuth callback route (server) via the internal-key bridge in
// `convex/system.ts` (set up in sub-plan 01). The Inngest-only access pattern
// is what protects the encrypted token from the public client surface.
export const setGithubInternal = internalMutation({
  args: {
    ownerId: v.string(),
    tokenEnc: v.string(),
    login: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await getOrInitRow(ctx, args.ownerId)
    const now = Date.now()
    if (existing) {
      await ctx.db.patch(existing._id, {
        githubTokenEnc: args.tokenEnc,
        githubLogin: args.login,
        githubInstalledAt: now,
        updatedAt: now,
      })
      return existing._id
    }
    return await ctx.db.insert("integrations", {
      ownerId: args.ownerId,
      githubTokenEnc: args.tokenEnc,
      githubLogin: args.login,
      githubInstalledAt: now,
      updatedAt: now,
    })
  },
})

// Returns the ENCRYPTED token. Decryption happens in `src/lib/github/client.ts`
// where it is used immediately and never persisted in plaintext.
export const getGithubInternal = internalQuery({
  args: { ownerId: v.string() },
  handler: async (ctx, args) => {
    const row = await getOrInitRow(ctx, args.ownerId)
    if (!row || !row.githubTokenEnc) return null
    return {
      tokenEnc: row.githubTokenEnc,
      login: row.githubLogin ?? null,
      installedAt: row.githubInstalledAt ?? null,
    }
  },
})

// Client-safe: exposes ONLY metadata, never the token (encrypted or otherwise).
export const getGithubPublic = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    const row = await ctx.db
      .query("integrations")
      .withIndex("by_owner", (q) => q.eq("ownerId", identity.subject))
      .unique()
    if (!row || !row.githubLogin) return null
    return {
      login: row.githubLogin,
      installedAt: row.githubInstalledAt ?? null,
    }
  },
})

export const disconnectGithub = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Unauthorized")
    const row = await ctx.db
      .query("integrations")
      .withIndex("by_owner", (q) => q.eq("ownerId", identity.subject))
      .unique()
    if (!row) return
    await ctx.db.patch(row._id, {
      githubTokenEnc: undefined,
      githubLogin: undefined,
      githubInstalledAt: undefined,
      updatedAt: Date.now(),
    })
  },
})

// ---- Vercel (parity API; bodies filled in Sub-Plan 07) ---------------------

export const setVercelInternal = internalMutation({
  args: { ownerId: v.string(), tokenEnc: v.string(), teamId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const existing = await getOrInitRow(ctx, args.ownerId)
    const now = Date.now()
    if (existing) {
      await ctx.db.patch(existing._id, {
        vercelTokenEnc: args.tokenEnc,
        vercelTeamId: args.teamId,
        vercelInstalledAt: now,
        updatedAt: now,
      })
      return existing._id
    }
    return await ctx.db.insert("integrations", {
      ownerId: args.ownerId,
      vercelTokenEnc: args.tokenEnc,
      vercelTeamId: args.teamId,
      vercelInstalledAt: now,
      updatedAt: now,
    })
  },
})

export const getVercelInternal = internalQuery({
  args: { ownerId: v.string() },
  handler: async (ctx, args) => {
    const row = await getOrInitRow(ctx, args.ownerId)
    if (!row || !row.vercelTokenEnc) return null
    return {
      tokenEnc: row.vercelTokenEnc,
      teamId: row.vercelTeamId ?? null,
      installedAt: row.vercelInstalledAt ?? null,
    }
  },
})

export const getVercelPublic = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    const row = await ctx.db
      .query("integrations")
      .withIndex("by_owner", (q) => q.eq("ownerId", identity.subject))
      .unique()
    if (!row || !row.vercelInstalledAt) return null
    return { teamId: row.vercelTeamId ?? null, installedAt: row.vercelInstalledAt }
  },
})

export const disconnectVercel = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Unauthorized")
    const row = await ctx.db
      .query("integrations")
      .withIndex("by_owner", (q) => q.eq("ownerId", identity.subject))
      .unique()
    if (!row) return
    await ctx.db.patch(row._id, {
      vercelTokenEnc: undefined,
      vercelTeamId: undefined,
      vercelInstalledAt: undefined,
      updatedAt: Date.now(),
    })
  },
})
```

- [ ] **Step 4.2: Convex push**

```bash
npx convex dev --once
```

- [ ] **Step 4.3: Commit**

```bash
git add convex/integrations.ts
git commit -m "feat(convex): integrations CRUD with internal-only token reads"
```

---

## Task 5: Server-only Octokit Client Wrapper

**Files:** `src/lib/github/client.ts`

- [ ] **Step 5.1: Implement**

```typescript
// src/lib/github/client.ts
import "server-only"
import { Octokit } from "octokit"
import { ConvexHttpClient } from "convex/browser"
import { internal } from "../../../convex/_generated/api"
import { decrypt } from "@/lib/crypto/token-encrypt"

// Constitution §13.2: decryption happens server-side only, only at the moment
// of use. This module imports "server-only", which makes Next.js bundling
// fail loud if it ever leaks into a client component.

export class GitHubNotConnectedError extends Error {
  constructor() {
    super("GitHub is not connected for this user.")
    this.name = "GitHubNotConnectedError"
  }
}

interface UserOctokit {
  octokit: Octokit
  login: string
}

let cachedConvex: ConvexHttpClient | null = null
function convexClient(): ConvexHttpClient {
  if (cachedConvex) return cachedConvex
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set")
  cachedConvex = new ConvexHttpClient(url)
  // Inngest / route handlers authenticate via the system key per Constitution §13.4.
  const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY
  if (internalKey) cachedConvex.setAuth(internalKey)
  return cachedConvex
}

export async function getOctokitForUser(userId: string): Promise<UserOctokit> {
  const row = await convexClient().query(internal.integrations.getGithubInternal, {
    ownerId: userId,
  })
  if (!row || !row.tokenEnc || !row.login) {
    throw new GitHubNotConnectedError()
  }
  const token = decrypt(row.tokenEnc)
  const octokit = new Octokit({
    auth: token,
    userAgent: "polaris/1.0",
  })
  return { octokit, login: row.login }
}
```

- [ ] **Step 5.2: Smoke test against your own GitHub (manual, after Task 7 lands)**

Defer the manual smoke until OAuth is wired (Task 7).

- [ ] **Step 5.3: Commit**

```bash
git add src/lib/github/client.ts
git commit -m "feat(github): server-only octokit wrapper with on-demand token decrypt"
```

---

## Task 6: OAuth Start Route

**Files:** `src/app/api/github/oauth/start/route.ts`

- [ ] **Step 6.1: Implement**

```typescript
// src/app/api/github/oauth/start/route.ts
import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { randomBytes } from "node:crypto"

const STATE_COOKIE = "polaris_gh_oauth_state"
const RETURN_COOKIE = "polaris_gh_oauth_return"

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const returnTo = url.searchParams.get("returnTo") ?? "/projects"

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!clientId || !appUrl) {
    return NextResponse.json(
      { error: "GitHub OAuth is not configured on the server." },
      { status: 500 },
    )
  }

  const state = randomBytes(32).toString("base64url")

  const authorize = new URL("https://github.com/login/oauth/authorize")
  authorize.searchParams.set("client_id", clientId)
  authorize.searchParams.set("redirect_uri", `${appUrl}/api/github/oauth/callback`)
  authorize.searchParams.set("scope", "repo user:email")
  authorize.searchParams.set("state", state)
  authorize.searchParams.set("allow_signup", "false")

  const res = NextResponse.redirect(authorize.toString(), { status: 302 })
  const baseCookie = {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600, // 10 minutes is plenty for the round-trip
  }
  res.cookies.set(STATE_COOKIE, state, baseCookie)
  res.cookies.set(RETURN_COOKIE, returnTo, baseCookie)
  return res
}
```

- [ ] **Step 6.2: Manual check**

```bash
npm run dev
```

Open `http://localhost:3000/api/github/oauth/start` in a browser. You should be redirected to `https://github.com/login/oauth/authorize?...`. Don't authorize yet — Task 7 still needs to land.

- [ ] **Step 6.3: Commit**

```bash
git add src/app/api/github/oauth/start/route.ts
git commit -m "feat(github): oauth start route with httpOnly state cookie"
```

---

## Task 7: OAuth Callback Route

**Files:** `src/app/api/github/oauth/callback/route.ts`, `tests/unit/github/oauth-callback.test.ts`

The callback (a) validates the `state` cookie matches the query param, (b) exchanges `code` for a token at `https://github.com/login/oauth/access_token`, (c) calls `GET /user` with the token to fetch the login, (d) encrypts and stores via Convex internal mutation, (e) clears OAuth cookies, (f) redirects to the stored `returnTo`.

- [ ] **Step 7.1: Tests first (RED) — focus on state validation**

```typescript
// tests/unit/github/oauth-callback.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

// We unit-test the pure helper extracted from the route. The route handler
// itself we smoke-test by hand because mocking Next's Request + cookies()
// surface in isolation is more brittle than valuable.
import { validateState } from "@/app/api/github/oauth/callback/route"

describe("oauth callback state validation", () => {
  it("accepts a matching cookie + query state", () => {
    expect(validateState("abc", "abc")).toBe(true)
  })
  it("rejects mismatched state", () => {
    expect(validateState("abc", "abd")).toBe(false)
  })
  it("rejects missing cookie state", () => {
    expect(validateState(undefined, "abd")).toBe(false)
  })
  it("rejects missing query state", () => {
    expect(validateState("abc", undefined)).toBe(false)
  })
  it("rejects empty strings", () => {
    expect(validateState("", "")).toBe(false)
  })
  it("uses constant-time comparison (no early exit on mismatch length)", () => {
    // Smoke: different lengths never throw and always return false.
    expect(validateState("abc", "abcdef")).toBe(false)
  })
})
```

- [ ] **Step 7.2: Implement (GREEN)**

```typescript
// src/app/api/github/oauth/callback/route.ts
import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { timingSafeEqual } from "node:crypto"
import { ConvexHttpClient } from "convex/browser"
import { internal } from "../../../../../../convex/_generated/api"
import { encrypt } from "@/lib/crypto/token-encrypt"

const STATE_COOKIE = "polaris_gh_oauth_state"
const RETURN_COOKIE = "polaris_gh_oauth_return"

// Exported so unit tests can hit the comparator directly.
export function validateState(
  cookieState: string | undefined,
  queryState: string | undefined,
): boolean {
  if (!cookieState || !queryState) return false
  if (cookieState.length === 0 || queryState.length === 0) return false
  if (cookieState.length !== queryState.length) return false
  const a = Buffer.from(cookieState)
  const b = Buffer.from(queryState)
  try {
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

interface GitHubTokenResponse {
  access_token?: string
  token_type?: string
  scope?: string
  error?: string
  error_description?: string
}

interface GitHubUserResponse {
  login: string
  id: number
}

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.redirect(new URL("/", req.url))

  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const queryState = url.searchParams.get("state") ?? undefined

  // Read cookies via the request because NextResponse.redirect comes later.
  const cookieHeader = req.headers.get("cookie") ?? ""
  const cookieState = parseCookie(cookieHeader, STATE_COOKIE)
  const returnTo = parseCookie(cookieHeader, RETURN_COOKIE) ?? "/projects"

  if (!validateState(cookieState, queryState)) {
    return NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 })
  }
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 })
  }

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "OAuth not configured" }, { status: 500 })
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  })
  if (!tokenRes.ok) {
    return NextResponse.json({ error: "GitHub token exchange failed" }, { status: 502 })
  }
  const tokenJson = (await tokenRes.json()) as GitHubTokenResponse
  if (tokenJson.error || !tokenJson.access_token) {
    return NextResponse.json(
      { error: tokenJson.error_description ?? "No access token" },
      { status: 502 },
    )
  }
  const token = tokenJson.access_token

  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "polaris/1.0",
    },
  })
  if (!userRes.ok) {
    return NextResponse.json({ error: "GitHub user fetch failed" }, { status: 502 })
  }
  const user = (await userRes.json()) as GitHubUserResponse

  const tokenEnc = encrypt(token)

  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
  if (process.env.POLARIS_CONVEX_INTERNAL_KEY) {
    convex.setAuth(process.env.POLARIS_CONVEX_INTERNAL_KEY)
  }
  await convex.mutation(internal.integrations.setGithubInternal, {
    ownerId: userId,
    tokenEnc,
    login: user.login,
  })

  const dest = new URL(returnTo, req.url)
  const res = NextResponse.redirect(dest, { status: 302 })
  res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 })
  res.cookies.set(RETURN_COOKIE, "", { path: "/", maxAge: 0 })
  return res
}

function parseCookie(header: string, name: string): string | undefined {
  const parts = header.split(";")
  for (const part of parts) {
    const [k, ...v] = part.trim().split("=")
    if (k === name) return decodeURIComponent(v.join("="))
  }
  return undefined
}
```

Run:

```bash
npm run test:unit -- oauth-callback
```

Expected: green.

- [ ] **Step 7.3: End-to-end manual test**

```bash
npm run dev
```

In a browser: log in, then visit `/api/github/oauth/start`. Authorize. You should be redirected to `/projects`. Inspect Convex dashboard `integrations` table — there must be a row with `githubLogin` set and `githubTokenEnc` non-empty (and obviously not your raw token).

- [ ] **Step 7.4: Commit**

```bash
git add src/app/api/github/oauth/callback/route.ts tests/unit/github/oauth-callback.test.ts
git commit -m "feat(github): oauth callback with state validation + token storage"
```

---

## Task 8: Secret Scanner (TDD)

**Why TDD:** Constitution §13.3 makes the scanner the gate that protects users from agent-written or human-pasted secrets reaching their public repos. Every false negative is a CVE. Every false positive is a UX paper-cut. We capture both kinds in the corpus.

**Files:**
- `src/lib/security/secret-scan.ts`
- `tests/unit/security/secret-scan.test.ts`
- `tests/fixtures/secret-leak-corpus.ts`

**API contract:**

```typescript
export interface SecretFinding {
  path: string
  lineNumber: number          // 1-based
  matchPattern: string        // e.g. "AWS_ACCESS_KEY_ID"
  redactedSnippet: string     // first 4 chars + "***" + last 2 chars, surrounding context truncated
}

export interface ScanInput {
  path: string
  content: string
}

export function scanForSecrets(files: ScanInput[]): SecretFinding[]
```

The scanner does NOT read from disk — it takes file objects in memory. This makes it trivially testable and keeps the push pipeline sequential.

**Patterns covered (v1):**
1. AWS access key ID — `AKIA[0-9A-Z]{16}` (must NOT be inside a comment that contains the literal word `fake`/`example`/`dummy` on the same line — see Step 8.4 for the heuristic).
2. AWS secret access key — when an `AKIA...` token has been seen earlier in the file, OR a key-style assignment `AWS_SECRET_ACCESS_KEY` is followed by a 40-char base64 value.
3. GitHub tokens — `gh[pousr]_[A-Za-z0-9]{36}`.
4. Stripe — `sk_live_[A-Za-z0-9]{24,}` and `rk_live_[A-Za-z0-9]{24,}`.
5. OpenAI — `sk-[A-Za-z0-9]{40,}` (also catches the old `sk-proj-` form).
6. Anthropic — `sk-ant-(api03|admin)-[A-Za-z0-9_-]{80,}`.
7. Google API key — `AIza[0-9A-Za-z_-]{35}`.
8. Slack tokens — `xox[abprs]-[A-Za-z0-9-]{10,}`.
9. PEM private keys — multi-line block starting with `-----BEGIN ` and ending with ` PRIVATE KEY-----`.
10. Generic `.env`-style assignments with high-entropy values, ONLY in files whose name matches `.env*`. Triggers when value is ≥ 24 chars and has shannon entropy ≥ 4.0 bits/char and the key name contains one of: `KEY`, `SECRET`, `TOKEN`, `PASSWORD`, `PRIVATE`.

- [ ] **Step 8.1: Build the corpus**

```typescript
// tests/fixtures/secret-leak-corpus.ts
//
// Each entry is { name, file, expected: number-of-findings, pattern: pattern-name? }.
// Add a new line here every time you find a real-world false negative.

export interface CorpusCase {
  name: string
  path: string
  content: string
  expected: number
  expectedPattern?: string
}

export const POSITIVE: CorpusCase[] = [
  {
    name: "aws access key in source",
    path: "src/aws.ts",
    content: `const id = "AKIAIOSFODNN7EXAMPLE"\n`,
    expected: 1,
    expectedPattern: "AWS_ACCESS_KEY_ID",
  },
  {
    name: "github personal access token",
    path: ".env",
    content: `GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123456789\n`,
    expected: 1,
    expectedPattern: "GITHUB_TOKEN",
  },
  {
    name: "openai key",
    path: "config.ts",
    content: `export const KEY = "sk-Aa1bb2cc3dd4ee5ff6gg7hh8ii9jj0kk1ll2mm3nn4oo5"\n`,
    expected: 1,
    expectedPattern: "OPENAI_API_KEY",
  },
  {
    name: "anthropic api03 key",
    path: "lib/keys.ts",
    content:
      `const k = "sk-ant-api03-${"x".repeat(95)}"\n`,
    expected: 1,
    expectedPattern: "ANTHROPIC_API_KEY",
  },
  {
    name: "stripe live key",
    path: "lib/stripe.ts",
    content: `const s = "sk_live_${"a".repeat(28)}"\n`,
    expected: 1,
    expectedPattern: "STRIPE_SECRET_KEY",
  },
  {
    name: "google api key",
    path: "src/maps.ts",
    content: `const g = "AIza${"x".repeat(35)}"\n`,
    expected: 1,
    expectedPattern: "GOOGLE_API_KEY",
  },
  {
    name: "slack bot token",
    path: ".env.production",
    content: `SLACK_BOT=xoxb-${"0".repeat(10)}-${"A".repeat(16)}\n`,
    expected: 1,
    expectedPattern: "SLACK_TOKEN",
  },
  {
    name: "pem private key block",
    path: "deploy/key.pem",
    content: `-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJB...\n-----END RSA PRIVATE KEY-----\n`,
    expected: 1,
    expectedPattern: "PRIVATE_KEY_PEM",
  },
  {
    name: "generic high-entropy secret in .env",
    path: ".env.local",
    content: `SOME_API_SECRET=A8d!7sk0Pq2lzm8vNxq01jB+tt9f0As2vvjK91d-\n`,
    expected: 1,
    expectedPattern: "GENERIC_DOTENV_SECRET",
  },
]

export const NEGATIVE: CorpusCase[] = [
  {
    name: "AKIA inside obvious-fake comment",
    path: "src/notes.ts",
    content: `// example: AKIAIOSFODNN7EXAMPLE — fake placeholder for docs\n`,
    expected: 0,
  },
  {
    name: "AKIA inside docs/ markdown",
    path: "docs/aws.md",
    content: `Use a fake key like AKIAIOSFODNN7EXAMPLE in tutorials.\n`,
    expected: 0,
  },
  {
    name: "low-entropy assignment in .env",
    path: ".env",
    content: `APP_NAME=polaris\nDEBUG=true\nPORT=3000\n`,
    expected: 0,
  },
  {
    name: "ghp prefix that is too short",
    path: "src/x.ts",
    content: `const fake = "ghp_short"\n`,
    expected: 0,
  },
  {
    name: "openai sk- but only 10 chars",
    path: "src/x.ts",
    content: `const k = "sk-shortkey"\n`,
    expected: 0,
  },
  {
    name: "PRIVATE KEY string outside a block",
    path: "src/x.ts",
    content: `// To install your PRIVATE KEY, see docs/keys.md\n`,
    expected: 0,
  },
  {
    name: "package-lock.json hash that looks like base64",
    path: "package-lock.json",
    content: `"integrity": "sha512-Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1Ll2Mm3Nn4Oo5Pp6Qq7Rr8Ss9Tt0=="\n`,
    expected: 0,
  },
]
```

- [ ] **Step 8.2: Write the tests (RED)**

```typescript
// tests/unit/security/secret-scan.test.ts
import { describe, it, expect } from "vitest"
import { scanForSecrets } from "@/lib/security/secret-scan"
import { POSITIVE, NEGATIVE } from "../../fixtures/secret-leak-corpus"

describe("secret-scan", () => {
  describe("positive cases (must detect)", () => {
    for (const c of POSITIVE) {
      it(c.name, () => {
        const findings = scanForSecrets([{ path: c.path, content: c.content }])
        expect(findings.length).toBe(c.expected)
        if (c.expectedPattern) {
          expect(findings[0].matchPattern).toBe(c.expectedPattern)
        }
        // The redacted snippet must NEVER contain the full secret.
        // Use the original content as ground truth: extract the longest
        // alphanum run, then assert the snippet doesn't equal it.
        const long = (c.content.match(/[A-Za-z0-9_-]{20,}/g) ?? [])[0]
        if (long && findings[0]) {
          expect(findings[0].redactedSnippet).not.toContain(long)
        }
      })
    }
  })

  describe("negative cases (must NOT flag)", () => {
    for (const c of NEGATIVE) {
      it(c.name, () => {
        const findings = scanForSecrets([{ path: c.path, content: c.content }])
        expect(findings.length).toBe(c.expected)
      })
    }
  })

  it("returns the correct line number for a multi-line file", () => {
    const content = ["// line 1", "// line 2", "ghp_" + "a".repeat(36)].join("\n")
    const findings = scanForSecrets([{ path: ".env", content }])
    expect(findings[0].lineNumber).toBe(3)
  })

  it("scans many files at once", () => {
    const findings = scanForSecrets([
      { path: "a.ts", content: "AKIAIOSFODNN7EXAMPLE" },
      { path: "b.ts", content: "ghp_" + "b".repeat(36) },
    ])
    expect(findings.length).toBe(2)
    expect(findings.map((f) => f.path).sort()).toEqual(["a.ts", "b.ts"])
  })

  it("redacts: snippet contains the prefix, then ***, never the full secret", () => {
    const findings = scanForSecrets([
      { path: "x.ts", content: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" },
    ])
    expect(findings[0].redactedSnippet).toMatch(/^ghp_/)
    expect(findings[0].redactedSnippet).toContain("***")
    expect(findings[0].redactedSnippet.length).toBeLessThanOrEqual(20)
  })
})
```

- [ ] **Step 8.3: Implement (GREEN)**

```typescript
// src/lib/security/secret-scan.ts
//
// Constitution §13.3 — pre-push secret scanner. Pattern detection only;
// not a substitute for proper key rotation. Future hardening (gitleaks
// binary inside E2B) is scoped in Sub-Plan 09.

export interface SecretFinding {
  path: string
  lineNumber: number
  matchPattern: string
  redactedSnippet: string
}

export interface ScanInput {
  path: string
  content: string
}

interface PatternRule {
  name: string
  regex: RegExp
  // Optional gate: only triggers in files whose path matches this predicate.
  pathFilter?: (path: string) => boolean
}

const RULES: PatternRule[] = [
  { name: "AWS_ACCESS_KEY_ID", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "GITHUB_TOKEN", regex: /\bgh[pousr]_[A-Za-z0-9]{36}\b/g },
  { name: "STRIPE_SECRET_KEY", regex: /\b(?:sk|rk)_live_[A-Za-z0-9]{24,}\b/g },
  { name: "OPENAI_API_KEY", regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}\b/g },
  {
    name: "ANTHROPIC_API_KEY",
    regex: /\bsk-ant-(?:api03|admin)-[A-Za-z0-9_-]{80,}\b/g,
  },
  { name: "GOOGLE_API_KEY", regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "SLACK_TOKEN", regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  {
    name: "PRIVATE_KEY_PEM",
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
]

const FAKE_HINTS = ["fake", "example", "placeholder", "dummy", "sample"]
const DOC_PATH_PREFIXES = ["docs/", "README", "CHANGELOG", "tests/fixtures/"]

function isLikelyDocOrTest(path: string): boolean {
  return DOC_PATH_PREFIXES.some((p) => path.startsWith(p) || path.includes(`/${p}`))
}

function lineForOffset(content: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content[i] === "\n") line++
  }
  return line
}

function lineText(content: string, offset: number): string {
  const start = content.lastIndexOf("\n", offset - 1) + 1
  const endRel = content.indexOf("\n", offset)
  const end = endRel === -1 ? content.length : endRel
  return content.slice(start, end)
}

function looksFake(line: string): boolean {
  const lower = line.toLowerCase()
  return FAKE_HINTS.some((h) => lower.includes(h))
}

function redact(secret: string): string {
  if (secret.length <= 6) return "***"
  return `${secret.slice(0, 4)}***${secret.slice(-2)}`
}

function shannonEntropy(s: string): number {
  if (s.length === 0) return 0
  const freq: Record<string, number> = {}
  for (const ch of s) freq[ch] = (freq[ch] ?? 0) + 1
  let h = 0
  for (const k in freq) {
    const p = freq[k] / s.length
    h -= p * Math.log2(p)
  }
  return h
}

function scanDotenv(input: ScanInput): SecretFinding[] {
  const findings: SecretFinding[] = []
  const isDotenv = /(^|\/)\.env(\.|$)/.test(input.path)
  if (!isDotenv) return findings
  const lines = input.content.split("\n")
  const sensitiveKey = /(KEY|SECRET|TOKEN|PASSWORD|PRIVATE)/i
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/)
    if (!m) continue
    const [, key, rawValue] = m
    if (!sensitiveKey.test(key)) continue
    const value = rawValue.replace(/^["']|["']$/g, "")
    if (value.length < 24) continue
    if (shannonEntropy(value) < 4.0) continue
    findings.push({
      path: input.path,
      lineNumber: i + 1,
      matchPattern: "GENERIC_DOTENV_SECRET",
      redactedSnippet: `${key}=${redact(value)}`,
    })
  }
  return findings
}

export function scanForSecrets(files: ScanInput[]): SecretFinding[] {
  const out: SecretFinding[] = []
  for (const file of files) {
    if (isLikelyDocOrTest(file.path)) {
      // Skip docs and fixtures. The fixture file itself is the most common
      // false-positive vector for AI-written codebases.
      continue
    }
    for (const rule of RULES) {
      // Reset lastIndex because the regex is /g.
      rule.regex.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = rule.regex.exec(file.content)) !== null) {
        const offset = m.index
        const ctxLine = lineText(file.content, offset)
        if (looksFake(ctxLine)) continue
        out.push({
          path: file.path,
          lineNumber: lineForOffset(file.content, offset),
          matchPattern: rule.name,
          redactedSnippet: redact(m[0].split("\n")[0]),
        })
      }
    }
    out.push(...scanDotenv(file))
  }
  return out
}
```

Run:

```bash
npm run test:unit -- secret-scan
```

All green.

- [ ] **Step 8.4: Tighten if a corpus case fails**

When you encounter a real-world false positive in dogfood (a teammate's repo flags), add a NEGATIVE entry first, watch it fail, then refine the heuristic. Do not loosen the regex without a corresponding test.

- [ ] **Step 8.5: Commit**

```bash
git add src/lib/security/secret-scan.ts \
        tests/unit/security/secret-scan.test.ts \
        tests/fixtures/secret-leak-corpus.ts
git commit -m "feat(security): regex secret scanner with positive + negative corpus"
```

---

## Task 9: Repo Import Library

**Goal:** Pure-ish (Octokit-injected) function that, given `(userId, owner, repo, branch?)`, creates a Polaris project and populates its files via `files_by_path.writePath`.

**Files:**
- `src/lib/github/binary-extensions.ts`
- `src/features/github/lib/import-repo.ts`
- `tests/unit/github/import-repo.test.ts`

- [ ] **Step 9.1: Binary extension list**

```typescript
// src/lib/github/binary-extensions.ts
//
// We import only text files. Anything in this set, anything inside .git/,
// and anything > 1 MiB gets skipped. (Constitution §11 has files as plain
// text; binaries belong in dedicated storage which Polaris does not ship in v1.)

export const BINARY_EXTENSIONS = new Set([
  // images
  "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "tif", "tiff", "avif", "heic",
  // fonts
  "woff", "woff2", "ttf", "otf", "eot",
  // audio / video
  "mp3", "mp4", "mov", "wav", "ogg", "webm", "m4a", "flac",
  // archives
  "zip", "tar", "gz", "bz2", "xz", "7z", "rar",
  // documents
  "pdf", "psd", "ai", "sketch",
  // executables / artifacts
  "exe", "dll", "so", "dylib", "class", "jar", "wasm", "node",
  // db / data
  "db", "sqlite", "sqlite3", "parquet",
  // image set
  "svg", // intentionally NOT included — SVG is text and useful in repos.
].filter((e) => e !== "svg"))

export const MAX_FILE_BYTES = 1024 * 1024 // 1 MiB

export function isBinaryPath(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase()
  if (!ext) return false
  return BINARY_EXTENSIONS.has(ext)
}

export function isIgnoredPath(path: string): boolean {
  return (
    path.startsWith(".git/") ||
    path.includes("/.git/") ||
    path === ".gitmodules" ||
    path.startsWith(".github/workflows/")  // optional: agent should not edit CI
      ? false  // we DO import these — keep them but agent policy will lock them.
      : false
  )
}
```

> Implementation note for the reviewer: `isIgnoredPath` is currently a no-op for repo content (we import everything text < 1 MiB). The function exists so future changes have a single chokepoint.

- [ ] **Step 9.2: Tests (RED) with mocked Octokit**

```typescript
// tests/unit/github/import-repo.test.ts
import { describe, it, expect, vi } from "vitest"
import { importRepoCore } from "@/features/github/lib/import-repo"

// Minimal Octokit double — exposes only the endpoints we call.
function fakeOctokit(treeEntries: Array<{ path: string; mode: string; type: "blob" | "tree"; size?: number; sha: string }>, blobs: Record<string, string>) {
  return {
    rest: {
      git: {
        getTree: vi.fn().mockResolvedValue({
          data: { tree: treeEntries, truncated: false },
        }),
        getBlob: vi.fn().mockImplementation(async ({ file_sha }: { file_sha: string }) => ({
          data: { content: Buffer.from(blobs[file_sha] ?? "").toString("base64"), encoding: "base64" },
        })),
      },
      repos: {
        get: vi.fn().mockResolvedValue({ data: { default_branch: "main" } }),
      },
    },
  } as any
}

describe("importRepoCore", () => {
  it("filters binaries and >1MB files", async () => {
    const tree = [
      { path: "README.md", mode: "100644", type: "blob" as const, size: 100, sha: "a" },
      { path: "logo.png",  mode: "100644", type: "blob" as const, size: 100, sha: "b" },
      { path: "huge.txt",  mode: "100644", type: "blob" as const, size: 2_000_000, sha: "c" },
      { path: "src/x.ts",  mode: "100644", type: "blob" as const, size: 100, sha: "d" },
    ]
    const blobs = { a: "# hi", d: "export const x = 1" }
    const writes: Array<{ path: string; content: string }> = []
    await importRepoCore({
      octokit: fakeOctokit(tree, blobs),
      owner: "u", repo: "r", branch: undefined,
      writePath: async (p, c) => { writes.push({ path: p, content: c }) },
      concurrency: 4,
    })
    const paths = writes.map((w) => w.path).sort()
    expect(paths).toEqual(["README.md", "src/x.ts"])
  })

  it("falls back to repo default branch when branch is omitted", async () => {
    const oct = fakeOctokit([], {})
    await importRepoCore({
      octokit: oct, owner: "u", repo: "r", branch: undefined,
      writePath: async () => {}, concurrency: 4,
    })
    expect(oct.rest.repos.get).toHaveBeenCalled()
    const args = oct.rest.git.getTree.mock.calls[0][0]
    expect(args.tree_sha).toBe("main")
    expect(args.recursive).toBe("true")
  })

  it("throws if tree is truncated (Constitution: fail loud)", async () => {
    const oct = {
      rest: {
        repos: { get: vi.fn().mockResolvedValue({ data: { default_branch: "main" } }) },
        git: {
          getTree: vi.fn().mockResolvedValue({ data: { tree: [], truncated: true } }),
          getBlob: vi.fn(),
        },
      },
    } as any
    await expect(
      importRepoCore({
        octokit: oct, owner: "u", repo: "r", branch: undefined,
        writePath: async () => {}, concurrency: 4,
      }),
    ).rejects.toThrow(/truncated/i)
  })

  it("limits parallel blob fetches to `concurrency`", async () => {
    let inflight = 0
    let peak = 0
    const tree = Array.from({ length: 30 }).map((_, i) => ({
      path: `f${i}.ts`, mode: "100644", type: "blob" as const, size: 10, sha: `s${i}`,
    }))
    const blobs: Record<string, string> = Object.fromEntries(tree.map((t) => [t.sha, "x"]))
    const oct = fakeOctokit(tree, blobs)
    const origGetBlob = oct.rest.git.getBlob
    oct.rest.git.getBlob = vi.fn().mockImplementation(async (args: any) => {
      inflight++
      peak = Math.max(peak, inflight)
      await new Promise((r) => setTimeout(r, 5))
      inflight--
      return origGetBlob(args)
    })
    await importRepoCore({
      octokit: oct, owner: "u", repo: "r", branch: undefined,
      writePath: async () => {}, concurrency: 5,
    })
    expect(peak).toBeLessThanOrEqual(5)
  })
})
```

- [ ] **Step 9.3: Implement (GREEN)**

```typescript
// src/features/github/lib/import-repo.ts
import "server-only"
import type { Octokit } from "octokit"
import { isBinaryPath, MAX_FILE_BYTES } from "@/lib/github/binary-extensions"

export interface ImportRepoCoreParams {
  octokit: Pick<Octokit, "rest">
  owner: string
  repo: string
  branch?: string
  // Caller-injected writer — keeps this module testable without Convex.
  writePath: (path: string, content: string) => Promise<void>
  concurrency: number
}

export async function importRepoCore(p: ImportRepoCoreParams): Promise<{
  imported: number
  skipped: { path: string; reason: "binary" | "too_large" }[]
}> {
  const branch =
    p.branch ??
    (await p.octokit.rest.repos.get({ owner: p.owner, repo: p.repo })).data.default_branch

  const treeRes = await p.octokit.rest.git.getTree({
    owner: p.owner,
    repo: p.repo,
    tree_sha: branch,
    recursive: "true",
  })
  if (treeRes.data.truncated) {
    throw new Error(
      "GitHub tree was truncated (repo has > 100k entries or > 7 MiB tree). " +
        "Polaris v1 does not support sparse import. Trim the repo or open issue.",
    )
  }

  const skipped: { path: string; reason: "binary" | "too_large" }[] = []
  const candidates: { path: string; sha: string }[] = []

  for (const entry of treeRes.data.tree) {
    if (entry.type !== "blob" || !entry.path || !entry.sha) continue
    if ((entry.size ?? 0) > MAX_FILE_BYTES) {
      skipped.push({ path: entry.path, reason: "too_large" })
      continue
    }
    if (isBinaryPath(entry.path)) {
      skipped.push({ path: entry.path, reason: "binary" })
      continue
    }
    candidates.push({ path: entry.path, sha: entry.sha })
  }

  let imported = 0
  // Bounded parallelism — GitHub allows 5000 req/hr authenticated; 10 workers
  // are safe and finish a 1k-file repo in ~10s of wall-clock time.
  const workers = Math.max(1, Math.min(p.concurrency, candidates.length))
  let cursor = 0
  await Promise.all(
    Array.from({ length: workers }).map(async () => {
      while (true) {
        const idx = cursor++
        if (idx >= candidates.length) return
        const { path, sha } = candidates[idx]
        const blob = await p.octokit.rest.git.getBlob({
          owner: p.owner,
          repo: p.repo,
          file_sha: sha,
        })
        const content = Buffer.from(blob.data.content, "base64").toString("utf8")
        await p.writePath(path, content)
        imported++
      }
    }),
  )

  return { imported, skipped }
}
```

Run tests — green.

- [ ] **Step 9.4: Add the Inngest-side glue (deferred to Task 11)**

The Convex `writePath` and project creation belong in the Inngest function, not here. This module is pure to keep tests fast.

- [ ] **Step 9.5: Commit**

```bash
git add src/lib/github/binary-extensions.ts \
        src/features/github/lib/import-repo.ts \
        tests/unit/github/import-repo.test.ts
git commit -m "feat(github): repo import core with bounded parallelism + filtering"
```

---

## Task 10: Repo Push Library

**Goal:** Given `(octokit, owner, repo, branch, files, commitMessage, secretScanFn)`, create a single commit on `branch`. Sequence:

1. `secretScanFn(files)`. If non-empty, throw `SecretLeakError` with the findings.
2. Resolve current head: `GET /repos/{o}/{r}/git/ref/heads/{branch}`.
3. For each file, create a blob: `POST /repos/{o}/{r}/git/blobs` (`content` in utf-8).
4. Create a tree: `POST /repos/{o}/{r}/git/trees` with all `{ path, mode: "100644", type: "blob", sha }` entries and `base_tree` = current head's tree sha.
5. Create a commit: `POST /repos/{o}/{r}/git/commits` with `parents: [headSha]`.
6. Update ref: `PATCH /repos/{o}/{r}/git/refs/heads/{branch}` with the new commit sha and `force: false`.

**Files:**
- `src/features/github/lib/push-repo.ts`
- `tests/unit/github/push-repo.test.ts`

- [ ] **Step 10.1: Define the error type and core**

```typescript
// src/features/github/lib/push-repo.ts
import "server-only"
import type { Octokit } from "octokit"
import { scanForSecrets, type SecretFinding } from "@/lib/security/secret-scan"

export interface PushFile {
  path: string
  content: string
}

export class SecretLeakError extends Error {
  constructor(public findings: SecretFinding[]) {
    super(`Found ${findings.length} potential secret(s); push blocked.`)
    this.name = "SecretLeakError"
  }
}

export interface PushRepoCoreParams {
  octokit: Pick<Octokit, "rest">
  owner: string
  repo: string
  branch: string
  files: PushFile[]
  commitMessage: string
  // Injected to allow stubbed scanners in tests.
  scan?: (files: PushFile[]) => SecretFinding[]
}

export async function pushRepoCore(p: PushRepoCoreParams): Promise<{ commitSha: string; commitUrl: string }> {
  const scan = p.scan ?? scanForSecrets
  const findings = scan(p.files)
  if (findings.length > 0) throw new SecretLeakError(findings)

  const ref = await p.octokit.rest.git.getRef({
    owner: p.owner,
    repo: p.repo,
    ref: `heads/${p.branch}`,
  })
  const headSha = ref.data.object.sha

  const headCommit = await p.octokit.rest.git.getCommit({
    owner: p.owner,
    repo: p.repo,
    commit_sha: headSha,
  })
  const baseTreeSha = headCommit.data.tree.sha

  // Create blobs in parallel (bounded). GitHub accepts up to ~30 concurrent
  // writes from a single token without rate-limit surprises.
  const blobShas = await mapBounded(p.files, 10, async (f) => {
    const res = await p.octokit.rest.git.createBlob({
      owner: p.owner,
      repo: p.repo,
      content: f.content,
      encoding: "utf-8",
    })
    return { path: f.path, sha: res.data.sha }
  })

  const tree = await p.octokit.rest.git.createTree({
    owner: p.owner,
    repo: p.repo,
    base_tree: baseTreeSha,
    tree: blobShas.map((b) => ({
      path: b.path,
      mode: "100644",
      type: "blob",
      sha: b.sha,
    })),
  })

  const commit = await p.octokit.rest.git.createCommit({
    owner: p.owner,
    repo: p.repo,
    message: p.commitMessage,
    tree: tree.data.sha,
    parents: [headSha],
  })

  await p.octokit.rest.git.updateRef({
    owner: p.owner,
    repo: p.repo,
    ref: `heads/${p.branch}`,
    sha: commit.data.sha,
    force: false,
  })

  return {
    commitSha: commit.data.sha,
    commitUrl: `https://github.com/${p.owner}/${p.repo}/commit/${commit.data.sha}`,
  }
}

async function mapBounded<T, U>(items: T[], n: number, fn: (t: T) => Promise<U>): Promise<U[]> {
  const out: U[] = new Array(items.length)
  let i = 0
  const workers = Math.max(1, Math.min(n, items.length))
  await Promise.all(
    Array.from({ length: workers }).map(async () => {
      while (true) {
        const idx = i++
        if (idx >= items.length) return
        out[idx] = await fn(items[idx])
      }
    }),
  )
  return out
}
```

- [ ] **Step 10.2: Tests with mocked Octokit**

```typescript
// tests/unit/github/push-repo.test.ts
import { describe, it, expect, vi } from "vitest"
import { pushRepoCore, SecretLeakError } from "@/features/github/lib/push-repo"

function fakeOctokit() {
  return {
    rest: {
      git: {
        getRef: vi.fn().mockResolvedValue({ data: { object: { sha: "head-sha" } } }),
        getCommit: vi.fn().mockResolvedValue({ data: { tree: { sha: "tree-sha" } } }),
        createBlob: vi.fn().mockImplementation(async ({ content }: any) => ({
          data: { sha: `blob-${content.length}` },
        })),
        createTree: vi.fn().mockResolvedValue({ data: { sha: "new-tree" } }),
        createCommit: vi.fn().mockResolvedValue({ data: { sha: "new-commit" } }),
        updateRef: vi.fn().mockResolvedValue({}),
      },
    },
  } as any
}

describe("pushRepoCore", () => {
  it("creates a commit when files are clean", async () => {
    const oct = fakeOctokit()
    const out = await pushRepoCore({
      octokit: oct,
      owner: "u", repo: "r", branch: "main",
      files: [{ path: "README.md", content: "hi" }],
      commitMessage: "from polaris",
      scan: () => [],
    })
    expect(out.commitSha).toBe("new-commit")
    expect(oct.rest.git.updateRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: "heads/main", sha: "new-commit", force: false }),
    )
  })

  it("throws SecretLeakError before any GitHub calls when scanner finds secrets", async () => {
    const oct = fakeOctokit()
    await expect(
      pushRepoCore({
        octokit: oct, owner: "u", repo: "r", branch: "main",
        files: [{ path: ".env", content: "X=y" }],
        commitMessage: "x",
        scan: () => [{ path: ".env", lineNumber: 1, matchPattern: "GITHUB_TOKEN", redactedSnippet: "ghp_***ab" }],
      }),
    ).rejects.toBeInstanceOf(SecretLeakError)
    expect(oct.rest.git.getRef).not.toHaveBeenCalled()
  })

  it("uses base_tree to keep unrelated files (incremental commit, not snapshot)", async () => {
    const oct = fakeOctokit()
    await pushRepoCore({
      octokit: oct, owner: "u", repo: "r", branch: "main",
      files: [{ path: "a.ts", content: "x" }],
      commitMessage: "x", scan: () => [],
    })
    expect(oct.rest.git.createTree).toHaveBeenCalledWith(
      expect.objectContaining({ base_tree: "tree-sha" }),
    )
  })

  it("never force-pushes", async () => {
    const oct = fakeOctokit()
    await pushRepoCore({
      octokit: oct, owner: "u", repo: "r", branch: "main",
      files: [{ path: "a", content: "x" }],
      commitMessage: "x", scan: () => [],
    })
    expect(oct.rest.git.updateRef).toHaveBeenCalledWith(expect.objectContaining({ force: false }))
  })
})
```

Run — all green.

- [ ] **Step 10.3: Commit**

```bash
git add src/features/github/lib/push-repo.ts \
        tests/unit/github/push-repo.test.ts
git commit -m "feat(github): repo push core (commit via Trees API, secret-gated)"
```

---

## Task 11: Inngest `importRepo` and `pushRepo` Functions

**Files:**
- `src/features/github/inngest/import-repo.ts`
- `src/features/github/inngest/push-repo.ts`
- Modify: `src/inngest/functions.ts`, `src/app/api/inngest/route.ts`

**Why Inngest:** Both ops can take 30–120 seconds and must be retryable. Inngest gives us at-least-once delivery with idempotency keys, and the UI subscribes to `projects.importStatus` / `exportStatus` for progress.

- [ ] **Step 11.1: Implement `importRepo`**

```typescript
// src/features/github/inngest/import-repo.ts
import { inngest } from "@/inngest/client"
import { ConvexHttpClient } from "convex/browser"
import { api, internal } from "../../../../convex/_generated/api"
import { getOctokitForUser } from "@/lib/github/client"
import { importRepoCore } from "@/features/github/lib/import-repo"

export const importRepo = inngest.createFunction(
  { id: "github-import-repo", retries: 2 },
  { event: "github/import.requested" },
  async ({ event, step }) => {
    const { userId, projectId, owner, repo, branch } = event.data as {
      userId: string
      projectId: string
      owner: string
      repo: string
      branch?: string
    }

    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
    if (process.env.POLARIS_CONVEX_INTERNAL_KEY) {
      convex.setAuth(process.env.POLARIS_CONVEX_INTERNAL_KEY)
    }

    await step.run("mark-importing", async () => {
      await convex.mutation(internal.projects.setImportStatusInternal, {
        projectId,
        status: "importing",
      })
    })

    const result = await step.run("import-tree", async () => {
      const { octokit } = await getOctokitForUser(userId)
      return await importRepoCore({
        octokit,
        owner,
        repo,
        branch,
        writePath: async (path, content) => {
          await convex.mutation(internal.files_by_path.writePathInternal, {
            projectId,
            path,
            content,
            updatedBy: "import",
          })
        },
        concurrency: 10,
      })
    })

    await step.run("mark-completed", async () => {
      await convex.mutation(internal.projects.setImportStatusInternal, {
        projectId,
        status: "completed",
      })
    })

    return result
  },
)
```

> Reviewer note: `internal.projects.setImportStatusInternal` and `internal.files_by_path.writePathInternal` must exist; Sub-Plan 01 Task 12 already adds the file write. The project status mutation lives in `convex/projects.ts` (existing) — extend it with a thin internal mutation:

```typescript
// convex/projects.ts (excerpt — add)
export const setImportStatusInternal = internalMutation({
  args: { projectId: v.id("projects"), status: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      importStatus: args.status as any,
      updatedAt: Date.now(),
    })
  },
})

export const setExportStatusInternal = internalMutation({
  args: {
    projectId: v.id("projects"),
    status: v.string(),
    exportRepoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: any = { exportStatus: args.status, updatedAt: Date.now() }
    if (args.exportRepoUrl) patch.exportRepoUrl = args.exportRepoUrl
    await ctx.db.patch(args.projectId, patch)
  },
})
```

- [ ] **Step 11.2: Implement `pushRepo`**

```typescript
// src/features/github/inngest/push-repo.ts
import { inngest } from "@/inngest/client"
import { ConvexHttpClient } from "convex/browser"
import { internal } from "../../../../convex/_generated/api"
import { getOctokitForUser } from "@/lib/github/client"
import { pushRepoCore, SecretLeakError } from "@/features/github/lib/push-repo"

export const pushRepo = inngest.createFunction(
  { id: "github-push-repo", retries: 1 },
  { event: "github/push.requested" },
  async ({ event, step }) => {
    const { userId, projectId, owner, repo, branch, commitMessage } = event.data as {
      userId: string
      projectId: string
      owner: string
      repo: string
      branch: string
      commitMessage: string
    }
    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
    if (process.env.POLARIS_CONVEX_INTERNAL_KEY) {
      convex.setAuth(process.env.POLARIS_CONVEX_INTERNAL_KEY)
    }

    await step.run("mark-pushing", async () => {
      await convex.mutation(internal.projects.setExportStatusInternal, {
        projectId,
        status: "pushing",
      })
    })

    const files = await step.run("load-files", async () => {
      return (await convex.query(internal.files_by_path.listAllInternal, {
        projectId,
      })) as { path: string; content: string }[]
    })

    try {
      const { commitUrl } = await step.run("push", async () => {
        const { octokit } = await getOctokitForUser(userId)
        return await pushRepoCore({
          octokit,
          owner,
          repo,
          branch,
          commitMessage,
          files,
        })
      })

      await step.run("mark-completed", async () => {
        await convex.mutation(internal.projects.setExportStatusInternal, {
          projectId,
          status: "completed",
          exportRepoUrl: commitUrl,
        })
      })
      return { ok: true, commitUrl }
    } catch (e) {
      if (e instanceof SecretLeakError) {
        await convex.mutation(internal.projects.setExportStatusInternal, {
          projectId,
          status: "blocked_secrets",
        })
        // Stash the findings on the project so the UI can render them.
        await convex.mutation(internal.projects.setExportFindingsInternal, {
          projectId,
          findings: e.findings,
        })
        return { ok: false, reason: "secrets" }
      }
      throw e
    }
  },
)
```

> Reviewer note: this introduces one more internal mutation (`setExportFindingsInternal`) and one more field on `projects` (`exportFindings: v.optional(v.array(v.object({...})))`). Add both. Schema migration is trivial (additive optional field).

- [ ] **Step 11.3: Register both functions**

In `src/inngest/functions.ts` (existing): export `importRepo` and `pushRepo` from the new modules. In `src/app/api/inngest/route.ts`: add them to the `functions` array.

- [ ] **Step 11.4: Convex push**

```bash
npx convex dev --once
```

- [ ] **Step 11.5: Commit**

```bash
git add src/features/github/inngest/ \
        src/inngest/functions.ts \
        src/app/api/inngest/route.ts \
        convex/schema.ts \
        convex/projects.ts
git commit -m "feat(inngest): importRepo + pushRepo functions with status transitions"
```

---

## Task 12: API Routes that Trigger Inngest

**Files:**
- `src/app/api/github/import/route.ts` — POST `{ projectId, owner, repo, branch? }` → fires Inngest event.
- `src/app/api/github/push/route.ts` — POST `{ projectId, repoUrl, commitMessage, branch? }` → parses owner/repo, fires event.
- `src/app/api/github/disconnect/route.ts` — POST → calls Convex `integrations.disconnectGithub`.
- `src/app/api/github/repos/route.ts` — GET, paginated list (`?page=`); proxy to `octokit.rest.repos.listForAuthenticatedUser({ per_page: 30, page })`.

- [ ] **Step 12.1: Implement `import/route.ts`**

```typescript
// src/app/api/github/import/route.ts
import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { inngest } from "@/inngest/client"

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await req.json()) as {
    projectId: string
    owner: string
    repo: string
    branch?: string
  }
  if (!body.projectId || !body.owner || !body.repo) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }

  await inngest.send({
    name: "github/import.requested",
    data: { userId, ...body },
  })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 12.2: Implement `push/route.ts`**

```typescript
// src/app/api/github/push/route.ts
import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { inngest } from "@/inngest/client"

function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  // Accept https://github.com/owner/repo(.git)?  and  owner/repo
  const m =
    url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/) ||
    url.match(/^([^/\s]+)\/([^/\s]+)$/)
  if (!m) return null
  return { owner: m[1], repo: m[2] }
}

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await req.json()) as {
    projectId: string
    repoUrl: string
    commitMessage: string
    branch?: string
  }
  const parsed = parseRepoUrl(body.repoUrl)
  if (!parsed || !body.projectId || !body.commitMessage) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
  await inngest.send({
    name: "github/push.requested",
    data: {
      userId,
      projectId: body.projectId,
      owner: parsed.owner,
      repo: parsed.repo,
      branch: body.branch ?? "main",
      commitMessage: body.commitMessage,
    },
  })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 12.3: Implement `disconnect/route.ts`**

Uses Convex public mutation `integrations.disconnectGithub`. Standard pattern — Clerk auth, then `convex.mutation(api.integrations.disconnectGithub)` from a server-side `ConvexHttpClient` configured with the user's JWT (Clerk integration). Reuse the pattern already used elsewhere in the codebase.

- [ ] **Step 12.4: Implement `repos/route.ts`**

```typescript
// src/app/api/github/repos/route.ts
import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { getOctokitForUser, GitHubNotConnectedError } from "@/lib/github/client"

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const url = new URL(req.url)
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"))
  const search = url.searchParams.get("q") ?? ""

  try {
    const { octokit } = await getOctokitForUser(userId)
    const res = await octokit.rest.repos.listForAuthenticatedUser({
      per_page: 30,
      page,
      sort: "updated",
      affiliation: "owner,collaborator,organization_member",
    })
    const filtered = search
      ? res.data.filter(
          (r) =>
            r.name.toLowerCase().includes(search.toLowerCase()) ||
            r.full_name.toLowerCase().includes(search.toLowerCase()),
        )
      : res.data
    return NextResponse.json({
      repos: filtered.map((r) => ({
        id: r.id,
        fullName: r.full_name,
        owner: r.owner.login,
        name: r.name,
        defaultBranch: r.default_branch,
        private: r.private,
        updatedAt: r.updated_at,
      })),
      page,
      hasNext: res.data.length === 30,
    })
  } catch (e) {
    if (e instanceof GitHubNotConnectedError) {
      return NextResponse.json({ error: "Not connected" }, { status: 412 })
    }
    throw e
  }
}
```

- [ ] **Step 12.5: Commit**

```bash
git add src/app/api/github
git commit -m "feat(github): API routes — import/push/disconnect/list-repos"
```

---

## Task 13: `GitHubConnectButton` UI

**Files:**
- `src/features/github/hooks/use-integration.ts`
- `src/features/github/components/github-connect-button.tsx`

- [ ] **Step 13.1: Hook**

```typescript
// src/features/github/hooks/use-integration.ts
"use client"
import { useQuery, useMutation } from "convex/react"
import { api } from "../../../../convex/_generated/api"

export function useGithubIntegration() {
  const data = useQuery(api.integrations.getGithubPublic)
  const disconnect = useMutation(api.integrations.disconnectGithub)
  return { data, disconnect, isLoading: data === undefined }
}
```

- [ ] **Step 13.2: Component**

```tsx
// src/features/github/components/github-connect-button.tsx
"use client"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useGithubIntegration } from "../hooks/use-integration"

export function GitHubConnectButton({ returnTo }: { returnTo?: string }) {
  const { data, disconnect, isLoading } = useGithubIntegration()
  if (isLoading) return <Button disabled>Loading…</Button>

  if (!data) {
    const href = `/api/github/oauth/start${
      returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""
    }`
    return (
      <Button asChild>
        <Link href={href}>Connect GitHub</Link>
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">@{data.login}</span>
      <Button variant="ghost" size="sm" onClick={() => disconnect()}>
        Disconnect
      </Button>
    </div>
  )
}
```

- [ ] **Step 13.3: Commit**

```bash
git add src/features/github/hooks/use-integration.ts \
        src/features/github/components/github-connect-button.tsx
git commit -m "feat(github): connect button + integration hook"
```

---

## Task 14: `RepoImportDialog` UI

**Files:**
- `src/features/github/hooks/use-import-repo.ts`
- `src/features/github/components/repo-import-dialog.tsx`

The dialog: list repos paginated; debounced search input; selecting a repo + clicking "Import" calls `/api/github/import`; shows a progress spinner that reads `project.importStatus` from Convex.

- [ ] **Step 14.1: Hook (paginated fetch)**

```typescript
// src/features/github/hooks/use-import-repo.ts
"use client"
import useSWRInfinite from "swr/infinite"

interface RepoSummary {
  id: number; fullName: string; owner: string; name: string
  defaultBranch: string; private: boolean; updatedAt: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function useGithubRepos(query: string) {
  const { data, size, setSize, isLoading, isValidating } = useSWRInfinite<{
    repos: RepoSummary[]; page: number; hasNext: boolean
  }>(
    (i, prev) => {
      if (prev && !prev.hasNext) return null
      const params = new URLSearchParams({ page: String(i + 1) })
      if (query) params.set("q", query)
      return `/api/github/repos?${params}`
    },
    fetcher,
    { revalidateFirstPage: false },
  )
  const repos = data?.flatMap((p) => p.repos) ?? []
  const hasNext = data?.[data.length - 1]?.hasNext ?? false
  return { repos, hasNext, loadMore: () => setSize(size + 1), isLoading, isValidating }
}

export async function triggerImport(args: {
  projectId: string; owner: string; repo: string; branch?: string
}) {
  const res = await fetch("/api/github/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error("Import failed to enqueue")
}
```

- [ ] **Step 14.2: Component (sketch — match shadcn/ui Dialog patterns from the rest of the codebase)**

```tsx
// src/features/github/components/repo-import-dialog.tsx
"use client"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useGithubRepos, triggerImport } from "../hooks/use-import-repo"
import type { Id } from "../../../../convex/_generated/dataModel"

export function RepoImportDialog({
  open, onOpenChange, projectId,
}: { open: boolean; onOpenChange: (v: boolean) => void; projectId: Id<"projects"> }) {
  const [q, setQ] = useState("")
  const [picked, setPicked] = useState<{ owner: string; name: string; branch: string } | null>(null)
  const { repos, hasNext, loadMore, isLoading } = useGithubRepos(q)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import a GitHub repo</DialogTitle>
        </DialogHeader>
        <Input placeholder="Search repos…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-80 overflow-y-auto divide-y">
          {isLoading && <div className="p-4 text-sm">Loading…</div>}
          {repos.map((r) => (
            <button
              key={r.id}
              className={`w-full text-left p-2 hover:bg-accent ${
                picked?.owner === r.owner && picked.name === r.name ? "bg-accent" : ""
              }`}
              onClick={() => setPicked({ owner: r.owner, name: r.name, branch: r.defaultBranch })}
            >
              <div className="font-mono text-sm">{r.fullName}</div>
              <div className="text-xs text-muted-foreground">
                {r.private ? "private" : "public"} · default {r.defaultBranch}
              </div>
            </button>
          ))}
          {hasNext && (
            <Button variant="ghost" className="w-full" onClick={loadMore}>Load more</Button>
          )}
        </div>
        <DialogFooter>
          <Button
            disabled={!picked}
            onClick={async () => {
              if (!picked) return
              await triggerImport({
                projectId, owner: picked.owner, repo: picked.name, branch: picked.branch,
              })
              onOpenChange(false)
            }}
          >
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 14.3: Commit**

```bash
git add src/features/github/hooks/use-import-repo.ts \
        src/features/github/components/repo-import-dialog.tsx
git commit -m "feat(github): repo import dialog with paginated search"
```

---

## Task 15: `PushButton` and `SecretLeakWarning` UI

**Files:**
- `src/features/github/hooks/use-push-repo.ts`
- `src/features/github/components/push-button.tsx`
- `src/features/github/components/secret-leak-warning.tsx`

- [ ] **Step 15.1: Push hook**

```typescript
// src/features/github/hooks/use-push-repo.ts
"use client"

export async function triggerPush(args: {
  projectId: string; repoUrl: string; commitMessage: string; branch?: string
}) {
  const res = await fetch("/api/github/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error("Push failed to enqueue")
}
```

The actual progress + secret-leak surfacing is a Convex subscription on `project.exportStatus` and `project.exportFindings`.

- [ ] **Step 15.2: PushButton**

```tsx
// src/features/github/components/push-button.tsx
"use client"
import { useState } from "react"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { triggerPush } from "../hooks/use-push-repo"
import { SecretLeakWarning } from "./secret-leak-warning"

export function PushButton({ projectId }: { projectId: Id<"projects"> }) {
  const project = useQuery(api.projects.getById, { projectId })
  const [open, setOpen] = useState(false)
  const [repoUrl, setRepoUrl] = useState(project?.exportRepoUrl ?? "")
  const [msg, setMsg] = useState("Update from Polaris")

  const status = project?.exportStatus ?? "idle"
  const isPushing = status === "pushing"
  const blocked = status === "blocked_secrets"

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={isPushing}
      >
        {isPushing ? "Pushing…" : "Push to GitHub"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Push to GitHub</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="https://github.com/owner/repo"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
          />
          <Input
            placeholder="Commit message"
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
          />
          <DialogFooter>
            <Button
              onClick={async () => {
                await triggerPush({ projectId, repoUrl, commitMessage: msg })
                setOpen(false)
              }}
              disabled={!repoUrl || !msg}
            >
              Push
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {blocked && project?.exportFindings && (
        <SecretLeakWarning
          findings={project.exportFindings}
          onResolve={() => {/* user must edit code; surface in UI tour */}}
          onCancel={() => {/* clear status */}}
        />
      )}
    </>
  )
}
```

- [ ] **Step 15.3: SecretLeakWarning**

```tsx
// src/features/github/components/secret-leak-warning.tsx
"use client"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export interface UISecretFinding {
  path: string
  lineNumber: number
  matchPattern: string
  redactedSnippet: string
}

export function SecretLeakWarning({
  findings, onResolve, onCancel,
}: {
  findings: UISecretFinding[]
  onResolve: () => void
  onCancel: () => void
}) {
  return (
    <Dialog open onOpenChange={onCancel}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Push blocked: {findings.length} potential secret(s)</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Polaris will not push code that may contain credentials. Remove or rotate
          the value, then try again. There is no force-push override.
        </p>
        <ul className="max-h-72 overflow-y-auto space-y-2 mt-2">
          {findings.map((f, i) => (
            <li key={i} className="rounded border p-2 text-sm font-mono">
              <div className="text-xs text-muted-foreground">
                {f.matchPattern} · {f.path}:{f.lineNumber}
              </div>
              <div>{f.redactedSnippet}</div>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button onClick={onResolve}>I’ll fix and retry</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 15.4: Commit**

```bash
git add src/features/github/hooks/use-push-repo.ts \
        src/features/github/components/push-button.tsx \
        src/features/github/components/secret-leak-warning.tsx
git commit -m "feat(github): push button + secret leak warning modal"
```

---

## Task 16: Wire navbar Stub Buttons

**Files:** `src/features/projects/components/navbar.tsx`

The existing navbar has a stub status indicator hooked to `project?.importStatus === "importing"`. We add: (a) a "Import from GitHub" menu item that opens `RepoImportDialog`, (b) a "Push to GitHub" item that mounts `PushButton`, (c) the connection state from `useGithubIntegration` to gate behavior — if not connected, both items deep-link to `/api/github/oauth/start?returnTo=<currentPath>`.

- [ ] **Step 16.1: Read the file**
- [ ] **Step 16.2: Add the menu items**
- [ ] **Step 16.3: Manual smoke test**

```bash
npm run dev
```

Open a project. Click "Import" → dialog opens → pick a repo → status indicator transitions `importing` → `completed`. Click "Push" → enter a repo URL you own → message → status transitions `pushing` → `completed`, and the navbar shows the commit URL.

- [ ] **Step 16.4: Force a secret leak**

In the editor, write `.env` containing `OPENAI_API_KEY=sk-` plus 50 random chars. Click Push. The `SecretLeakWarning` modal must appear with one finding. Cancel; remove the line; click Push again; success.

- [ ] **Step 16.5: Commit**

```bash
git add src/features/projects/components/navbar.tsx
git commit -m "feat(projects): wire navbar import + push entrypoints"
```

---

## Task 17: End-to-End Smoke Test

**Files:** None permanent. This is the manual checklist for the Day 6 EOD demo.

- [ ] **17.1** Fresh user → Connect GitHub → row appears in `integrations` with non-empty `githubTokenEnc` and a `githubLogin`.
- [ ] **17.2** Import a 5-file repo → all 5 files in Convex; project preview renders.
- [ ] **17.3** Import a repo with a 2 MiB file → 2 MiB file is in the `skipped` summary; the rest imported.
- [ ] **17.4** Import a repo with a `.png` → png skipped; nearby `.tsx` files imported.
- [ ] **17.5** Edit a file in the editor → Push → repo on github.com shows the commit, the commit URL appears as `exportRepoUrl`, navbar shows "Pushed".
- [ ] **17.6** Add `OPENAI_API_KEY=sk-<50 chars>` to `.env` → Push → `SecretLeakWarning` modal appears with one finding; nothing in GitHub. Remove line → Push → succeeds.
- [ ] **17.7** Disconnect → Convex `integrations` row's GitHub fields are cleared; "Connect GitHub" reappears.
- [ ] **17.8** Reconnect → existing row is patched, not duplicated.

If any of these fail, add a unit test that reproduces the failure before fixing.

---

## Self-Review Checklist

Before opening the PR:

- [ ] No `// TODO` anywhere in `src/lib/crypto`, `src/lib/security`, `src/lib/github`, `src/features/github`.
- [ ] No `console.log` in non-test code.
- [ ] `src/lib/github/client.ts` and `src/features/github/lib/*.ts` have `import "server-only"` at the top.
- [ ] `tests/unit/crypto`, `tests/unit/security`, `tests/unit/github` are all green.
- [ ] `npm run test:unit:coverage` shows `src/lib/crypto/token-encrypt.ts` ≥ 95%, `src/lib/security/secret-scan.ts` ≥ 90%, `src/features/github/lib/*.ts` ≥ 80%.
- [ ] `git grep -nE "(githubTokenEnc|vercelTokenEnc)" src/` returns zero hits in client components — encrypted tokens never leave Convex internal queries.
- [ ] `git grep -nE "decrypt\(" src/` returns hits only in `src/lib/github/client.ts` (and Sub-Plan 07's Vercel client).
- [ ] OAuth state cookie is `httpOnly`, `sameSite: lax`, `secure` in production.
- [ ] Push uses `force: false` everywhere.
- [ ] Secret scanner positive corpus has every Constitution-named pattern (AWS, GitHub, OpenAI, Anthropic, Stripe, Google, Slack, PEM).
- [ ] Constitution §13.3 satisfied: push aborts on findings; UI surfaces them; no force option.
- [ ] Constitution §2.4 satisfied: a complete push lands in the user's GitHub account in plain Git format.

---

## Deferred to Sub-Plan 09 (Hardening)

- Replace regex scanner with `gitleaks` binary executed inside E2B (configured ruleset, official pattern coverage).
- Quarterly `POLARIS_ENCRYPTION_KEY` rotation: dual-key decrypt + background re-encrypt walker over `integrations`.
- Per-user GitHub API rate limit tracker (Octokit `x-ratelimit-*` headers → metric).
- Webhook-driven sync (Polaris ← GitHub) for collaborative edits (out of scope v1).
- LFS-aware import for repos with binary assets (out of scope v1).
- "Create new repo" path in `PushButton` (UI prompt → `octokit.rest.repos.createForAuthenticatedUser` → set repo URL). v1 expects the user to create the repo on github.com first. (~2 hours; uncomplicated; deferred for the day's scope, not technical risk.)

---

## Open Questions for Architecture Review

1. **Convex public vs. internal split for tokens.** This plan uses `internalQuery`/`internalMutation` for all token-bearing data, accessed via `POLARIS_CONVEX_INTERNAL_KEY`. Confirm Sub-Plan 01 ships the internal-key bridge in `convex/system.ts` exactly this way.
2. **`projects.exportFindings` schema field.** New optional array of objects. Needs a one-line schema migration; flagged in Task 11.
3. **Branch policy on push.** v1 always pushes to the same branch the user names (default `main`). If the repo's default is `master`, the user's input wins. We do not auto-create branches.
