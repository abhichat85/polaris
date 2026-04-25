# Sub-Plan 07 — Deploy Pipeline

> **Authority:** Derives from `docs/CONSTITUTION.md` (esp. Articles V §5.4, XI §11.2, XIII) and `docs/ROADMAP.md` Phase 2 Days 6-7.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship the "click Deploy" pipeline that takes a Polaris-generated Next.js 15 + Supabase project, provisions a brand-new Supabase project on the Polaris org via the Management API, runs the project's accumulated SQL migrations against it, captures the keys, and pushes the file tree to the user's Vercel team via the Vercel REST API with the right env vars baked in. The end state: the user clicks one button, watches a 9-step progress drawer, and ends up with a live `*.vercel.app` URL within ~2-4 minutes — all orchestrated by a long-running Inngest function with persisted progress checkpoints visible to the UI.

**Architecture:** UI `DeployButton` → `POST /api/deploy { projectId }` → ownership + quota check → Convex `deployments.create` (status: `provisioning`) → Inngest event `deploy/start` → `deployProject` Inngest function with 10 idempotent `step.run` blocks → each step writes progress to the deployment row → UI subscribes via Convex `deployments.byProject` and renders `DeployStatus`. Two API clients: `SupabaseManagementClient` (org-level Bearer key, env-var) and `VercelRestClient` (per-user OAuth-style PAT decrypted from `integrations.vercelTokenEnc`, sub-plan 06). Files for Vercel are pulled inline from Convex `files_by_path.listAll`; SQL migrations are pulled from the same path namespace under `supabase/migrations/*.sql`.

**Tech Stack:** `inngest` (long-running orchestration), `convex` (deployment row + progress), `node:crypto` (db password generation), native `fetch` (no SDK — both Vercel and Supabase Management have first-class REST APIs and the SDKs add bundle weight + auth quirks we don't want), `vitest` + `msw` (HTTP mocking).

**Phase:** 2 — Productization (Days 6-7 of 17-day plan).

**Constitution articles you must re-read before starting:**
- Article V §5.4 (Generated Apps Stack) — Next.js 15 deliberate skew, Supabase auth + db, env var contract
- Article XI §11.2 (Schema: deployments table) — exact field names, indexes, status enum
- Article XIII (Security: env var handling) — encrypted-at-rest tokens, never log secrets, never echo service-role keys to client
- Article XIX §19.2 (Migration order) — this sub-plan implements step set 22-30

---

## Table of Contents

- [File Structure](#file-structure)
- [Task 1: Schema — deployments Table and Indexes](#task-1-schema--deployments-table-and-indexes)
- [Task 2: Convex Functions for Deployments](#task-2-convex-functions-for-deployments)
- [Task 3: Vercel REST Client — Types and Skeleton](#task-3-vercel-rest-client--types-and-skeleton)
- [Task 4: Vercel REST Client — createProject and createDeployment](#task-4-vercel-rest-client--createproject-and-createdeployment)
- [Task 5: Vercel REST Client — setEnvVars, getDeployment, domains.add stub](#task-5-vercel-rest-client--setenvvars-getdeployment-domainsadd-stub)
- [Task 6: Vercel REST Client — Error Handling and Retry](#task-6-vercel-rest-client--error-handling-and-retry)
- [Task 7: Supabase Management Client — Types and Skeleton](#task-7-supabase-management-client--types-and-skeleton)
- [Task 8: Supabase Management Client — createProject and getProject](#task-8-supabase-management-client--createproject-and-getproject)
- [Task 9: Supabase Management Client — getProjectKeys](#task-9-supabase-management-client--getprojectkeys)
- [Task 10: Migration Runner](#task-10-migration-runner)
- [Task 11: Quota Check Helper](#task-11-quota-check-helper)
- [Task 12: Deploy Pipeline — Inngest Function Skeleton](#task-12-deploy-pipeline--inngest-function-skeleton)
- [Task 13: Deploy Pipeline — Provision Supabase + Poll](#task-13-deploy-pipeline--provision-supabase--poll)
- [Task 14: Deploy Pipeline — Read Files + Run Migrations](#task-14-deploy-pipeline--read-files--run-migrations)
- [Task 15: Deploy Pipeline — Vercel Project + Env Vars + Deployment](#task-15-deploy-pipeline--vercel-project--env-vars--deployment)
- [Task 16: Deploy Pipeline — Poll until READY + Finalize](#task-16-deploy-pipeline--poll-until-ready--finalize)
- [Task 17: API Route POST /api/deploy](#task-17-api-route-post-apideploy)
- [Task 18: DeployButton Component](#task-18-deploybutton-component)
- [Task 19: DeployStatus Drawer](#task-19-deploystatus-drawer)
- [Task 20: DeployHistory List](#task-20-deployhistory-list)
- [Task 21: EnvVarEditor](#task-21-envvareditor)
- [Task 22: Wire Inngest Function into Serve Handler](#task-22-wire-inngest-function-into-serve-handler)
- [Task 23: Documentation and .env.example](#task-23-documentation-and-envexample)

---

## File Structure

### Files to create

```
src/lib/deploy/vercel-client.ts                            ← NEW: REST wrapper
src/lib/deploy/supabase-mgmt-client.ts                     ← NEW: REST wrapper
src/lib/deploy/run-migrations.ts                           ← NEW: SQL ordered runner
src/lib/deploy/types.ts                                    ← NEW: shared types
src/lib/deploy/quota.ts                                    ← NEW: quota check helper
src/lib/deploy/db-password.ts                              ← NEW: secure password gen
src/features/deploy/inngest/deploy-project.ts              ← NEW: Inngest function
src/features/deploy/components/deploy-button.tsx           ← NEW
src/features/deploy/components/deploy-status.tsx           ← NEW
src/features/deploy/components/deploy-history.tsx          ← NEW
src/features/deploy/components/env-var-editor.tsx          ← NEW
src/features/deploy/hooks/use-active-deployment.ts         ← NEW
src/app/api/deploy/route.ts                                ← NEW
convex/deployments.ts                                      ← NEW

tests/unit/deploy/vercel-client.test.ts                    ← NEW
tests/unit/deploy/supabase-mgmt-client.test.ts             ← NEW
tests/unit/deploy/run-migrations.test.ts                   ← NEW
tests/unit/deploy/deploy-project.test.ts                   ← NEW
tests/unit/deploy/quota.test.ts                            ← NEW
tests/fixtures/vercel-responses.ts                         ← NEW: recorded JSON
tests/fixtures/supabase-mgmt-responses.ts                  ← NEW: recorded JSON
```

### Files to modify

```
convex/schema.ts                                           ← Add `deployments` table + indexes
convex/usage.ts                                            ← Add `incrementDeployments` mutation
src/app/api/inngest/route.ts                               ← Register `deployProject`
src/features/projects/components/project-navbar.tsx        ← Mount `DeployButton`
.env.example                                               ← SUPABASE_MANAGEMENT_API_KEY, VERCEL_DEFAULT_TEAM_ID, SUPABASE_DEFAULT_REGION
```

---

## Task 1: Schema — deployments Table and Indexes

**Why first:** Every later task writes to or reads from this table; the Inngest function persists per-step progress here, and the API route returns the row's `_id`. Get the shape locked before writing any client code.

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1.1: Write a failing test against the schema**

Create `tests/unit/deploy/schema.test.ts`. Use Convex's in-memory test harness (`convex-test`) to assert that inserting a row with the canonical shape succeeds, and that inserting one with an unknown `status` fails validation.

```typescript
import { describe, it, expect } from "vitest"
import { convexTest } from "convex-test"
import schema from "../../../convex/schema"

describe("deployments schema", () => {
  it("accepts a provisioning row with required fields only", async () => {
    const t = convexTest(schema)
    const id = await t.run(async (ctx) => {
      return await ctx.db.insert("deployments", {
        projectId: "p_123" as any,
        status: "provisioning",
        triggeredBy: "u_456" as any,
        createdAt: Date.now(),
      })
    })
    expect(id).toBeDefined()
  })

  it("rejects an unknown status value", async () => {
    const t = convexTest(schema)
    await expect(
      t.run(async (ctx) =>
        ctx.db.insert("deployments", {
          projectId: "p_123" as any,
          status: "exploded",
          triggeredBy: "u_456" as any,
          createdAt: Date.now(),
        } as any)
      )
    ).rejects.toThrow()
  })
})
```

Run: `npm test -- schema.test`. Both tests fail (table missing).

- [ ] **Step 1.2: Add the table to `convex/schema.ts`**

Per Constitution §11.2, the canonical shape:

```typescript
deployments: defineTable({
  projectId: v.id("projects"),
  vercelDeploymentId: v.optional(v.string()),
  vercelUrl: v.optional(v.string()),
  vercelProjectId: v.optional(v.string()),
  supabaseProjectId: v.optional(v.string()),
  supabaseUrl: v.optional(v.string()),
  status: v.union(
    v.literal("provisioning"),
    v.literal("deploying"),
    v.literal("ready"),
    v.literal("error")
  ),
  step: v.optional(v.number()),               // 1..9 for UI progress
  stepLabel: v.optional(v.string()),
  errorMessage: v.optional(v.string()),
  triggeredBy: v.id("users"),
  createdAt: v.number(),
  finishedAt: v.optional(v.number()),
})
  .index("by_project", ["projectId"])
  .index("by_status", ["status"])
  .index("by_project_and_created", ["projectId", "createdAt"]),
```

Run the tests; both pass.

- [ ] **Step 1.3: Type-only export for the deployment status union**

Add `src/lib/deploy/types.ts`:

```typescript
export type DeploymentStatus = "provisioning" | "deploying" | "ready" | "error"

export const DEPLOY_STEPS = [
  "validate",
  "create_row",
  "provision_supabase",
  "capture_keys",
  "read_files",
  "run_migrations",
  "create_vercel_deployment",
  "poll_until_ready",
  "finalize",
] as const

export type DeployStepId = (typeof DEPLOY_STEPS)[number]

export const STEP_LABELS: Record<DeployStepId, string> = {
  validate: "Checking quotas",
  create_row: "Recording deployment",
  provision_supabase: "Provisioning Supabase project",
  capture_keys: "Capturing API keys",
  read_files: "Reading project files",
  run_migrations: "Applying database migrations",
  create_vercel_deployment: "Pushing to Vercel",
  poll_until_ready: "Waiting for build",
  finalize: "Finalizing",
}
```

- [ ] **Step 1.4: Commit**

```
chore(schema): add deployments table per Constitution §11.2
```

---

## Task 2: Convex Functions for Deployments

**Why now:** The Inngest function needs `create`, `patch`, and `markError` mutations, and the UI needs a `byProject` query.

**Files:**
- Create: `convex/deployments.ts`

- [ ] **Step 2.1: Write failing tests**

`tests/unit/deploy/convex-deployments.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { convexTest } from "convex-test"
import schema from "../../../convex/schema"
import { api } from "../../../convex/_generated/api"

describe("deployments convex functions", () => {
  it("create returns an _id with status=provisioning and step=1", async () => {
    const t = convexTest(schema)
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { /* minimum user fields */ } as any)
    )
    const projectId = await t.run((ctx) =>
      ctx.db.insert("projects", { ownerId: userId, name: "x" } as any)
    )
    const id = await t.mutation(api.deployments.create, { projectId })
    const row = await t.run((ctx) => ctx.db.get(id))
    expect(row?.status).toBe("provisioning")
    expect(row?.step).toBe(1)
  })

  it("setStep advances step and updates label", async () => { /* ... */ })
  it("markReady sets URLs, status=ready, finishedAt", async () => { /* ... */ })
  it("markError clears progress, sets errorMessage", async () => { /* ... */ })
  it("byProject returns rows ordered by createdAt desc", async () => { /* ... */ })
  it("getActive returns the most recent non-terminal row or null", async () => { /* ... */ })
})
```

Run: tests fail (module missing).

- [ ] **Step 2.2: Implement `convex/deployments.ts`**

Mutations: `create`, `setStep`, `setVercelLink`, `setSupabaseLink`, `markReady`, `markError`. Queries: `byId`, `byProject`, `getActive`.

```typescript
import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

export const create = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("UNAUTHENTICATED")
    const user = await ctx.db
      .query("users")
      .withIndex("by_subject", (q) => q.eq("subject", identity.subject))
      .unique()
    if (!user) throw new Error("USER_NOT_FOUND")
    const project = await ctx.db.get(projectId)
    if (!project || project.ownerId !== user._id) throw new Error("FORBIDDEN")

    return await ctx.db.insert("deployments", {
      projectId,
      status: "provisioning",
      step: 1,
      stepLabel: "Checking quotas",
      triggeredBy: user._id,
      createdAt: Date.now(),
    })
  },
})

export const setStep = mutation({
  args: {
    deploymentId: v.id("deployments"),
    step: v.number(),
    stepLabel: v.string(),
    status: v.optional(
      v.union(v.literal("provisioning"), v.literal("deploying"))
    ),
  },
  handler: async (ctx, { deploymentId, step, stepLabel, status }) => {
    const patch: Record<string, unknown> = { step, stepLabel }
    if (status) patch.status = status
    await ctx.db.patch(deploymentId, patch)
  },
})

export const setSupabaseLink = mutation({
  args: {
    deploymentId: v.id("deployments"),
    supabaseProjectId: v.string(),
    supabaseUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const { deploymentId, ...rest } = args
    await ctx.db.patch(deploymentId, rest)
  },
})

export const setVercelLink = mutation({
  args: {
    deploymentId: v.id("deployments"),
    vercelProjectId: v.string(),
    vercelDeploymentId: v.string(),
    vercelUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const { deploymentId, ...rest } = args
    await ctx.db.patch(deploymentId, rest)
  },
})

export const markReady = mutation({
  args: { deploymentId: v.id("deployments") },
  handler: async (ctx, { deploymentId }) => {
    await ctx.db.patch(deploymentId, {
      status: "ready",
      step: 9,
      stepLabel: "Live",
      finishedAt: Date.now(),
    })
  },
})

export const markError = mutation({
  args: {
    deploymentId: v.id("deployments"),
    errorMessage: v.string(),
  },
  handler: async (ctx, { deploymentId, errorMessage }) => {
    await ctx.db.patch(deploymentId, {
      status: "error",
      errorMessage,
      finishedAt: Date.now(),
    })
  },
})

export const byProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    return await ctx.db
      .query("deployments")
      .withIndex("by_project_and_created", (q) => q.eq("projectId", projectId))
      .order("desc")
      .take(50)
  },
})

export const getActive = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const rows = await ctx.db
      .query("deployments")
      .withIndex("by_project_and_created", (q) => q.eq("projectId", projectId))
      .order("desc")
      .take(1)
    const row = rows[0]
    if (!row) return null
    if (row.status === "provisioning" || row.status === "deploying") return row
    return null
  },
})

export const byId = query({
  args: { deploymentId: v.id("deployments") },
  handler: async (ctx, { deploymentId }) => ctx.db.get(deploymentId),
})
```

- [ ] **Step 2.3: Run all tests**

`npm test -- convex-deployments`. All pass.

- [ ] **Step 2.4: Commit**

---

## Task 3: Vercel REST Client — Types and Skeleton

**Why a class:** Pipeline tests need to inject a fake; a class with a constructor-injected `fetch` and `token` is the simplest seam.

**Files:**
- Create: `src/lib/deploy/vercel-client.ts` (skeleton only)
- Create: `tests/fixtures/vercel-responses.ts`

- [ ] **Step 3.1: Record real-shape fixtures**

Pull real responses (sanitized) from Vercel docs and prior manual `curl` runs. Save as inert JSON-stringified TS exports:

```typescript
// tests/fixtures/vercel-responses.ts
export const CREATE_PROJECT_OK = {
  id: "prj_abc123",
  name: "polaris-app-foo",
  framework: "nextjs",
  accountId: "team_xyz",
  createdAt: 1735000000000,
}

export const CREATE_DEPLOYMENT_OK = {
  id: "dpl_def456",
  url: "polaris-app-foo-abc.vercel.app",
  readyState: "QUEUED",
  createdAt: 1735000001000,
}

export const GET_DEPLOYMENT_BUILDING = { ...CREATE_DEPLOYMENT_OK, readyState: "BUILDING" }
export const GET_DEPLOYMENT_READY = { ...CREATE_DEPLOYMENT_OK, readyState: "READY" }
export const GET_DEPLOYMENT_ERROR = { ...CREATE_DEPLOYMENT_OK, readyState: "ERROR" }

export const ENV_SET_OK = { created: [{ id: "env_1", key: "NEXT_PUBLIC_SUPABASE_URL", target: ["production"] }] }

export const ERR_401 = { error: { code: "forbidden", message: "Not authorized" } }
export const ERR_429 = { error: { code: "rate_limited", message: "Too many requests" } }
export const ERR_500 = { error: { code: "internal", message: "Internal" } }
```

- [ ] **Step 3.2: Define the interface**

```typescript
// src/lib/deploy/vercel-client.ts
export interface VercelClientOptions {
  token: string
  teamId?: string
  fetchImpl?: typeof fetch
  retries?: number
  baseUrl?: string  // default https://api.vercel.com
}

export interface VercelFile {
  file: string   // path relative to project root, e.g. "app/page.tsx"
  data: string   // utf-8 file contents
}

export interface CreateProjectInput {
  name: string
  framework: "nextjs"
}

export interface CreateDeploymentInput {
  projectId: string
  files: VercelFile[]
  target: "production" | "preview"
  projectSettings?: { framework: "nextjs" }
}

export interface VercelEnvVar {
  key: string
  value: string
  target: ["production"] | ["preview"] | ["production", "preview"]
  type: "encrypted" | "plain"
}

export interface VercelDeploymentRecord {
  id: string
  url: string
  readyState: "QUEUED" | "BUILDING" | "READY" | "ERROR" | "CANCELED"
}

export class VercelClient {
  constructor(private readonly opts: VercelClientOptions) {
    if (!opts.token) throw new Error("VercelClient: token required")
  }
  // method skeletons; bodies in later tasks
  async createProject(_input: CreateProjectInput): Promise<{ projectId: string }> {
    throw new Error("not implemented")
  }
  async createDeployment(
    _input: CreateDeploymentInput
  ): Promise<VercelDeploymentRecord> {
    throw new Error("not implemented")
  }
  async setEnvVars(_args: { projectId: string; vars: VercelEnvVar[] }): Promise<void> {
    throw new Error("not implemented")
  }
  async getDeployment(_args: { deploymentId: string }): Promise<VercelDeploymentRecord> {
    throw new Error("not implemented")
  }
  domains = {
    add: async (_args: { projectId: string; domain: string }): Promise<void> => {
      throw new Error("domain support is out of scope for v1 — stub")
    },
  }
}
```

- [ ] **Step 3.3: Test bench skeleton**

```typescript
// tests/unit/deploy/vercel-client.test.ts
import { describe, it, expect, vi } from "vitest"
import { VercelClient } from "../../../src/lib/deploy/vercel-client"
import * as F from "../../fixtures/vercel-responses"

function mockFetch(responses: Array<{ status: number; body: unknown }>) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  let i = 0
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const r = responses[i++]
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { "content-type": "application/json" },
    })
  })
  return { fn, calls }
}

describe("VercelClient", () => {
  it("constructor throws without a token", () => {
    expect(() => new VercelClient({ token: "" })).toThrow()
  })
})
```

- [ ] **Step 3.4: Commit**

---

## Task 4: Vercel REST Client — createProject and createDeployment

**Files:** `src/lib/deploy/vercel-client.ts`, `tests/unit/deploy/vercel-client.test.ts`

- [ ] **Step 4.1: Write failing tests**

```typescript
it("createProject POSTs to /v9/projects with framework=nextjs and Bearer token", async () => {
  const { fn, calls } = mockFetch([{ status: 200, body: F.CREATE_PROJECT_OK }])
  const c = new VercelClient({ token: "tok_123", fetchImpl: fn as any })
  const out = await c.createProject({ name: "polaris-app-foo", framework: "nextjs" })
  expect(out).toEqual({ projectId: "prj_abc123" })
  expect(calls[0].url).toBe("https://api.vercel.com/v9/projects")
  expect((calls[0].init.headers as any).Authorization).toBe("Bearer tok_123")
  const body = JSON.parse(calls[0].init.body as string)
  expect(body).toEqual({ name: "polaris-app-foo", framework: "nextjs" })
})

it("createProject appends ?teamId= when provided", async () => {
  const { fn, calls } = mockFetch([{ status: 200, body: F.CREATE_PROJECT_OK }])
  const c = new VercelClient({ token: "t", teamId: "team_xyz", fetchImpl: fn as any })
  await c.createProject({ name: "x", framework: "nextjs" })
  expect(calls[0].url).toContain("teamId=team_xyz")
})

it("createDeployment POSTs to /v13/deployments with files array and target", async () => {
  const { fn, calls } = mockFetch([{ status: 200, body: F.CREATE_DEPLOYMENT_OK }])
  const c = new VercelClient({ token: "t", fetchImpl: fn as any })
  const out = await c.createDeployment({
    projectId: "prj_abc123",
    files: [{ file: "app/page.tsx", data: "export default function P(){}" }],
    target: "production",
  })
  expect(out.id).toBe("dpl_def456")
  expect(out.url).toBe("polaris-app-foo-abc.vercel.app")
  expect(calls[0].url).toBe("https://api.vercel.com/v13/deployments")
  const body = JSON.parse(calls[0].init.body as string)
  expect(body.name).toBe("prj_abc123")  // Vercel reuses name; we pass the project id
  expect(body.target).toBe("production")
  expect(body.files).toHaveLength(1)
  expect(body.files[0]).toEqual({ file: "app/page.tsx", data: "export default function P(){}" })
  expect(body.projectSettings).toEqual({ framework: "nextjs" })
})
```

Tests fail.

- [ ] **Step 4.2: Implement `createProject`**

```typescript
private url(path: string): string {
  const base = this.opts.baseUrl ?? "https://api.vercel.com"
  const u = new URL(base + path)
  if (this.opts.teamId) u.searchParams.set("teamId", this.opts.teamId)
  return u.toString()
}

private headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${this.opts.token}`,
    "Content-Type": "application/json",
  }
}

private get f(): typeof fetch {
  return this.opts.fetchImpl ?? fetch
}

async createProject(input: CreateProjectInput): Promise<{ projectId: string }> {
  const res = await this.f(this.url("/v9/projects"), {
    method: "POST",
    headers: this.headers(),
    body: JSON.stringify({ name: input.name, framework: input.framework }),
  })
  await this.assertOk(res, "createProject")
  const json = (await res.json()) as { id: string }
  return { projectId: json.id }
}
```

- [ ] **Step 4.3: Implement `createDeployment`**

```typescript
async createDeployment(input: CreateDeploymentInput): Promise<VercelDeploymentRecord> {
  const body = {
    name: input.projectId,
    project: input.projectId,
    target: input.target,
    files: input.files,
    projectSettings: input.projectSettings ?? { framework: "nextjs" },
  }
  const res = await this.f(this.url("/v13/deployments"), {
    method: "POST",
    headers: this.headers(),
    body: JSON.stringify(body),
  })
  await this.assertOk(res, "createDeployment")
  const json = (await res.json()) as { id: string; url: string; readyState: string }
  return {
    id: json.id,
    url: json.url,
    readyState: (json.readyState ?? "QUEUED") as VercelDeploymentRecord["readyState"],
  }
}
```

- [ ] **Step 4.4: Add a placeholder `assertOk` helper (full impl in Task 6)**

```typescript
private async assertOk(res: Response, op: string): Promise<void> {
  if (res.ok) return
  const text = await res.text()
  throw new Error(`vercel.${op} failed: ${res.status} ${text}`)
}
```

- [ ] **Step 4.5: Run tests; both pass. Commit.**

---

## Task 5: Vercel REST Client — setEnvVars, getDeployment, domains.add stub

**Files:** same.

- [ ] **Step 5.1: Failing tests**

```typescript
it("setEnvVars POSTs each var to /v10/projects/{id}/env", async () => {
  const { fn, calls } = mockFetch([
    { status: 200, body: F.ENV_SET_OK },
    { status: 200, body: F.ENV_SET_OK },
  ])
  const c = new VercelClient({ token: "t", fetchImpl: fn as any })
  await c.setEnvVars({
    projectId: "prj_abc123",
    vars: [
      { key: "NEXT_PUBLIC_SUPABASE_URL", value: "https://x.supabase.co", target: ["production"], type: "encrypted" },
      { key: "SUPABASE_SERVICE_ROLE_KEY", value: "secret", target: ["production"], type: "encrypted" },
    ],
  })
  expect(calls).toHaveLength(2)
  expect(calls[0].url).toBe("https://api.vercel.com/v10/projects/prj_abc123/env")
  const b = JSON.parse(calls[0].init.body as string)
  expect(b.key).toBe("NEXT_PUBLIC_SUPABASE_URL")
  expect(b.type).toBe("encrypted")
  expect(b.target).toEqual(["production"])
})

it("getDeployment GETs /v13/deployments/{id}", async () => {
  const { fn, calls } = mockFetch([{ status: 200, body: F.GET_DEPLOYMENT_BUILDING }])
  const c = new VercelClient({ token: "t", fetchImpl: fn as any })
  const out = await c.getDeployment({ deploymentId: "dpl_def456" })
  expect(out.readyState).toBe("BUILDING")
  expect(calls[0].url).toBe("https://api.vercel.com/v13/deployments/dpl_def456")
  expect((calls[0].init as any).method).toBe("GET")
})

it("domains.add throws explicit out-of-scope error", async () => {
  const c = new VercelClient({ token: "t" })
  await expect(c.domains.add({ projectId: "p", domain: "x.com" })).rejects.toThrow(/out of scope/)
})
```

- [ ] **Step 5.2: Implement**

```typescript
async setEnvVars({ projectId, vars }: { projectId: string; vars: VercelEnvVar[] }): Promise<void> {
  // Vercel's batch endpoint requires `upsert=true`; sequential POSTs are simpler and idempotent enough
  for (const v of vars) {
    const res = await this.f(this.url(`/v10/projects/${projectId}/env`), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(v),
    })
    if (res.status === 409) {
      // already exists — overwrite via PATCH on /v9/projects/{id}/env/{key} would require lookup; simpler: ignore for first cut
      continue
    }
    await this.assertOk(res, `setEnvVars[${v.key}]`)
  }
}

async getDeployment({ deploymentId }: { deploymentId: string }): Promise<VercelDeploymentRecord> {
  const res = await this.f(this.url(`/v13/deployments/${deploymentId}`), {
    method: "GET",
    headers: this.headers(),
  })
  await this.assertOk(res, "getDeployment")
  const json = (await res.json()) as { id: string; url: string; readyState: string }
  return {
    id: json.id,
    url: json.url,
    readyState: json.readyState as VercelDeploymentRecord["readyState"],
  }
}
```

- [ ] **Step 5.3: All tests green. Commit.**

---

## Task 6: Vercel REST Client — Error Handling and Retry

**Files:** same.

- [ ] **Step 6.1: Failing tests**

```typescript
it("throws a typed VercelApiError on 401 with parsed code/message", async () => {
  const { fn } = mockFetch([{ status: 401, body: F.ERR_401 }])
  const c = new VercelClient({ token: "t", fetchImpl: fn as any, retries: 0 })
  await expect(c.createProject({ name: "x", framework: "nextjs" })).rejects.toMatchObject({
    name: "VercelApiError",
    status: 401,
    code: "forbidden",
  })
})

it("retries 429 with exponential backoff up to `retries`", async () => {
  const { fn, calls } = mockFetch([
    { status: 429, body: F.ERR_429 },
    { status: 429, body: F.ERR_429 },
    { status: 200, body: F.CREATE_PROJECT_OK },
  ])
  const c = new VercelClient({ token: "t", fetchImpl: fn as any, retries: 3 })
  const out = await c.createProject({ name: "x", framework: "nextjs" })
  expect(out.projectId).toBe("prj_abc123")
  expect(calls).toHaveLength(3)
})

it("retries 5xx but not 4xx (except 429)", async () => {
  const { fn, calls } = mockFetch([
    { status: 500, body: F.ERR_500 },
    { status: 200, body: F.CREATE_PROJECT_OK },
  ])
  const c = new VercelClient({ token: "t", fetchImpl: fn as any, retries: 3 })
  await c.createProject({ name: "x", framework: "nextjs" })
  expect(calls).toHaveLength(2)
})
```

- [ ] **Step 6.2: Implement `VercelApiError` and a `request` wrapper that all methods route through**

```typescript
export class VercelApiError extends Error {
  override name = "VercelApiError"
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly raw: unknown
  ) {
    super(message)
  }
}

private async request(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown
): Promise<Response> {
  const max = this.opts.retries ?? 3
  let attempt = 0
  let lastErr: unknown = null
  while (attempt <= max) {
    const res = await this.f(this.url(path), {
      method,
      headers: this.headers(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (res.ok) return res
    if (res.status === 429 || res.status >= 500) {
      const wait = 250 * Math.pow(2, attempt)
      await new Promise((r) => setTimeout(r, wait))
      attempt++
      lastErr = res
      continue
    }
    // non-retriable
    let parsed: any = null
    try { parsed = await res.json() } catch { /* ignore */ }
    throw new VercelApiError(
      res.status,
      parsed?.error?.code ?? "unknown",
      parsed?.error?.message ?? `HTTP ${res.status}`,
      parsed
    )
  }
  // exhausted retries
  const res = lastErr as Response
  let parsed: any = null
  try { parsed = await res.json() } catch { /* ignore */ }
  throw new VercelApiError(
    res.status,
    parsed?.error?.code ?? "exhausted",
    `retries exhausted: ${parsed?.error?.message ?? res.statusText}`,
    parsed
  )
}
```

Then refactor `createProject`, `createDeployment`, `setEnvVars`, `getDeployment` to call `this.request(...)`. Drop the placeholder `assertOk`.

- [ ] **Step 6.3: All tests pass. Commit.**

---

## Task 7: Supabase Management Client — Types and Skeleton

**Files:**
- Create: `src/lib/deploy/supabase-mgmt-client.ts`
- Create: `tests/fixtures/supabase-mgmt-responses.ts`

- [ ] **Step 7.1: Fixtures**

```typescript
// tests/fixtures/supabase-mgmt-responses.ts
export const CREATE_PROJECT_OK = {
  id: "abcdefghijklmnopqrst",       // project ref
  name: "polaris-app-foo",
  organization_id: "org_polaris",
  region: "us-east-1",
  status: "COMING_UP",
}

export const GET_PROJECT_HEALTHY = { ...CREATE_PROJECT_OK, status: "ACTIVE_HEALTHY" }
export const GET_PROJECT_PENDING = { ...CREATE_PROJECT_OK, status: "COMING_UP" }
export const GET_PROJECT_INIT_FAIL = { ...CREATE_PROJECT_OK, status: "INIT_FAILED" }

export const PROJECT_KEYS_OK = {
  url: "https://abcdefghijklmnopqrst.supabase.co",
  anon_key: "eyJhbm9uIn0.fake",
  service_role_key: "eyJzcnYifQ.fake",
}

export const ERR_403 = { message: "Forbidden" }
export const ERR_429 = { message: "Rate limited" }
```

- [ ] **Step 7.2: Skeleton**

```typescript
export interface SupabaseMgmtOptions {
  apiKey: string                       // org-level Bearer
  organizationId: string
  fetchImpl?: typeof fetch
  retries?: number
  baseUrl?: string                     // default https://api.supabase.com
}

export interface CreateSupabaseProjectInput {
  name: string
  region: "us-east-1" | "us-west-1" | "eu-west-1" | "ap-southeast-1"
  dbPassword: string
}

export type SupabaseProjectStatus =
  | "COMING_UP"
  | "ACTIVE_HEALTHY"
  | "INIT_FAILED"
  | "REMOVED"
  | "PAUSED"
  | "UNKNOWN"

export interface SupabaseProjectRecord {
  projectRef: string
  status: SupabaseProjectStatus
  url?: string
}

export interface SupabaseProjectKeys {
  url: string
  anonKey: string
  serviceRoleKey: string
}

export class SupabaseMgmtApiError extends Error {
  override name = "SupabaseMgmtApiError"
  constructor(
    public readonly status: number,
    message: string,
    public readonly raw: unknown
  ) {
    super(message)
  }
}

export class SupabaseMgmtClient {
  constructor(private readonly opts: SupabaseMgmtOptions) {
    if (!opts.apiKey) throw new Error("SupabaseMgmtClient: apiKey required")
    if (!opts.organizationId) throw new Error("SupabaseMgmtClient: organizationId required")
  }

  async createProject(_input: CreateSupabaseProjectInput): Promise<SupabaseProjectRecord> {
    throw new Error("not implemented")
  }
  async getProject(_args: { projectRef: string }): Promise<SupabaseProjectRecord> {
    throw new Error("not implemented")
  }
  async getProjectKeys(_args: { projectRef: string }): Promise<SupabaseProjectKeys> {
    throw new Error("not implemented")
  }
}
```

- [ ] **Step 7.3: Commit**

---

## Task 8: Supabase Management Client — createProject and getProject

- [ ] **Step 8.1: Failing tests**

```typescript
it("createProject POSTs to /v1/projects with org_id, region, db_pass, plan=free", async () => {
  const { fn, calls } = mockFetch([{ status: 200, body: F.CREATE_PROJECT_OK }])
  const c = new SupabaseMgmtClient({ apiKey: "k", organizationId: "org_polaris", fetchImpl: fn as any })
  const out = await c.createProject({ name: "polaris-app-foo", region: "us-east-1", dbPassword: "supersecret" })
  expect(out.projectRef).toBe("abcdefghijklmnopqrst")
  expect(out.status).toBe("COMING_UP")
  expect(calls[0].url).toBe("https://api.supabase.com/v1/projects")
  const body = JSON.parse(calls[0].init.body as string)
  expect(body.organization_id).toBe("org_polaris")
  expect(body.name).toBe("polaris-app-foo")
  expect(body.region).toBe("us-east-1")
  expect(body.db_pass).toBe("supersecret")
  expect(body.plan).toBe("free")
  expect((calls[0].init.headers as any).Authorization).toBe("Bearer k")
})

it("getProject GETs /v1/projects/{ref}", async () => {
  const { fn } = mockFetch([{ status: 200, body: F.GET_PROJECT_HEALTHY }])
  const c = new SupabaseMgmtClient({ apiKey: "k", organizationId: "o", fetchImpl: fn as any })
  const out = await c.getProject({ projectRef: "abcdefghijklmnopqrst" })
  expect(out.status).toBe("ACTIVE_HEALTHY")
})

it("getProject treats unknown statuses as UNKNOWN, never throws", async () => {
  const { fn } = mockFetch([{ status: 200, body: { ...F.GET_PROJECT_HEALTHY, status: "WAT" } }])
  const c = new SupabaseMgmtClient({ apiKey: "k", organizationId: "o", fetchImpl: fn as any })
  const out = await c.getProject({ projectRef: "x" })
  expect(out.status).toBe("UNKNOWN")
})
```

- [ ] **Step 8.2: Implement with shared `request` (mirrors Vercel client)**

```typescript
private url(path: string): string {
  return (this.opts.baseUrl ?? "https://api.supabase.com") + path
}
private get f() { return this.opts.fetchImpl ?? fetch }
private headers() {
  return { Authorization: `Bearer ${this.opts.apiKey}`, "Content-Type": "application/json" }
}

private async request(method: string, path: string, body?: unknown): Promise<Response> {
  const max = this.opts.retries ?? 3
  let attempt = 0
  let last: Response | null = null
  while (attempt <= max) {
    const res = await this.f(this.url(path), {
      method,
      headers: this.headers(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (res.ok) return res
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)))
      attempt++
      last = res
      continue
    }
    let parsed: any = null
    try { parsed = await res.json() } catch { /* ignore */ }
    throw new SupabaseMgmtApiError(res.status, parsed?.message ?? `HTTP ${res.status}`, parsed)
  }
  const res = last as Response
  let parsed: any = null
  try { parsed = await res.json() } catch { /* ignore */ }
  throw new SupabaseMgmtApiError(res.status, `retries exhausted: ${parsed?.message ?? res.statusText}`, parsed)
}

private static KNOWN_STATUSES: SupabaseProjectStatus[] = [
  "COMING_UP", "ACTIVE_HEALTHY", "INIT_FAILED", "REMOVED", "PAUSED",
]

private normalizeStatus(s: string): SupabaseProjectStatus {
  return SupabaseMgmtClient.KNOWN_STATUSES.includes(s as SupabaseProjectStatus)
    ? (s as SupabaseProjectStatus)
    : "UNKNOWN"
}

async createProject(input: CreateSupabaseProjectInput): Promise<SupabaseProjectRecord> {
  const res = await this.request("POST", "/v1/projects", {
    organization_id: this.opts.organizationId,
    name: input.name,
    region: input.region,
    db_pass: input.dbPassword,
    plan: "free",
  })
  const json = (await res.json()) as { id: string; status: string }
  return { projectRef: json.id, status: this.normalizeStatus(json.status) }
}

async getProject({ projectRef }: { projectRef: string }): Promise<SupabaseProjectRecord> {
  const res = await this.request("GET", `/v1/projects/${projectRef}`)
  const json = (await res.json()) as { id: string; status: string }
  return { projectRef: json.id, status: this.normalizeStatus(json.status) }
}
```

- [ ] **Step 8.3: Tests pass. Commit.**

---

## Task 9: Supabase Management Client — getProjectKeys

- [ ] **Step 9.1: Failing test**

```typescript
it("getProjectKeys GETs /v1/projects/{ref}/api-keys and maps fields", async () => {
  const { fn, calls } = mockFetch([
    {
      status: 200,
      body: [
        { name: "anon", api_key: "eyJhbm9uIn0.fake" },
        { name: "service_role", api_key: "eyJzcnYifQ.fake" },
      ],
    },
  ])
  const c = new SupabaseMgmtClient({ apiKey: "k", organizationId: "o", fetchImpl: fn as any })
  const out = await c.getProjectKeys({ projectRef: "abcdefghijklmnopqrst" })
  expect(out).toEqual({
    url: "https://abcdefghijklmnopqrst.supabase.co",
    anonKey: "eyJhbm9uIn0.fake",
    serviceRoleKey: "eyJzcnYifQ.fake",
  })
  expect(calls[0].url).toBe("https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/api-keys")
})

it("getProjectKeys throws if anon or service_role missing", async () => {
  const { fn } = mockFetch([{ status: 200, body: [{ name: "anon", api_key: "x" }] }])
  const c = new SupabaseMgmtClient({ apiKey: "k", organizationId: "o", fetchImpl: fn as any })
  await expect(c.getProjectKeys({ projectRef: "abc" })).rejects.toThrow(/service_role/)
})
```

- [ ] **Step 9.2: Implement**

```typescript
async getProjectKeys({ projectRef }: { projectRef: string }): Promise<SupabaseProjectKeys> {
  const res = await this.request("GET", `/v1/projects/${projectRef}/api-keys`)
  const list = (await res.json()) as Array<{ name: string; api_key: string }>
  const anon = list.find((k) => k.name === "anon")
  const srv = list.find((k) => k.name === "service_role")
  if (!anon) throw new Error("getProjectKeys: anon key missing")
  if (!srv) throw new Error("getProjectKeys: service_role key missing")
  return {
    url: `https://${projectRef}.supabase.co`,
    anonKey: anon.api_key,
    serviceRoleKey: srv.api_key,
  }
}
```

- [ ] **Step 9.3: Tests pass. Commit.**

---

## Task 10: Migration Runner

**Why a separate module:** The deploy pipeline orchestrates IO; the migration runner has actual SQL ordering logic worth unit-testing in isolation.

**Files:** `src/lib/deploy/run-migrations.ts`, `tests/unit/deploy/run-migrations.test.ts`

- [ ] **Step 10.1: Define the function shape**

```typescript
export interface MigrationFile {
  path: string         // e.g. "supabase/migrations/20240101_init.sql"
  contents: string
}

export interface RunMigrationsArgs {
  projectRef: string
  serviceRoleKey: string
  files: MigrationFile[]
  fetchImpl?: typeof fetch
}

export interface RunMigrationsResult {
  applied: string[]                    // paths in order
  failedAt?: { path: string; error: string }
}
```

- [ ] **Step 10.2: Failing tests**

```typescript
import { describe, it, expect, vi } from "vitest"
import { runMigrations } from "../../../src/lib/deploy/run-migrations"

describe("runMigrations", () => {
  it("filters to supabase/migrations/*.sql and runs in lexicographic order", async () => {
    const calls: string[] = []
    const fn = vi.fn(async (_url: string, init: RequestInit) => {
      calls.push(JSON.parse(init.body as string).query)
      return new Response("{}", { status: 200 })
    })
    const out = await runMigrations({
      projectRef: "abc",
      serviceRoleKey: "srv",
      fetchImpl: fn as any,
      files: [
        { path: "src/page.tsx", contents: "ignore" },
        { path: "supabase/migrations/20240202_b.sql", contents: "SELECT 2;" },
        { path: "supabase/migrations/20240101_a.sql", contents: "SELECT 1;" },
        { path: "supabase/seed.sql", contents: "ignore" },
      ],
    })
    expect(out.applied).toEqual([
      "supabase/migrations/20240101_a.sql",
      "supabase/migrations/20240202_b.sql",
    ])
    expect(calls).toEqual(["SELECT 1;", "SELECT 2;"])
  })

  it("stops at the first failure and reports failedAt with SQL error message", async () => {
    let i = 0
    const fn = vi.fn(async () => {
      i++
      if (i === 2) {
        return new Response(JSON.stringify({ message: "syntax error at 'BAD'" }), { status: 400 })
      }
      return new Response("{}", { status: 200 })
    })
    const out = await runMigrations({
      projectRef: "abc",
      serviceRoleKey: "srv",
      fetchImpl: fn as any,
      files: [
        { path: "supabase/migrations/01_a.sql", contents: "SELECT 1;" },
        { path: "supabase/migrations/02_b.sql", contents: "BAD;" },
        { path: "supabase/migrations/03_c.sql", contents: "SELECT 3;" },
      ],
    })
    expect(out.applied).toEqual(["supabase/migrations/01_a.sql"])
    expect(out.failedAt?.path).toBe("supabase/migrations/02_b.sql")
    expect(out.failedAt?.error).toMatch(/syntax error/)
  })

  it("returns empty applied when no migrations files present", async () => {
    const out = await runMigrations({
      projectRef: "abc",
      serviceRoleKey: "srv",
      files: [{ path: "src/x.ts", contents: "" }],
      fetchImpl: vi.fn() as any,
    })
    expect(out.applied).toEqual([])
    expect(out.failedAt).toBeUndefined()
  })
})
```

- [ ] **Step 10.3: Implement**

Supabase exposes raw SQL execution via `POST https://{ref}.supabase.co/rest/v1/rpc/exec` only if a custom function is installed. Stable surface: the Management API `POST /v1/projects/{ref}/database/query` with `{ "query": "..." }` and `Authorization: Bearer <service_role>` — that's what we use. (If/when Supabase changes that endpoint, this is the only place to update.)

```typescript
const MIGRATION_RE = /^supabase\/migrations\/.+\.sql$/

export async function runMigrations(args: RunMigrationsArgs): Promise<RunMigrationsResult> {
  const f = args.fetchImpl ?? fetch
  const files = args.files
    .filter((x) => MIGRATION_RE.test(x.path))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))

  const applied: string[] = []
  for (const file of files) {
    const res = await f(`https://api.supabase.com/v1/projects/${args.projectRef}/database/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: file.contents }),
    })
    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      try {
        const j = (await res.json()) as { message?: string }
        if (j?.message) msg = j.message
      } catch { /* ignore */ }
      return { applied, failedAt: { path: file.path, error: msg } }
    }
    applied.push(file.path)
  }
  return { applied }
}
```

- [ ] **Step 10.4: Tests pass. Commit.**

---

## Task 11: Quota Check Helper

**Why:** The pipeline must abort cheaply before any IO when the user is over quota.

**Files:** `src/lib/deploy/quota.ts`, `tests/unit/deploy/quota.test.ts`

- [ ] **Step 11.1: Failing test**

```typescript
describe("checkDeployQuota", () => {
  it("returns ok=true when under limit", async () => { /* ... */ })
  it("returns ok=false with a human message when over limit", async () => { /* ... */ })
  it("treats missing usage row as 0 deployments used", async () => { /* ... */ })
})
```

- [ ] **Step 11.2: Implement**

```typescript
import type { DataModel, Id } from "../../../convex/_generated/dataModel"
import type { GenericQueryCtx } from "convex/server"

const FREE_TIER_DEPLOYMENTS_PER_MONTH = 10

export async function checkDeployQuota(
  ctx: GenericQueryCtx<DataModel>,
  userId: Id<"users">
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const usage = await ctx.db
    .query("usage")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique()
  const used = usage?.deploymentsThisMonth ?? 0
  if (used >= FREE_TIER_DEPLOYMENTS_PER_MONTH) {
    return {
      ok: false,
      reason: `Free-tier deploy quota reached (${used}/${FREE_TIER_DEPLOYMENTS_PER_MONTH} this month).`,
    }
  }
  return { ok: true }
}
```

- [ ] **Step 11.3: Add `incrementDeployments` mutation to `convex/usage.ts`**

```typescript
export const incrementDeployments = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const existing = await ctx.db
      .query("usage")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, {
        deploymentsThisMonth: (existing.deploymentsThisMonth ?? 0) + 1,
      })
    } else {
      await ctx.db.insert("usage", { userId, deploymentsThisMonth: 1 })
    }
  },
})
```

- [ ] **Step 11.4: Add `db-password.ts`**

```typescript
import { randomBytes } from "node:crypto"

export function generateDbPassword(): string {
  // 16 bytes -> 22 char base64; strip padding/special chars Supabase rejects
  return randomBytes(16).toString("base64").replace(/[+/=]/g, "x")
}
```

Test: assert length >= 16, character set, and uniqueness over 100 calls.

- [ ] **Step 11.5: Commit.**

---

## Task 12: Deploy Pipeline — Inngest Function Skeleton

**Why incremental:** Each `step.run` block is independently retryable; we add them one at a time so each is observable in the Inngest dev UI.

**Files:** `src/features/deploy/inngest/deploy-project.ts`, `tests/unit/deploy/deploy-project.test.ts`

- [ ] **Step 12.1: Skeleton**

```typescript
import { inngest } from "@/inngest/client"
import { ConvexHttpClient } from "convex/browser"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { VercelClient } from "@/lib/deploy/vercel-client"
import { SupabaseMgmtClient } from "@/lib/deploy/supabase-mgmt-client"
import { runMigrations } from "@/lib/deploy/run-migrations"
import { generateDbPassword } from "@/lib/deploy/db-password"
import { decryptToken } from "@/lib/integrations/crypto"   // from sub-plan 06

export interface DeployStartEvent {
  name: "deploy/start"
  data: {
    deploymentId: Id<"deployments">
    projectId: Id<"projects">
    userId: Id<"users">
  }
}

export const deployProject = inngest.createFunction(
  {
    id: "deploy-project",
    name: "Deploy project to Vercel + Supabase",
    retries: 0,                   // we surface failures by writing to the deployment row
    concurrency: { key: "event.data.projectId", limit: 1 },
  },
  { event: "deploy/start" },
  async ({ event, step, logger }) => {
    const { deploymentId, projectId, userId } = event.data
    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

    try {
      // Steps to be filled in tasks 13-16
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error("deploy failed", { deploymentId, message })
      await convex.mutation(api.deployments.markError, { deploymentId, errorMessage: message })
    }
  }
)
```

- [ ] **Step 12.2: Test harness**

```typescript
// tests/unit/deploy/deploy-project.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mocks must be hoisted before importing the function under test.
const convexMutations: Array<{ name: string; args: unknown }> = []
const convexQueries: Array<{ name: string; args: unknown }> = []

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    mutation = vi.fn(async (ref: any, args: unknown) => {
      convexMutations.push({ name: ref.toString(), args })
      return "mut_ok"
    })
    query = vi.fn(async (ref: any, args: unknown) => {
      convexQueries.push({ name: ref.toString(), args })
      // table-driven defaults; individual tests override via .mockResolvedValueOnce
      return null
    })
  },
}))

const supabaseFakes = {
  createProject: vi.fn(),
  getProject: vi.fn(),
  getProjectKeys: vi.fn(),
}
vi.mock("@/lib/deploy/supabase-mgmt-client", () => ({
  SupabaseMgmtClient: class { constructor() {} ; createProject = supabaseFakes.createProject; getProject = supabaseFakes.getProject; getProjectKeys = supabaseFakes.getProjectKeys },
}))

const vercelFakes = {
  createProject: vi.fn(),
  createDeployment: vi.fn(),
  setEnvVars: vi.fn(),
  getDeployment: vi.fn(),
}
vi.mock("@/lib/deploy/vercel-client", () => ({
  VercelClient: class { constructor() {} ; createProject = vercelFakes.createProject; createDeployment = vercelFakes.createDeployment; setEnvVars = vercelFakes.setEnvVars; getDeployment = vercelFakes.getDeployment },
}))

vi.mock("@/lib/deploy/run-migrations", () => ({
  runMigrations: vi.fn(async () => ({ applied: [] })),
}))
vi.mock("@/lib/integrations/crypto", () => ({ decryptToken: () => "tok_decrypted" }))

import { deployProject } from "../../../src/features/deploy/inngest/deploy-project"

function fakeStep() {
  const calls: string[] = []
  const step = {
    run: async (id: string, fn: () => any) => { calls.push(id); return await fn() },
  }
  return { step: step as any, calls }
}

beforeEach(() => {
  convexMutations.length = 0
  convexQueries.length = 0
  Object.values(supabaseFakes).forEach((m) => m.mockReset())
  Object.values(vercelFakes).forEach((m) => m.mockReset())
})

describe("deployProject", () => {
  it("happy path runs all 9 step.run blocks in order", async () => {
    // wire defaults so handler reaches finalize
    supabaseFakes.createProject.mockResolvedValue({ projectRef: "abc", status: "COMING_UP" })
    supabaseFakes.getProject
      .mockResolvedValueOnce({ projectRef: "abc", status: "COMING_UP" })
      .mockResolvedValueOnce({ projectRef: "abc", status: "ACTIVE_HEALTHY" })
    supabaseFakes.getProjectKeys.mockResolvedValue({ url: "https://abc.supabase.co", anonKey: "anon", serviceRoleKey: "srv" })
    vercelFakes.createProject.mockResolvedValue({ projectId: "prj_x" })
    vercelFakes.setEnvVars.mockResolvedValue(undefined)
    vercelFakes.createDeployment.mockResolvedValue({ id: "dpl_y", url: "x.vercel.app", readyState: "QUEUED" })
    vercelFakes.getDeployment.mockResolvedValue({ id: "dpl_y", url: "x.vercel.app", readyState: "READY" })

    const { step, calls } = fakeStep()
    await (deployProject as any).fn({
      event: { data: { deploymentId: "d1", projectId: "p1", userId: "u1" } },
      step,
      logger: console,
    })

    expect(calls).toEqual([
      "validate-quota",
      "setStep-2",
      "provision-supabase",
      "poll-supabase-healthy",
      "capture-keys",
      "read-files",
      "run-migrations",
      "ensure-vercel-project",
      "set-env-vars",
      "create-vercel-deployment",
      "poll-vercel-ready",
      "finalize",
    ])
  })
})
```

Initial test: `it("happy path runs all 9 steps in order", ...)` — fails (handler is empty).

- [ ] **Step 12.3: Commit skeleton.**

---

## Task 13: Deploy Pipeline — Provision Supabase + Poll

- [ ] **Step 13.1: Failing test**

```typescript
it("step 3 calls SupabaseMgmtClient.createProject and polls until ACTIVE_HEALTHY", async () => {
  const created = vi.fn(async () => ({ projectRef: "abc", status: "COMING_UP" }))
  const polled = vi
    .fn()
    .mockResolvedValueOnce({ projectRef: "abc", status: "COMING_UP" })
    .mockResolvedValueOnce({ projectRef: "abc", status: "ACTIVE_HEALTHY" })
  // wire fakes, run handler, assert polled called twice and createProject once
})

it("aborts and marks error if Supabase returns INIT_FAILED", async () => { /* ... */ })
it("aborts after MAX_PROVISION_ATTEMPTS (~120s) if still COMING_UP", async () => { /* ... */ })
```

- [ ] **Step 13.2: Implement steps 1-4**

```typescript
const SUPABASE_POLL_INTERVAL_MS = 5000
const SUPABASE_MAX_POLLS = 30  // ~150s ceiling

// Step 1: validate quota
await step.run("validate-quota", async () => {
  const result = await convex.query(api.usage.checkDeployQuotaPublic, { userId })
  if (!result.ok) throw new Error(result.reason)
})

// Step 2: mark deploying
await step.run("setStep-2", () =>
  convex.mutation(api.deployments.setStep, {
    deploymentId, step: 2, stepLabel: "Recording deployment", status: "deploying",
  })
)

// Step 3: provision Supabase
const supabase = new SupabaseMgmtClient({
  apiKey: process.env.SUPABASE_MANAGEMENT_API_KEY!,
  organizationId: process.env.SUPABASE_ORG_ID!,
})
const dbPassword = generateDbPassword()
const project = await convex.query(api.projects.byId, { projectId })
const slug = `polaris-${project.slug}-${Date.now().toString(36)}`

const created = await step.run("provision-supabase", async () => {
  await convex.mutation(api.deployments.setStep, {
    deploymentId, step: 3, stepLabel: "Provisioning Supabase project", status: "deploying",
  })
  return await supabase.createProject({
    name: slug,
    region: (process.env.SUPABASE_DEFAULT_REGION as any) ?? "us-east-1",
    dbPassword,
  })
})

// Poll until healthy
const ref = await step.run("poll-supabase-healthy", async () => {
  for (let i = 0; i < SUPABASE_MAX_POLLS; i++) {
    const cur = await supabase.getProject({ projectRef: created.projectRef })
    if (cur.status === "ACTIVE_HEALTHY") return cur.projectRef
    if (cur.status === "INIT_FAILED") throw new Error("Supabase project init failed")
    await new Promise((r) => setTimeout(r, SUPABASE_POLL_INTERVAL_MS))
  }
  throw new Error("Supabase project did not become healthy within timeout")
})

// Step 4: capture keys
const keys = await step.run("capture-keys", async () => {
  await convex.mutation(api.deployments.setStep, {
    deploymentId, step: 4, stepLabel: "Capturing API keys", status: "deploying",
  })
  const k = await supabase.getProjectKeys({ projectRef: ref })
  await convex.mutation(api.deployments.setSupabaseLink, {
    deploymentId, supabaseProjectId: ref, supabaseUrl: k.url,
  })
  return k
})
```

- [ ] **Step 13.3: Tests pass. Commit.**

---

## Task 14: Deploy Pipeline — Read Files + Run Migrations

- [ ] **Step 14.1: Failing test**

```typescript
it("step 5+6 reads files from Convex, filters migrations, runs in order", async () => {
  // mock convex.query(files_by_path.listAll) → returns 3 files (1 migration, 2 source)
  // mock runMigrations to return { applied: ["supabase/migrations/01.sql"] }
  // assert deployment row patched at step 5 and step 6
})

it("aborts when migration fails, marks deployment error with SQL message", async () => { /* ... */ })
```

- [ ] **Step 14.2: Implement**

```typescript
// Step 5: read files from Convex
const files = await step.run("read-files", async () => {
  await convex.mutation(api.deployments.setStep, {
    deploymentId, step: 5, stepLabel: "Reading project files", status: "deploying",
  })
  return await convex.query(api.files_by_path.listAll, { projectId })
})

// Step 6: run migrations
await step.run("run-migrations", async () => {
  await convex.mutation(api.deployments.setStep, {
    deploymentId, step: 6, stepLabel: "Applying database migrations", status: "deploying",
  })
  const result = await runMigrations({
    projectRef: ref,
    serviceRoleKey: keys.serviceRoleKey,
    files: files.map((f) => ({ path: f.path, contents: f.contents })),
  })
  if (result.failedAt) {
    throw new Error(`Migration ${result.failedAt.path} failed: ${result.failedAt.error}`)
  }
})
```

- [ ] **Step 14.3: Tests pass. Commit.**

---

## Task 15: Deploy Pipeline — Vercel Project + Env Vars + Deployment

- [ ] **Step 15.1: Failing test**

```typescript
it("step 7 creates Vercel project (if absent), sets env vars, creates deployment", async () => {
  // assert order: createProject → setEnvVars (with all 3 supabase vars + custom) → createDeployment
  // assert files passed to createDeployment exclude supabase/migrations/* (those are server-side only)
})

it("reuses existing vercelProjectId stored on the project row when present", async () => { /* ... */ })

it("includes user-defined env vars from project.envVars table", async () => { /* ... */ })
```

- [ ] **Step 15.2: Implement**

```typescript
// Step 7: Vercel project + env vars + deployment
const integration = await convex.query(api.integrations.byUser, { userId })
if (!integration?.vercelTokenEnc) {
  throw new Error("No Vercel token connected. Connect Vercel in Settings → Integrations.")
}
const vercelToken = decryptToken(integration.vercelTokenEnc)

const vercel = new VercelClient({
  token: vercelToken,
  teamId: integration.vercelTeamId ?? undefined,
})

await convex.mutation(api.deployments.setStep, {
  deploymentId, step: 7, stepLabel: "Pushing to Vercel", status: "deploying",
})

const vercelProjectId = await step.run("ensure-vercel-project", async () => {
  if (project.vercelProjectId) return project.vercelProjectId
  const { projectId: pid } = await vercel.createProject({
    name: slug,
    framework: "nextjs",
  })
  await convex.mutation(api.projects.setVercelProjectId, {
    projectId, vercelProjectId: pid,
  })
  return pid
})

await step.run("set-env-vars", async () => {
  const customVars = await convex.query(api.envVars.listForProject, { projectId })
  const baseVars: Array<{ key: string; value: string; target: ["production"]; type: "encrypted" }> = [
    { key: "NEXT_PUBLIC_SUPABASE_URL", value: keys.url, target: ["production"], type: "encrypted" },
    { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", value: keys.anonKey, target: ["production"], type: "encrypted" },
    { key: "SUPABASE_SERVICE_ROLE_KEY", value: keys.serviceRoleKey, target: ["production"], type: "encrypted" },
  ]
  const all = [
    ...baseVars,
    ...customVars.map((v) => ({
      key: v.key, value: v.value, target: ["production"] as ["production"], type: "encrypted" as const,
    })),
  ]
  await vercel.setEnvVars({ projectId: vercelProjectId, vars: all })
})

const deployment = await step.run("create-vercel-deployment", async () => {
  // Exclude server-only files (migrations) from the Vercel bundle
  const deployable = files.filter((f) => !f.path.startsWith("supabase/migrations/"))
  const out = await vercel.createDeployment({
    projectId: vercelProjectId,
    target: "production",
    files: deployable.map((f) => ({ file: f.path, data: f.contents })),
  })
  await convex.mutation(api.deployments.setVercelLink, {
    deploymentId,
    vercelProjectId,
    vercelDeploymentId: out.id,
    vercelUrl: `https://${out.url}`,
  })
  return out
})
```

- [ ] **Step 15.3: Tests pass. Commit.**

---

## Task 16: Deploy Pipeline — Poll until READY + Finalize

- [ ] **Step 16.1: Failing tests**

```typescript
it("step 8 polls Vercel until READY then marks deployment ready", async () => { /* ... */ })
it("aborts and marks error when Vercel returns ERROR readyState", async () => { /* ... */ })
it("aborts after VERCEL_MAX_POLLS if still BUILDING", async () => { /* ... */ })
it("step 10 increments usage.deployments after marking ready", async () => { /* ... */ })
```

- [ ] **Step 16.2: Implement**

```typescript
const VERCEL_POLL_INTERVAL_MS = 5000
const VERCEL_MAX_POLLS = 60          // ~5 minutes

await step.run("poll-vercel-ready", async () => {
  await convex.mutation(api.deployments.setStep, {
    deploymentId, step: 8, stepLabel: "Waiting for build", status: "deploying",
  })
  for (let i = 0; i < VERCEL_MAX_POLLS; i++) {
    const cur = await vercel.getDeployment({ deploymentId: deployment.id })
    if (cur.readyState === "READY") return
    if (cur.readyState === "ERROR" || cur.readyState === "CANCELED") {
      throw new Error(`Vercel build ${cur.readyState.toLowerCase()}`)
    }
    await new Promise((r) => setTimeout(r, VERCEL_POLL_INTERVAL_MS))
  }
  throw new Error("Vercel build did not become READY within timeout")
})

await step.run("finalize", async () => {
  await convex.mutation(api.deployments.markReady, { deploymentId })
  await convex.mutation(api.usage.incrementDeployments, { userId })
})
```

- [ ] **Step 16.3: Tests pass. Commit.**

---

## Task 17: API Route POST /api/deploy

**Files:** `src/app/api/deploy/route.ts`

- [ ] **Step 17.1: Failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

const authMock = vi.fn()
vi.mock("@/lib/auth", () => ({ auth: authMock }))

const inngestSend = vi.fn()
vi.mock("@/inngest/client", () => ({ inngest: { send: inngestSend } }))

const fetchQueryMock = vi.fn()
const fetchMutationMock = vi.fn()
vi.mock("convex/nextjs", () => ({
  fetchQuery: (...a: unknown[]) => fetchQueryMock(...a),
  fetchMutation: (...a: unknown[]) => fetchMutationMock(...a),
}))

import { POST } from "../../../src/app/api/deploy/route"

function req(body: unknown): Request {
  return new Request("http://x/api/deploy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  authMock.mockReset()
  inngestSend.mockReset()
  fetchQueryMock.mockReset()
  fetchMutationMock.mockReset()
})

describe("POST /api/deploy", () => {
  it("returns 401 without auth", async () => {
    authMock.mockResolvedValue(null)
    const r = await POST(req({ projectId: "p1" }))
    expect(r.status).toBe(401)
  })

  it("returns 400 when projectId is missing", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } })
    const r = await POST(req({}))
    expect(r.status).toBe(400)
  })

  it("returns 403 when user does not own the project", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } })
    fetchQueryMock.mockResolvedValueOnce({ ownerId: "u_other" })
    const r = await POST(req({ projectId: "p1" }))
    expect(r.status).toBe(403)
  })

  it("returns 429 when over quota", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } })
    fetchQueryMock
      .mockResolvedValueOnce({ ownerId: "u1" })                                  // project
      .mockResolvedValueOnce({ ok: false, reason: "quota exceeded" })            // quota
    const r = await POST(req({ projectId: "p1" }))
    expect(r.status).toBe(429)
    expect(await r.json()).toEqual({ error: "quota exceeded" })
  })

  it("returns 409 when an active deployment already exists for the project", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } })
    fetchQueryMock
      .mockResolvedValueOnce({ ownerId: "u1" })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ _id: "d_existing" })
    const r = await POST(req({ projectId: "p1" }))
    expect(r.status).toBe(409)
  })

  it("returns 200 with deploymentId, fires inngest deploy/start once", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } })
    fetchQueryMock
      .mockResolvedValueOnce({ ownerId: "u1" })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce(null)
    fetchMutationMock.mockResolvedValueOnce("d_new")
    const r = await POST(req({ projectId: "p1" }))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ deploymentId: "d_new" })
    expect(inngestSend).toHaveBeenCalledTimes(1)
    expect(inngestSend).toHaveBeenCalledWith({
      name: "deploy/start",
      data: { deploymentId: "d_new", projectId: "p1", userId: "u1" },
    })
  })
})
```

- [ ] **Step 17.2: Implement**

```typescript
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { fetchMutation, fetchQuery } from "convex/nextjs"
import { api } from "../../../../convex/_generated/api"
import { inngest } from "@/inngest/client"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 })

  const { projectId } = (await req.json()) as { projectId: string }
  if (!projectId) return NextResponse.json({ error: "MISSING_PROJECT_ID" }, { status: 400 })

  const project = await fetchQuery(api.projects.byId, { projectId: projectId as any })
  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  if (project.ownerId !== session.user.id) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })

  const quota = await fetchQuery(api.usage.checkDeployQuotaPublic, { userId: session.user.id })
  if (!quota.ok) return NextResponse.json({ error: quota.reason }, { status: 429 })

  // Disallow concurrent active deployment per project
  const active = await fetchQuery(api.deployments.getActive, { projectId: projectId as any })
  if (active) {
    return NextResponse.json({ error: "DEPLOYMENT_IN_PROGRESS", deploymentId: active._id }, { status: 409 })
  }

  const deploymentId = await fetchMutation(api.deployments.create, { projectId: projectId as any })

  await inngest.send({
    name: "deploy/start",
    data: { deploymentId, projectId, userId: session.user.id },
  })

  return NextResponse.json({ deploymentId })
}
```

- [ ] **Step 17.3: Commit.**

---

## Task 18: DeployButton Component

**Files:** `src/features/deploy/components/deploy-button.tsx`, `src/features/deploy/hooks/use-active-deployment.ts`

- [ ] **Step 18.1: Hook**

```typescript
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"

export function useActiveDeployment(projectId: Id<"projects">) {
  const active = useQuery(api.deployments.getActive, { projectId })
  const recent = useQuery(api.deployments.byProject, { projectId })
  const last = recent?.[0]
  return { active, last }
}
```

- [ ] **Step 18.2: Button states**

Three states:
1. **Idle** — `last?.status` is `ready` or `error` or undefined → show "Deploy" CTA. If `last?.status === "ready"`, show small "Live at xyz.vercel.app" badge next to the button (link opens `vercelUrl`).
2. **In flight** — `active` exists → show "Deploying… (3/9)" with current step. Click opens `DeployStatus` drawer.
3. **Error** — `last?.status === "error"` → show "Retry deploy" with red dot.

```typescript
"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useActiveDeployment } from "../hooks/use-active-deployment"
import { DeployStatus } from "./deploy-status"

export function DeployButton({ projectId }: { projectId: Id<"projects"> }) {
  const { active, last } = useActiveDeployment(projectId)
  const [open, setOpen] = useState(false)

  async function startDeploy() {
    setOpen(true)
    const r = await fetch("/api/deploy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    })
    if (!r.ok) {
      const { error } = (await r.json()) as { error: string }
      // surface via toast (use existing toast lib)
      console.error(error)
    }
  }

  const inFlight = !!active
  const failed = !active && last?.status === "error"

  return (
    <>
      <div className="flex items-center gap-2">
        {last?.status === "ready" && last.vercelUrl && (
          <a href={last.vercelUrl} target="_blank" rel="noreferrer" className="text-xs text-emerald-600 underline">
            Live: {new URL(last.vercelUrl).host}
          </a>
        )}
        <Button
          variant={failed ? "destructive" : "default"}
          onClick={inFlight ? () => setOpen(true) : startDeploy}
        >
          {inFlight
            ? `Deploying… (${active.step ?? 1}/9)`
            : failed
            ? "Retry deploy"
            : "Deploy"}
        </Button>
      </div>
      <DeployStatus
        projectId={projectId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
```

- [ ] **Step 18.3: Mount in `project-navbar.tsx`. Commit.**

---

## Task 19: DeployStatus Drawer

**Files:** `src/features/deploy/components/deploy-status.tsx`

- [ ] **Step 19.1: Implement**

A `Sheet`/`Drawer` (use existing shadcn primitive). Inside, render the 9 steps from `DEPLOY_STEPS` with status icons:
- Step `< current`: green check
- Step `=== current` and status is non-terminal: spinner
- Step `> current`: gray dot
- On error: failed step shows red x; below, render `errorMessage` in a code block

```typescript
"use client"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Check, Loader2, X, Circle } from "lucide-react"
import { useActiveDeployment } from "../hooks/use-active-deployment"
import { DEPLOY_STEPS, STEP_LABELS } from "@/lib/deploy/types"

export function DeployStatus({
  projectId, open, onOpenChange,
}: {
  projectId: Id<"projects">
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const { active, last } = useActiveDeployment(projectId)
  const dep = active ?? last
  const current = dep?.step ?? 0
  const isError = dep?.status === "error"

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px]">
        <SheetHeader>
          <SheetTitle>Deployment</SheetTitle>
        </SheetHeader>
        <ol className="mt-4 space-y-3">
          {DEPLOY_STEPS.map((id, i) => {
            const idx = i + 1
            const state =
              isError && idx === current ? "failed"
              : idx < current ? "done"
              : idx === current ? "active"
              : "pending"
            return (
              <li key={id} className="flex items-center gap-2">
                {state === "done" && <Check className="h-4 w-4 text-emerald-600" />}
                {state === "active" && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
                {state === "failed" && <X className="h-4 w-4 text-red-600" />}
                {state === "pending" && <Circle className="h-4 w-4 text-zinc-400" />}
                <span className={state === "pending" ? "text-zinc-400" : ""}>{STEP_LABELS[id]}</span>
              </li>
            )
          })}
        </ol>
        {isError && dep?.errorMessage && (
          <pre className="mt-4 max-h-48 overflow-auto rounded bg-red-50 p-3 text-xs text-red-900">
            {dep.errorMessage}
          </pre>
        )}
        {dep?.status === "ready" && dep.vercelUrl && (
          <a href={dep.vercelUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block underline">
            Open {new URL(dep.vercelUrl).host}
          </a>
        )}
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 19.2: Commit.**

---

## Task 20: DeployHistory List

**Files:** `src/features/deploy/components/deploy-history.tsx`

- [ ] **Step 20.1: Failing test**

```typescript
import { render, screen } from "@testing-library/react"
import { DeployHistory } from "../../../src/features/deploy/components/deploy-history"

vi.mock("convex/react", () => ({
  useQuery: () => [
    { _id: "d1", status: "ready", vercelUrl: "https://a.vercel.app", createdAt: 1735000000000, triggeredBy: "u1", step: 9 },
    { _id: "d2", status: "error", errorMessage: "Migration failed", createdAt: 1734900000000, triggeredBy: "u1" },
    { _id: "d3", status: "deploying", step: 4, createdAt: 1734800000000, triggeredBy: "u1" },
  ],
}))

describe("DeployHistory", () => {
  it("renders one row per deployment with correct status badge", () => {
    render(<DeployHistory projectId={"p" as any} />)
    expect(screen.getAllByRole("row")).toHaveLength(4)  // header + 3
    expect(screen.getByText("Live")).toBeInTheDocument()
    expect(screen.getByText(/Migration failed/i)).toBeInTheDocument()
    expect(screen.getByText(/Deploying/i)).toBeInTheDocument()
  })

  it("links the URL cell to vercelUrl when status=ready", () => {
    render(<DeployHistory projectId={"p" as any} />)
    const link = screen.getByRole("link", { name: /a\.vercel\.app/ })
    expect(link).toHaveAttribute("href", "https://a.vercel.app")
  })
})
```

- [ ] **Step 20.2: Implement**

```typescript
"use client"
import { useState } from "react"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { formatDistanceToNow } from "date-fns"
import { DeployStatus } from "./deploy-status"

const STATUS_LABEL: Record<string, string> = {
  ready: "Live",
  error: "Failed",
  provisioning: "Provisioning",
  deploying: "Deploying",
}

export function DeployHistory({ projectId }: { projectId: Id<"projects"> }) {
  const rows = useQuery(api.deployments.byProject, { projectId }) ?? []
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <div className="rounded border">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 text-left">
          <tr>
            <th className="p-2">When</th>
            <th className="p-2">Status</th>
            <th className="p-2">URL</th>
            <th className="p-2">Detail</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r._id} role="row" className="border-t">
              <td className="p-2">{formatDistanceToNow(r.createdAt, { addSuffix: true })}</td>
              <td className="p-2">{STATUS_LABEL[r.status] ?? r.status}</td>
              <td className="p-2">
                {r.vercelUrl ? (
                  <a className="underline" href={r.vercelUrl} target="_blank" rel="noreferrer">
                    {new URL(r.vercelUrl).host}
                  </a>
                ) : "—"}
              </td>
              <td className="p-2">
                {r.status === "error" ? (
                  <span className="text-red-600">{r.errorMessage}</span>
                ) : r.status !== "ready" ? (
                  <button className="underline" onClick={() => setOpenId(r._id)}>
                    View progress
                  </button>
                ) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <DeployStatus
        projectId={projectId}
        open={!!openId}
        onOpenChange={(v) => !v && setOpenId(null)}
      />
    </div>
  )
}
```

- [ ] **Step 20.3: Commit.**

---

## Task 21: EnvVarEditor

**Files:** `src/features/deploy/components/env-var-editor.tsx`

- [ ] **Step 21.1: Failing tests**

```typescript
describe("EnvVarEditor", () => {
  it("renders the three auto-managed Supabase env vars as read-only", () => {
    render(<EnvVarEditor projectId={"p" as any} />)
    for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
      const row = screen.getByText(k).closest("[data-row]")!
      expect(row.querySelector("input")).toHaveAttribute("readonly")
    }
  })

  it("masks SUPABASE_SERVICE_ROLE_KEY by default and never reveals on click", () => {
    render(<EnvVarEditor projectId={"p" as any} />)
    const srv = screen.getByLabelText("SUPABASE_SERVICE_ROLE_KEY") as HTMLInputElement
    expect(srv.value).toMatch(/^eyJ.+…$/)
    // Click reveal — service role stays masked even when toggled
    fireEvent.click(within(srv.closest("[data-row]")!).getByRole("button", { name: /reveal/i }))
    expect(srv.value).toMatch(/…/)
  })

  it("custom env vars: add → list updates → delete → list updates", async () => { /* ... */ })
})
```

- [ ] **Step 21.2: Implement**

```typescript
"use client"
import { useQuery, useMutation } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { useActiveDeployment } from "../hooks/use-active-deployment"
import { useState } from "react"

function truncateSecret(v: string): string {
  if (v.length <= 8) return "…"
  return v.slice(0, 4) + "…"
}

export function EnvVarEditor({ projectId }: { projectId: Id<"projects"> }) {
  const { last } = useActiveDeployment(projectId)
  const customs = useQuery(api.envVars.listForProject, { projectId }) ?? []
  const addVar = useMutation(api.envVars.add)
  const removeVar = useMutation(api.envVars.remove)
  const [draft, setDraft] = useState({ key: "", value: "" })

  const auto = [
    { key: "NEXT_PUBLIC_SUPABASE_URL", value: last?.supabaseUrl ?? "(set on first deploy)" },
    { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", value: last?.status === "ready" ? "eyJ…" : "(set on first deploy)" },
    { key: "SUPABASE_SERVICE_ROLE_KEY", value: last?.status === "ready" ? "eyJ…" : "(set on first deploy)" },
  ]

  return (
    <div className="space-y-6">
      <section>
        <h3 className="font-semibold">Auto-managed</h3>
        <p className="text-xs text-zinc-500">Injected from your provisioned Supabase project on every deploy.</p>
        {auto.map((v) => (
          <div key={v.key} data-row className="flex gap-2 items-center mt-2">
            <label className="w-72 text-xs">{v.key}</label>
            <input aria-label={v.key} value={v.value} readOnly className="flex-1 rounded border px-2 py-1 bg-zinc-50" />
          </div>
        ))}
      </section>
      <section>
        <h3 className="font-semibold">Custom</h3>
        {customs.map((c) => (
          <div key={c._id} data-row className="flex gap-2 items-center mt-2">
            <input value={c.key} readOnly className="w-72 rounded border px-2 py-1" />
            <input value={truncateSecret(c.value)} readOnly className="flex-1 rounded border px-2 py-1" />
            <button onClick={() => removeVar({ id: c._id })} className="text-red-600">Remove</button>
          </div>
        ))}
        <div className="flex gap-2 items-center mt-2">
          <input
            placeholder="KEY"
            className="w-72 rounded border px-2 py-1"
            value={draft.key}
            onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value }))}
          />
          <input
            placeholder="value"
            className="flex-1 rounded border px-2 py-1"
            value={draft.value}
            onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
          />
          <button
            onClick={async () => {
              if (!draft.key) return
              await addVar({ projectId, key: draft.key, value: draft.value })
              setDraft({ key: "", value: "" })
            }}
          >
            Add
          </button>
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 21.3: Commit.**

---

## Task 22: Wire Inngest Function into Serve Handler

**Files:** `src/app/api/inngest/route.ts`

- [ ] **Step 22.1: Add `deployProject` to the `functions` array**

```typescript
import { deployProject } from "@/features/deploy/inngest/deploy-project"

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processMessage, deployProject],
})
```

- [ ] **Step 22.2: Manual smoke**

1. Connect a Vercel token in the integrations sub-plan UI.
2. Click Deploy on a generated project.
3. Watch Inngest dev UI: 9 step.run blocks, each green.
4. Open the `vercel.app` URL: should render the live app reading from the new Supabase.

- [ ] **Step 22.3: Commit.**

---

## Task 23: Documentation and .env.example

- [ ] **Step 23.1: `.env.example` additions**

```
# Deploy pipeline (sub-plan 07)
SUPABASE_MANAGEMENT_API_KEY=         # org-level Bearer token for api.supabase.com
SUPABASE_ORG_ID=                     # the Polaris org id we provision into
SUPABASE_DEFAULT_REGION=us-east-1    # us-east-1 | us-west-1 | eu-west-1 | ap-southeast-1
```

Note: per-user Vercel token is read from `integrations.vercelTokenEnc` (sub-plan 06), not from env.

- [ ] **Step 23.2: `docs/deploy.md` short operator guide**

Cover:
- How to rotate the Supabase Management API key
- How to revoke an org's project (Supabase dashboard)
- How to debug a stuck deployment row (Convex dashboard → manual `markError`)
- Quota override procedure for paid users

- [ ] **Step 23.3: Commit.**

---
