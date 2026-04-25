# Sub-Plan 05 — Spec Panel

> **Authority:** Derives from `docs/CONSTITUTION.md` (esp. Articles I §1.1, II §2.2, XI §11.2, XVIII) and `docs/ROADMAP.md` Phase 2.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship the spec management surface that makes Polaris visibly spec-driven. Add the `specs` table to Convex; expose CRUD mutations with ULID-stable feature ids and ownership checks; build a right-pane Spec tab (peer of the Preview tab from sub-plan 02) that lists features grouped by status, supports add / edit / delete / reorder / status-change, and stubs the "Imported from Praxiom" badge so the §18.4 minimum integration surface ships in v1. Persist the active right-pane tab in the URL search param so reload preserves selection. Keep all copy aligned with Article I §1.1 — Polaris is *evidence → spec → code*; the panel must feel like a first-class citizen, not a tab somebody bolted on.

**Architecture:** `convex/schema.ts` declares `specs` table → `convex/specs.ts` queries/mutations → `useSpec(projectId)` hook fans out reactive Convex query + memoized mutation wrappers with optimistic updates → `<SpecPanel />` renders header + grouped `<FeatureCard />` list + Add CTA → clicking Add or Edit opens `<FeatureForm />` (shadcn `Sheet`) backed by `react-hook-form` → `<AcceptanceCriteriaList />` is the dynamic-row sub-form → `<StatusBadge />` doubles as the inline dropdown trigger. `ProjectIdLayout` swaps its right pane for a `Tabs` host that mounts either `<PreviewPane />` (sub-plan 02) or `<SpecPanel />`, with the active tab written to `?rightPane=spec|preview`.

**Tech Stack:** `convex` (schema + functions), `ulid` (feature ids), `react-hook-form` + `zod` (form validation), `@dnd-kit/core` + `@dnd-kit/sortable` (criterion + feature reordering), shadcn/ui (`Sheet`, `Tabs`, `DropdownMenu`, `Select`, `Badge`, `Button`, `Input`, `Textarea`, `Card`, `Dialog`), `nuqs` (URL search-param state — already a Next.js 15 staple), `vitest` + `@testing-library/react` (tests), `convex-test` (Convex unit harness).

**Phase:** 2 — Visible Surfaces (Days 6-9 of 17-day plan), runs in parallel with sub-plans 02 (Preview), 04 (Conversation polish).

**Constitution articles you must re-read before starting:**
- Article I §1.1 (mission: spec-driven; copy must reinforce *evidence → spec → code*)
- Article II §2.2 (specs are first-class state, equal to files and messages)
- Article XI §11.2 (the exact `specs` table shape — do not invent fields)
- Article XVIII §18.4 (Praxiom v1 stub surface: schema field + hidden badge + 501 import endpoint)
- Article XII (Error Recovery — optimistic mutations must roll back gracefully)

---

## Table of Contents

- [File Structure](#file-structure)
- [Task 1: Install New Dependencies](#task-1-install-new-dependencies)
- [Task 2: Schema Addition — `specs` Table](#task-2-schema-addition--specs-table)
- [Task 3: Spec Types](#task-3-spec-types)
- [Task 4: Convex `specs.ts` — Read Path](#task-4-convex-specsts--read-path)
- [Task 5: Convex `specs.ts` — `initialize` and `addFeature`](#task-5-convex-specsts--initialize-and-addfeature)
- [Task 6: Convex `specs.ts` — `updateFeature`, `removeFeature`, `reorderFeatures`](#task-6-convex-specsts--updatefeature-removefeature-reorderfeatures)
- [Task 7: Convex Tests for `specs.ts`](#task-7-convex-tests-for-specsts)
- [Task 8: `useSpec` Hook](#task-8-usespec-hook)
- [Task 9: `StatusBadge` Component](#task-9-statusbadge-component)
- [Task 10: `PriorityPill` Component](#task-10-prioritypill-component)
- [Task 11: `AcceptanceCriteriaList` Component](#task-11-acceptancecriterialist-component)
- [Task 12: `FeatureForm` Component](#task-12-featureform-component)
- [Task 13: `FeatureCard` Component](#task-13-featurecard-component)
- [Task 14: `SpecPanelEmptyState` Component](#task-14-specpanelemptystate-component)
- [Task 15: `SpecPanel` Top-Level Component](#task-15-specpanel-top-level-component)
- [Task 16: Right-Pane Tabs Host and URL Sync](#task-16-right-pane-tabs-host-and-url-sync)
- [Task 17: Layout Integration](#task-17-layout-integration)
- [Task 18: Component Tests — `StatusBadge`, `FeatureForm`](#task-18-component-tests--statusbadge-featureform)
- [Task 19: End-to-End Smoke Test](#task-19-end-to-end-smoke-test)
- [Task 20: Documentation and Final Sweep](#task-20-documentation-and-final-sweep)

---

## File Structure

### Files to create

```
src/features/spec/types.ts                                      ← NEW: SpecFeature, FeatureStatus, FeaturePriority
src/features/spec/hooks/use-spec.ts                             ← NEW: Convex query + mutation wrappers
src/features/spec/components/spec-panel.tsx                     ← NEW: top-level
src/features/spec/components/spec-panel-empty-state.tsx         ← NEW: empty CTA
src/features/spec/components/feature-card.tsx                   ← NEW: single-feature card
src/features/spec/components/feature-form.tsx                   ← NEW: create/edit Sheet
src/features/spec/components/acceptance-criteria-list.tsx       ← NEW: dynamic rows
src/features/spec/components/status-badge.tsx                   ← NEW: pill + DropdownMenu
src/features/spec/components/priority-pill.tsx                  ← NEW: p0/p1/p2 pill
src/features/spec/components/praxiom-badge.tsx                  ← NEW: hidden unless praxiomDocumentId
src/features/spec/lib/group-features.ts                         ← NEW: pure helper
src/features/spec/lib/feature-form-schema.ts                    ← NEW: zod schema
src/features/projects/components/right-pane.tsx                 ← NEW: Tabs host (Preview | Spec)
src/features/projects/hooks/use-right-pane-tab.ts               ← NEW: URL search-param state
convex/specs.ts                                                 ← NEW: queries + mutations

tests/unit/convex/specs.test.ts                                 ← NEW
tests/unit/spec/group-features.test.ts                          ← NEW
tests/unit/spec/feature-form-schema.test.ts                     ← NEW
tests/unit/spec/status-badge.test.tsx                           ← NEW
tests/unit/spec/feature-form.test.tsx                           ← NEW
```

### Files to modify

```
convex/schema.ts                                                ← Add specs table
src/features/projects/components/project-id-layout.tsx          ← Swap right pane for RightPane host
package.json                                                    ← Add ulid, react-hook-form, zod, dnd-kit, nuqs
```

---

## Task 1: Install New Dependencies

**Why first:** Every component below imports something we add here. Get the deps in place before TDD so failing tests fail for the right reason.

**Files:** `package.json`

- [ ] **Step 1.1: Install runtime deps**

```bash
npm install ulid react-hook-form zod @hookform/resolvers @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities nuqs
```

Notes:
- `ulid` (not `nanoid`) is required by Constitution §11.2: feature ids are ULIDs to give them lexicographic time-ordering — handy for chronological sorts before users reorder.
- `nuqs` is the canonical Next.js 15 search-param state library; we use it in Task 16 for the right-pane tab.
- `react-hook-form` + `zod` is the project's standard validation pair; if it's already a dependency from sub-plan 04, skip it — `npm install` is idempotent.

- [ ] **Step 1.2: Install dev deps**

```bash
npm install -D @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom convex-test
```

- [ ] **Step 1.3: Extend `vitest.config.ts`**

Add a second test project so component tests run under jsdom while Node-side tests stay under node:

```typescript
import { defineConfig } from "vitest/config";
import path from "path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    environmentMatchGlobs: [
      ["tests/unit/**/*.test.tsx", "jsdom"],
      ["tests/unit/**/*.test.ts", "node"],
    ],
    include: ["tests/unit/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

Create `tests/setup.ts`:

```typescript
import "@testing-library/jest-dom/vitest";
```

Install the React plugin if missing:

```bash
npm install -D @vitejs/plugin-react
```

- [ ] **Step 1.4: Verify**

```bash
npm run typecheck
npm run test:unit
```

Both must pass (no spec tests yet, but the harness must not be broken).

- [ ] **Step 1.5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/setup.ts
git commit -m "chore(spec): install spec-panel deps (ulid, rhf, zod, dnd-kit, nuqs)"
```

---

## Task 2: Schema Addition — `specs` Table

**Why now:** Convex will reject any `specs.ts` mutation we write before the table exists. Schema-first.

**Files:** `convex/schema.ts`

Constitution §11.2 dictates the shape exactly. Convex's value system does not support a nested array of objects with optional fields directly through `v.array(v.object({...}))` cleanly when one of those object fields is itself optional and array-shaped (`praxiomEvidenceIds?: string[]`); we accept that and use the standard nested validators rather than serializing to JSON-string. (The required-reading note about "JSON-serialized" is wrong: Convex *does* support `v.array(v.object(...))`. Confirmed via `convex/values` docs. We surface this in Open Questions but proceed with the typed shape — it's strictly better for indexing and test ergonomics.)

- [ ] **Step 2.1: Define the validators**

Append the following to `convex/schema.ts`:

```typescript
// convex/schema.ts (append inside defineSchema)
specs: defineTable({
  projectId: v.id("projects"),
  features: v.array(
    v.object({
      id: v.string(),                              // ULID
      title: v.string(),
      description: v.string(),
      acceptanceCriteria: v.array(v.string()),
      status: v.union(
        v.literal("todo"),
        v.literal("in_progress"),
        v.literal("done"),
        v.literal("blocked"),
      ),
      priority: v.union(
        v.literal("p0"),
        v.literal("p1"),
        v.literal("p2"),
      ),
      praxiomEvidenceIds: v.optional(v.array(v.string())),
    }),
  ),
  updatedAt: v.number(),
  updatedBy: v.union(
    v.literal("user"),
    v.literal("agent"),
    v.literal("praxiom"),
  ),
  praxiomDocumentId: v.optional(v.string()),
}).index("by_project", ["projectId"]),
```

- [ ] **Step 2.2: Push**

```bash
npx convex dev
```

Convex CLI must apply the migration without prompting for data backfill (no rows yet). Watch for validator errors.

- [ ] **Step 2.3: Verify**

```bash
npx convex run --no-push '_system/queryDocuments' '{"table": "specs"}' 2>/dev/null || true
```

(Or visit the Convex dashboard.) An empty list is the right answer.

- [ ] **Step 2.4: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(convex): add specs table per Constitution 11.2"
```

---

## Task 3: Spec Types

**Why now:** Both the Convex layer and the React layer import these. Defining them once in the feature folder avoids the temptation to redeclare them inside hooks or components.

**Files:**
- Create: `src/features/spec/types.ts`

- [ ] **Step 3.1: Write the types**

```typescript
// src/features/spec/types.ts
import type { Id } from "../../../convex/_generated/dataModel";

export type FeatureStatus = "todo" | "in_progress" | "done" | "blocked";
export type FeaturePriority = "p0" | "p1" | "p2";

export const FEATURE_STATUSES: FeatureStatus[] = [
  "todo",
  "in_progress",
  "done",
  "blocked",
];

export const FEATURE_PRIORITIES: FeaturePriority[] = ["p0", "p1", "p2"];

export const STATUS_LABEL: Record<FeatureStatus, string> = {
  todo: "Todo",
  in_progress: "In progress",
  done: "Done",
  blocked: "Blocked",
};

export const PRIORITY_LABEL: Record<FeaturePriority, string> = {
  p0: "P0 — must ship",
  p1: "P1 — should ship",
  p2: "P2 — nice to have",
};

export interface SpecFeature {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  status: FeatureStatus;
  priority: FeaturePriority;
  praxiomEvidenceIds?: string[];
}

export interface Spec {
  _id: Id<"specs">;
  projectId: Id<"projects">;
  features: SpecFeature[];
  updatedAt: number;
  updatedBy: "user" | "agent" | "praxiom";
  praxiomDocumentId?: string;
}

export type FeaturePatch = Partial<
  Omit<SpecFeature, "id" | "praxiomEvidenceIds">
>;
```

- [ ] **Step 3.2: Commit**

```bash
git add src/features/spec/types.ts
git commit -m "feat(spec): add SpecFeature/FeatureStatus/FeaturePriority types"
```

---

## Task 4: Convex `specs.ts` — Read Path

**Why this slice first:** The read query is the smallest possible Convex function we can write that exercises the table, the index, and the ownership check. Once it works, every mutation reuses the same `assertOwnsProject` helper.

**Files:**
- Create: `convex/specs.ts`

- [ ] **Step 4.1: Test first**

Create `tests/unit/convex/specs.test.ts`:

```typescript
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../../convex/schema";
import { api } from "../../../convex/_generated/api";

const SOME_USER = "user_clerk_abc";
const OTHER_USER = "user_clerk_xyz";

async function seedProject(t: ReturnType<typeof convexTest>, ownerId = SOME_USER) {
  return t.run(async (ctx) => {
    return ctx.db.insert("projects", {
      name: "Spec Test",
      ownerId,
      updatedAt: Date.now(),
    });
  });
}

describe("specs.get", () => {
  it("returns null when no spec exists", async () => {
    const t = convexTest(schema);
    const projectId = await seedProject(t);

    const result = await t
      .withIdentity({ subject: SOME_USER })
      .query(api.specs.get, { projectId });

    expect(result).toBeNull();
  });

  it("rejects non-owners", async () => {
    const t = convexTest(schema);
    const projectId = await seedProject(t, OTHER_USER);

    await expect(
      t
        .withIdentity({ subject: SOME_USER })
        .query(api.specs.get, { projectId }),
    ).rejects.toThrow(/not authorized/i);
  });
});
```

Run:

```bash
npx vitest run tests/unit/convex/specs.test.ts
```

The first test will fail because `convex/specs.ts` does not exist. Good.

- [ ] **Step 4.2: Implement `get` and the ownership helper**

```typescript
// convex/specs.ts
import { v } from "convex/values";
import { query, type QueryCtx, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export async function assertOwnsProject(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authorized: missing identity");
  }
  const project = await ctx.db.get(projectId);
  if (!project) {
    throw new Error("Project not found");
  }
  if (project.ownerId !== identity.subject) {
    throw new Error("Not authorized: not project owner");
  }
}

export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await assertOwnsProject(ctx, projectId);
    const spec = await ctx.db
      .query("specs")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .unique();
    return spec ?? null;
  },
});
```

Run the test again — both cases pass.

- [ ] **Step 4.3: Commit**

```bash
git add convex/specs.ts tests/unit/convex/specs.test.ts
git commit -m "feat(convex): specs.get query with ownership check"
```

---

## Task 5: Convex `specs.ts` — `initialize` and `addFeature`

**Files:**
- Modify: `convex/specs.ts`
- Modify: `tests/unit/convex/specs.test.ts`

- [ ] **Step 5.1: Add tests**

Append to `tests/unit/convex/specs.test.ts`:

```typescript
describe("specs.initialize", () => {
  it("creates an empty spec for the project", async () => {
    const t = convexTest(schema);
    const projectId = await seedProject(t);

    const id = await t
      .withIdentity({ subject: SOME_USER })
      .mutation(api.specs.initialize, { projectId });

    expect(id).toBeDefined();
    const spec = await t
      .withIdentity({ subject: SOME_USER })
      .query(api.specs.get, { projectId });
    expect(spec?.features).toEqual([]);
    expect(spec?.updatedBy).toBe("user");
    expect(spec?.praxiomDocumentId).toBeUndefined();
  });

  it("is idempotent — second call returns existing spec id", async () => {
    const t = convexTest(schema);
    const projectId = await seedProject(t);
    const auth = t.withIdentity({ subject: SOME_USER });

    const a = await auth.mutation(api.specs.initialize, { projectId });
    const b = await auth.mutation(api.specs.initialize, { projectId });
    expect(a).toEqual(b);
  });
});

describe("specs.addFeature", () => {
  it("appends a feature with a generated ULID", async () => {
    const t = convexTest(schema);
    const projectId = await seedProject(t);
    const auth = t.withIdentity({ subject: SOME_USER });
    await auth.mutation(api.specs.initialize, { projectId });

    const id = await auth.mutation(api.specs.addFeature, {
      projectId,
      feature: {
        title: "Login with Google",
        description: "Users can sign in via Google OAuth.",
        acceptanceCriteria: ["Redirects to Google", "Returns to /dashboard"],
        status: "todo",
        priority: "p0",
      },
    });

    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/); // ULID
    const spec = await auth.query(api.specs.get, { projectId });
    expect(spec?.features).toHaveLength(1);
    expect(spec?.features[0].title).toBe("Login with Google");
    expect(spec?.features[0].id).toBe(id);
  });

  it("creates the spec on the fly if missing", async () => {
    const t = convexTest(schema);
    const projectId = await seedProject(t);
    const auth = t.withIdentity({ subject: SOME_USER });

    await auth.mutation(api.specs.addFeature, {
      projectId,
      feature: {
        title: "x",
        description: "",
        acceptanceCriteria: [],
        status: "todo",
        priority: "p2",
      },
    });

    const spec = await auth.query(api.specs.get, { projectId });
    expect(spec?.features).toHaveLength(1);
  });
});
```

- [ ] **Step 5.2: Implement**

```typescript
// convex/specs.ts (append)
import { mutation } from "./_generated/server";
import { ulid } from "ulid";

const featureInputValidator = v.object({
  title: v.string(),
  description: v.string(),
  acceptanceCriteria: v.array(v.string()),
  status: v.union(
    v.literal("todo"),
    v.literal("in_progress"),
    v.literal("done"),
    v.literal("blocked"),
  ),
  priority: v.union(
    v.literal("p0"),
    v.literal("p1"),
    v.literal("p2"),
  ),
});

async function getOrCreateSpec(
  ctx: MutationCtx,
  projectId: Id<"projects">,
): Promise<Id<"specs">> {
  const existing = await ctx.db
    .query("specs")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .unique();
  if (existing) return existing._id;
  return ctx.db.insert("specs", {
    projectId,
    features: [],
    updatedAt: Date.now(),
    updatedBy: "user",
  });
}

export const initialize = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await assertOwnsProject(ctx, projectId);
    return getOrCreateSpec(ctx, projectId);
  },
});

export const addFeature = mutation({
  args: { projectId: v.id("projects"), feature: featureInputValidator },
  handler: async (ctx, { projectId, feature }) => {
    await assertOwnsProject(ctx, projectId);
    const specId = await getOrCreateSpec(ctx, projectId);
    const spec = await ctx.db.get(specId);
    if (!spec) throw new Error("Spec vanished mid-mutation");

    const id = ulid();
    await ctx.db.patch(specId, {
      features: [...spec.features, { id, ...feature }],
      updatedAt: Date.now(),
      updatedBy: "user",
    });
    return id;
  },
});
```

- [ ] **Step 5.3: Run + commit**

```bash
npx vitest run tests/unit/convex/specs.test.ts
git add convex/specs.ts tests/unit/convex/specs.test.ts
git commit -m "feat(convex): specs.initialize + specs.addFeature with ULID ids"
```

---

## Task 6: Convex `specs.ts` — `updateFeature`, `removeFeature`, `reorderFeatures`

**Files:**
- Modify: `convex/specs.ts`
- Modify: `tests/unit/convex/specs.test.ts`

- [ ] **Step 6.1: Test first**

```typescript
describe("specs.updateFeature", () => {
  it("patches only provided fields", async () => {
    const t = convexTest(schema);
    const projectId = await seedProject(t);
    const auth = t.withIdentity({ subject: SOME_USER });
    const featureId = await auth.mutation(api.specs.addFeature, {
      projectId,
      feature: {
        title: "Original",
        description: "Desc",
        acceptanceCriteria: ["a"],
        status: "todo",
        priority: "p1",
      },
    });

    await auth.mutation(api.specs.updateFeature, {
      projectId,
      featureId,
      patch: { status: "in_progress", title: "New" },
    });

    const spec = await auth.query(api.specs.get, { projectId });
    expect(spec?.features[0].status).toBe("in_progress");
    expect(spec?.features[0].title).toBe("New");
    expect(spec?.features[0].description).toBe("Desc"); // untouched
  });

  it("throws when feature id is unknown", async () => {
    const t = convexTest(schema);
    const projectId = await seedProject(t);
    const auth = t.withIdentity({ subject: SOME_USER });
    await auth.mutation(api.specs.initialize, { projectId });

    await expect(
      auth.mutation(api.specs.updateFeature, {
        projectId,
        featureId: "nonsense",
        patch: { status: "done" },
      }),
    ).rejects.toThrow(/feature not found/i);
  });
});

describe("specs.removeFeature", () => {
  it("drops the feature by id and leaves the rest in order", async () => {
    const t = convexTest(schema);
    const projectId = await seedProject(t);
    const auth = t.withIdentity({ subject: SOME_USER });
    const a = await auth.mutation(api.specs.addFeature, {
      projectId,
      feature: { title: "A", description: "", acceptanceCriteria: [], status: "todo", priority: "p1" },
    });
    const b = await auth.mutation(api.specs.addFeature, {
      projectId,
      feature: { title: "B", description: "", acceptanceCriteria: [], status: "todo", priority: "p1" },
    });
    const c = await auth.mutation(api.specs.addFeature, {
      projectId,
      feature: { title: "C", description: "", acceptanceCriteria: [], status: "todo", priority: "p1" },
    });

    await auth.mutation(api.specs.removeFeature, { projectId, featureId: b });
    const spec = await auth.query(api.specs.get, { projectId });
    expect(spec?.features.map((f) => f.id)).toEqual([a, c]);
  });
});

describe("specs.reorderFeatures", () => {
  it("reorders features to match the provided id list", async () => {
    const t = convexTest(schema);
    const projectId = await seedProject(t);
    const auth = t.withIdentity({ subject: SOME_USER });
    const a = await auth.mutation(api.specs.addFeature, {
      projectId,
      feature: { title: "A", description: "", acceptanceCriteria: [], status: "todo", priority: "p1" },
    });
    const b = await auth.mutation(api.specs.addFeature, {
      projectId,
      feature: { title: "B", description: "", acceptanceCriteria: [], status: "todo", priority: "p1" },
    });

    await auth.mutation(api.specs.reorderFeatures, {
      projectId,
      orderedIds: [b, a],
    });
    const spec = await auth.query(api.specs.get, { projectId });
    expect(spec?.features.map((f) => f.id)).toEqual([b, a]);
  });

  it("rejects if orderedIds is not a permutation of existing ids", async () => {
    const t = convexTest(schema);
    const projectId = await seedProject(t);
    const auth = t.withIdentity({ subject: SOME_USER });
    const a = await auth.mutation(api.specs.addFeature, {
      projectId,
      feature: { title: "A", description: "", acceptanceCriteria: [], status: "todo", priority: "p1" },
    });

    await expect(
      auth.mutation(api.specs.reorderFeatures, {
        projectId,
        orderedIds: [a, "ghost"],
      }),
    ).rejects.toThrow(/permutation/i);
  });
});
```

- [ ] **Step 6.2: Implement**

Append to `convex/specs.ts`:

```typescript
const featurePatchValidator = v.object({
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  acceptanceCriteria: v.optional(v.array(v.string())),
  status: v.optional(
    v.union(
      v.literal("todo"),
      v.literal("in_progress"),
      v.literal("done"),
      v.literal("blocked"),
    ),
  ),
  priority: v.optional(
    v.union(v.literal("p0"), v.literal("p1"), v.literal("p2")),
  ),
});

async function loadSpecOrThrow(
  ctx: MutationCtx,
  projectId: Id<"projects">,
) {
  const spec = await ctx.db
    .query("specs")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .unique();
  if (!spec) throw new Error("Spec not found for project");
  return spec;
}

export const updateFeature = mutation({
  args: {
    projectId: v.id("projects"),
    featureId: v.string(),
    patch: featurePatchValidator,
  },
  handler: async (ctx, { projectId, featureId, patch }) => {
    await assertOwnsProject(ctx, projectId);
    const spec = await loadSpecOrThrow(ctx, projectId);

    const idx = spec.features.findIndex((f) => f.id === featureId);
    if (idx === -1) throw new Error("Feature not found");

    const updated = [...spec.features];
    updated[idx] = { ...updated[idx], ...patch };
    await ctx.db.patch(spec._id, {
      features: updated,
      updatedAt: Date.now(),
      updatedBy: "user",
    });
  },
});

export const removeFeature = mutation({
  args: { projectId: v.id("projects"), featureId: v.string() },
  handler: async (ctx, { projectId, featureId }) => {
    await assertOwnsProject(ctx, projectId);
    const spec = await loadSpecOrThrow(ctx, projectId);
    const filtered = spec.features.filter((f) => f.id !== featureId);
    if (filtered.length === spec.features.length) {
      throw new Error("Feature not found");
    }
    await ctx.db.patch(spec._id, {
      features: filtered,
      updatedAt: Date.now(),
      updatedBy: "user",
    });
  },
});

export const reorderFeatures = mutation({
  args: { projectId: v.id("projects"), orderedIds: v.array(v.string()) },
  handler: async (ctx, { projectId, orderedIds }) => {
    await assertOwnsProject(ctx, projectId);
    const spec = await loadSpecOrThrow(ctx, projectId);

    const known = new Set(spec.features.map((f) => f.id));
    const requested = new Set(orderedIds);
    const isPermutation =
      orderedIds.length === spec.features.length &&
      orderedIds.every((id) => known.has(id)) &&
      [...known].every((id) => requested.has(id));
    if (!isPermutation) {
      throw new Error("orderedIds must be a permutation of existing feature ids");
    }

    const byId = new Map(spec.features.map((f) => [f.id, f]));
    await ctx.db.patch(spec._id, {
      features: orderedIds.map((id) => byId.get(id)!),
      updatedAt: Date.now(),
      updatedBy: "user",
    });
  },
});
```

- [ ] **Step 6.3: Run + commit**

```bash
npx vitest run tests/unit/convex/specs.test.ts
git add convex/specs.ts tests/unit/convex/specs.test.ts
git commit -m "feat(convex): updateFeature, removeFeature, reorderFeatures"
```

---

## Task 7: Convex Tests for `specs.ts`

**Why this exists separately:** Tasks 4-6 already wrote tests interleaved with implementation. This task is a pass to add the *tricky* edge cases we deferred.

**Files:**
- Modify: `tests/unit/convex/specs.test.ts`

- [ ] **Step 7.1: Edge-case tests**

```typescript
describe("specs ownership", () => {
  it("non-owner cannot addFeature", async () => {
    const t = convexTest(schema);
    const projectId = await seedProject(t, OTHER_USER);

    await expect(
      t.withIdentity({ subject: SOME_USER }).mutation(api.specs.addFeature, {
        projectId,
        feature: {
          title: "x",
          description: "",
          acceptanceCriteria: [],
          status: "todo",
          priority: "p2",
        },
      }),
    ).rejects.toThrow(/not authorized/i);
  });

  it("non-owner cannot reorder", async () => {
    const t = convexTest(schema);
    const projectId = await seedProject(t, OTHER_USER);

    await expect(
      t.withIdentity({ subject: SOME_USER }).mutation(api.specs.reorderFeatures, {
        projectId,
        orderedIds: [],
      }),
    ).rejects.toThrow(/not authorized/i);
  });
});

describe("specs concurrency", () => {
  it("two adds in flight both land", async () => {
    const t = convexTest(schema);
    const projectId = await seedProject(t);
    const auth = t.withIdentity({ subject: SOME_USER });
    await auth.mutation(api.specs.initialize, { projectId });

    const [a, b] = await Promise.all([
      auth.mutation(api.specs.addFeature, {
        projectId,
        feature: { title: "A", description: "", acceptanceCriteria: [], status: "todo", priority: "p1" },
      }),
      auth.mutation(api.specs.addFeature, {
        projectId,
        feature: { title: "B", description: "", acceptanceCriteria: [], status: "todo", priority: "p1" },
      }),
    ]);

    expect(a).not.toEqual(b);
    const spec = await auth.query(api.specs.get, { projectId });
    expect(spec?.features.map((f) => f.title).sort()).toEqual(["A", "B"]);
  });
});
```

`convex-test` serializes mutations per-document, so the concurrency test passes deterministically — the assertion is *both writes survive*, not *which order*.

- [ ] **Step 7.2: Run + commit**

```bash
npx vitest run tests/unit/convex/specs.test.ts
git add tests/unit/convex/specs.test.ts
git commit -m "test(convex): ownership + concurrency edges for specs"
```

---

## Task 8: `useSpec` Hook

**Files:**
- Create: `src/features/spec/hooks/use-spec.ts`

**What it returns:** the reactive spec value plus pre-bound mutation callbacks. Optimistic updates: when the user adds, edits, deletes, or reorders, we wrap each mutation with a `withOptimisticUpdate` so the UI reflects the change before the round-trip completes. On failure the Convex client rolls back automatically and we surface a toast.

- [ ] **Step 8.1: Implement**

```typescript
// src/features/spec/hooks/use-spec.ts
"use client";

import { useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type {
  FeaturePatch,
  FeaturePriority,
  FeatureStatus,
  Spec,
  SpecFeature,
} from "../types";

interface NewFeatureInput {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  status: FeatureStatus;
  priority: FeaturePriority;
}

export function useSpec(projectId: Id<"projects">) {
  const spec = useQuery(api.specs.get, { projectId }) as Spec | null | undefined;

  const addFeatureRaw = useMutation(api.specs.addFeature).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.specs.get, { projectId });
      if (!current) return;
      const optimistic: SpecFeature = {
        id: `optimistic-${crypto.randomUUID()}`,
        ...args.feature,
      };
      localStore.setQuery(
        api.specs.get,
        { projectId },
        { ...current, features: [...current.features, optimistic] },
      );
    },
  );

  const updateFeatureRaw = useMutation(
    api.specs.updateFeature,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.specs.get, { projectId });
    if (!current) return;
    localStore.setQuery(api.specs.get, { projectId }, {
      ...current,
      features: current.features.map((f) =>
        f.id === args.featureId ? { ...f, ...args.patch } : f,
      ),
    });
  });

  const removeFeatureRaw = useMutation(
    api.specs.removeFeature,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.specs.get, { projectId });
    if (!current) return;
    localStore.setQuery(api.specs.get, { projectId }, {
      ...current,
      features: current.features.filter((f) => f.id !== args.featureId),
    });
  });

  const reorderFeaturesRaw = useMutation(
    api.specs.reorderFeatures,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.specs.get, { projectId });
    if (!current) return;
    const byId = new Map(current.features.map((f) => [f.id, f]));
    const reordered = args.orderedIds
      .map((id) => byId.get(id))
      .filter((f): f is SpecFeature => Boolean(f));
    localStore.setQuery(api.specs.get, { projectId }, {
      ...current,
      features: reordered,
    });
  });

  const initialize = useMutation(api.specs.initialize);

  return useMemo(
    () => ({
      spec,
      isLoading: spec === undefined,
      isEmpty: spec === null || (spec?.features.length ?? 0) === 0,
      initialize: () => initialize({ projectId }).catch(toastFailure("create")),
      addFeature: (feature: NewFeatureInput) =>
        addFeatureRaw({ projectId, feature }).catch(toastFailure("add")),
      updateFeature: (featureId: string, patch: FeaturePatch) =>
        updateFeatureRaw({ projectId, featureId, patch }).catch(
          toastFailure("update"),
        ),
      removeFeature: (featureId: string) =>
        removeFeatureRaw({ projectId, featureId }).catch(toastFailure("delete")),
      reorderFeatures: (orderedIds: string[]) =>
        reorderFeaturesRaw({ projectId, orderedIds }).catch(
          toastFailure("reorder"),
        ),
    }),
    [
      spec,
      projectId,
      initialize,
      addFeatureRaw,
      updateFeatureRaw,
      removeFeatureRaw,
      reorderFeaturesRaw,
    ],
  );
}

function toastFailure(action: string) {
  return (err: unknown) => {
    const msg = err instanceof Error ? err.message : "Unknown error";
    toast.error(`Couldn't ${action} feature`, { description: msg });
    throw err;
  };
}
```

- [ ] **Step 8.2: Commit**

```bash
git add src/features/spec/hooks/use-spec.ts
git commit -m "feat(spec): useSpec hook with optimistic CRUD wrappers"
```

---

## Task 9: `StatusBadge` Component

**Why now:** It's a leaf with no upstream dependencies. Building it before `FeatureCard` means we can render `FeatureCard` with no placeholders.

**Files:**
- Create: `src/features/spec/components/status-badge.tsx`

- [ ] **Step 9.1: Implement**

```tsx
// src/features/spec/components/status-badge.tsx
"use client";

import { Check, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import {
  FEATURE_STATUSES,
  STATUS_LABEL,
  type FeatureStatus,
} from "../types";

const STATUS_STYLES: Record<FeatureStatus, string> = {
  todo: "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200",
  in_progress: "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-200",
  done: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200",
  blocked: "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-200",
};

interface Props {
  status: FeatureStatus;
  onChange?: (next: FeatureStatus) => void;
  readOnly?: boolean;
}

export function StatusBadge({ status, onChange, readOnly }: Props) {
  if (readOnly || !onChange) {
    return (
      <Badge className={cn("font-medium", STATUS_STYLES[status])}>
        {STATUS_LABEL[status]}
      </Badge>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Change status — currently ${STATUS_LABEL[status]}`}
          className="inline-flex"
        >
          <Badge
            className={cn(
              "font-medium gap-1 cursor-pointer",
              STATUS_STYLES[status],
            )}
          >
            {STATUS_LABEL[status]}
            <ChevronDown className="h-3 w-3" aria-hidden />
          </Badge>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {FEATURE_STATUSES.map((next) => (
          <DropdownMenuItem
            key={next}
            onSelect={() => onChange(next)}
            className="gap-2"
          >
            {next === status ? (
              <Check className="h-3 w-3" aria-hidden />
            ) : (
              <span className="w-3" aria-hidden />
            )}
            {STATUS_LABEL[next]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 9.2: Commit**

```bash
git add src/features/spec/components/status-badge.tsx
git commit -m "feat(spec): StatusBadge with inline DropdownMenu"
```

---

## Task 10: `PriorityPill` Component

**Files:**
- Create: `src/features/spec/components/priority-pill.tsx`

- [ ] **Step 10.1: Implement**

```tsx
// src/features/spec/components/priority-pill.tsx
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { FeaturePriority } from "../types";

const PRIORITY_STYLES: Record<FeaturePriority, string> = {
  p0: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200",
  p1: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  p2: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
};

const SHORT_LABEL: Record<FeaturePriority, string> = {
  p0: "P0",
  p1: "P1",
  p2: "P2",
};

export function PriorityPill({ priority }: { priority: FeaturePriority }) {
  return (
    <Badge
      variant="outline"
      className={cn("font-mono uppercase", PRIORITY_STYLES[priority])}
    >
      {SHORT_LABEL[priority]}
    </Badge>
  );
}
```

- [ ] **Step 10.2: Commit**

```bash
git add src/features/spec/components/priority-pill.tsx
git commit -m "feat(spec): PriorityPill"
```

---

## Task 11: `AcceptanceCriteriaList` Component

**Files:**
- Create: `src/features/spec/components/acceptance-criteria-list.tsx`

- [ ] **Step 11.1: Implement**

```tsx
// src/features/spec/components/acceptance-criteria-list.tsx
"use client";

import { useId } from "react";
import { GripVertical, Plus, X } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
}

export function AcceptanceCriteriaList({ value, onChange }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = value.map((_, i) => `row-${i}`);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    onChange(arrayMove(value, from, to));
  }

  return (
    <div className="space-y-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {value.map((row, i) => (
            <CriterionRow
              key={ids[i]}
              id={ids[i]}
              value={row}
              onChange={(v) => {
                const next = [...value];
                next[i] = v;
                onChange(next);
              }}
              onRemove={() => onChange(value.filter((_, j) => j !== i))}
            />
          ))}
        </SortableContext>
      </DndContext>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onChange([...value, ""])}
        className="gap-1"
      >
        <Plus className="h-3 w-3" /> Add criterion
      </Button>
    </div>
  );
}

function CriterionRow({
  id,
  value,
  onChange,
  onRemove,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onRemove: () => void;
}) {
  const inputId = useId();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 ${isDragging ? "opacity-60" : ""}`}
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
        className="cursor-grab text-zinc-400 hover:text-zinc-600"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Input
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="user can do X"
        className="flex-1"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        aria-label="Remove criterion"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 11.2: Commit**

```bash
git add src/features/spec/components/acceptance-criteria-list.tsx
git commit -m "feat(spec): AcceptanceCriteriaList with dnd-kit reorder"
```

---

## Task 12: `FeatureForm` Component

**Files:**
- Create: `src/features/spec/lib/feature-form-schema.ts`
- Create: `src/features/spec/components/feature-form.tsx`

- [ ] **Step 12.1: Zod schema**

```typescript
// src/features/spec/lib/feature-form-schema.ts
import { z } from "zod";

export const featureFormSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(120, "Keep titles short"),
  description: z.string().max(2000, "Descriptions max out at 2,000 characters"),
  acceptanceCriteria: z
    .array(z.string().min(1, "Empty criteria look broken — remove the row"))
    .max(20, "Twenty criteria is plenty — split into multiple features"),
  status: z.enum(["todo", "in_progress", "done", "blocked"]),
  priority: z.enum(["p0", "p1", "p2"]),
});

export type FeatureFormValues = z.infer<typeof featureFormSchema>;
```

- [ ] **Step 12.2: Form component**

```tsx
// src/features/spec/components/feature-form.tsx
"use client";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

import {
  FEATURE_PRIORITIES,
  FEATURE_STATUSES,
  PRIORITY_LABEL,
  STATUS_LABEL,
  type SpecFeature,
} from "../types";
import {
  featureFormSchema,
  type FeatureFormValues,
} from "../lib/feature-form-schema";
import { AcceptanceCriteriaList } from "./acceptance-criteria-list";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: SpecFeature | null;
  onSubmit: (values: FeatureFormValues) => Promise<unknown> | void;
}

const EMPTY: FeatureFormValues = {
  title: "",
  description: "",
  acceptanceCriteria: [],
  status: "todo",
  priority: "p1",
};

export function FeatureForm({ open, onOpenChange, initial, onSubmit }: Props) {
  const isEdit = Boolean(initial);
  const form = useForm<FeatureFormValues>({
    resolver: zodResolver(featureFormSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      initial
        ? {
            title: initial.title,
            description: initial.description,
            acceptanceCriteria: initial.acceptanceCriteria,
            status: initial.status,
            priority: initial.priority,
          }
        : EMPTY,
    );
  }, [open, initial, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values);
    onOpenChange(false);
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          <SheetHeader>
            <SheetTitle>{isEdit ? "Edit feature" : "Add feature"}</SheetTitle>
            <SheetDescription>
              Specs help the AI stay on track and make sure features ship
              correctly.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="feature-title">Title</Label>
              <Input
                id="feature-title"
                {...form.register("title")}
                placeholder="Login with Google"
                aria-invalid={Boolean(form.formState.errors.title)}
              />
              {form.formState.errors.title && (
                <p role="alert" className="text-xs text-rose-600">
                  {form.formState.errors.title.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="feature-description">Description</Label>
              <Textarea
                id="feature-description"
                rows={4}
                {...form.register("description")}
                placeholder="What this feature is, who it's for, and why we care."
              />
            </div>

            <div className="space-y-1.5">
              <Label>Acceptance criteria</Label>
              <Controller
                control={form.control}
                name="acceptanceCriteria"
                render={({ field }) => (
                  <AcceptanceCriteriaList
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              {form.formState.errors.acceptanceCriteria && (
                <p role="alert" className="text-xs text-rose-600">
                  {form.formState.errors.acceptanceCriteria.message ??
                    "Some criteria are empty"}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="feature-status">Status</Label>
                <Controller
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="feature-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FEATURE_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="feature-priority">Priority</Label>
                <Controller
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="feature-priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FEATURE_PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p}>
                            {PRIORITY_LABEL[p]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
          </div>

          <SheetFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {isEdit ? "Save changes" : "Add feature"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 12.3: Commit**

```bash
git add src/features/spec/lib/feature-form-schema.ts src/features/spec/components/feature-form.tsx
git commit -m "feat(spec): FeatureForm sheet with rhf + zod validation"
```

---

## Task 13: `FeatureCard` Component

**Files:**
- Create: `src/features/spec/components/feature-card.tsx`

- [ ] **Step 13.1: Implement**

```tsx
// src/features/spec/components/feature-card.tsx
"use client";

import { Pencil, Trash2 } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import type { FeaturePatch, SpecFeature } from "../types";
import { StatusBadge } from "./status-badge";
import { PriorityPill } from "./priority-pill";

interface Props {
  feature: SpecFeature;
  onEdit: () => void;
  onPatch: (patch: FeaturePatch) => void;
  onDelete: () => void;
}

export function FeatureCard({ feature, onEdit, onPatch, onDelete }: Props) {
  return (
    <Card className="border-zinc-200 dark:border-zinc-800">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1.5 min-w-0">
            <h3 className="font-medium text-sm leading-tight truncate">
              {feature.title || "Untitled feature"}
            </h3>
            <div className="flex items-center gap-2">
              <StatusBadge
                status={feature.status}
                onChange={(status) => onPatch({ status })}
              />
              <PriorityPill priority={feature.priority} />
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={onEdit}
              aria-label="Edit feature"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Delete feature">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this feature?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {`"${feature.title || "Untitled feature"}" will be removed from the spec. This is not undoable.`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-zinc-600 dark:text-zinc-300 space-y-3">
        {feature.description && (
          <p className="whitespace-pre-wrap">{feature.description}</p>
        )}
        {feature.acceptanceCriteria.length > 0 && (
          <ul className="space-y-1">
            {feature.acceptanceCriteria.map((criterion, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs">
                <span
                  aria-hidden
                  className="mt-0.5 text-emerald-600 dark:text-emerald-400"
                >
                  ✓
                </span>
                <span>{criterion}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 13.2: Commit**

```bash
git add src/features/spec/components/feature-card.tsx
git commit -m "feat(spec): FeatureCard with inline status, edit, delete"
```

---

## Task 14: `SpecPanelEmptyState` Component

**Files:**
- Create: `src/features/spec/components/spec-panel-empty-state.tsx`

- [ ] **Step 14.1: Implement**

```tsx
// src/features/spec/components/spec-panel-empty-state.tsx
"use client";

import { Sparkles, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  onAddFirst: () => void;
}

export function SpecPanelEmptyState({ onAddFirst }: Props) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-8 gap-4">
      <div className="rounded-full bg-blue-50 dark:bg-blue-950 p-3">
        <Sparkles className="h-6 w-6 text-blue-600 dark:text-blue-300" aria-hidden />
      </div>
      <div className="space-y-1.5 max-w-xs">
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
          Describe what you&apos;re building
        </h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Specs help the AI stay on track and make sure features ship correctly.
        </p>
      </div>
      <Button onClick={onAddFirst} className="gap-1.5">
        <Plus className="h-4 w-4" />
        Add your first feature
      </Button>
    </div>
  );
}
```

- [ ] **Step 14.2: Commit**

```bash
git add src/features/spec/components/spec-panel-empty-state.tsx
git commit -m "feat(spec): SpecPanelEmptyState"
```

---

## Task 15: `SpecPanel` Top-Level Component

**Files:**
- Create: `src/features/spec/lib/group-features.ts`
- Create: `src/features/spec/components/praxiom-badge.tsx`
- Create: `src/features/spec/components/spec-panel.tsx`
- Create: `tests/unit/spec/group-features.test.ts`

- [ ] **Step 15.1: Pure helper + test**

```typescript
// src/features/spec/lib/group-features.ts
import { FEATURE_STATUSES, type FeatureStatus, type SpecFeature } from "../types";

export type FeatureGroups = Record<FeatureStatus, SpecFeature[]>;

export function groupFeaturesByStatus(features: SpecFeature[]): FeatureGroups {
  const groups: FeatureGroups = {
    todo: [],
    in_progress: [],
    done: [],
    blocked: [],
  };
  for (const feature of features) {
    groups[feature.status].push(feature);
  }
  return groups;
}

export const STATUS_DISPLAY_ORDER: FeatureStatus[] = [
  "in_progress",
  "todo",
  "blocked",
  "done",
];

// Self-check: order is a permutation of FEATURE_STATUSES.
if (STATUS_DISPLAY_ORDER.length !== FEATURE_STATUSES.length) {
  throw new Error("STATUS_DISPLAY_ORDER drift");
}
```

```typescript
// tests/unit/spec/group-features.test.ts
import { describe, it, expect } from "vitest";
import {
  groupFeaturesByStatus,
  STATUS_DISPLAY_ORDER,
} from "../../../src/features/spec/lib/group-features";
import type { SpecFeature } from "../../../src/features/spec/types";

const f = (over: Partial<SpecFeature>): SpecFeature => ({
  id: "x",
  title: "x",
  description: "",
  acceptanceCriteria: [],
  status: "todo",
  priority: "p1",
  ...over,
});

describe("groupFeaturesByStatus", () => {
  it("buckets features by status preserving insertion order", () => {
    const result = groupFeaturesByStatus([
      f({ id: "1", status: "todo" }),
      f({ id: "2", status: "done" }),
      f({ id: "3", status: "todo" }),
    ]);
    expect(result.todo.map((x) => x.id)).toEqual(["1", "3"]);
    expect(result.done.map((x) => x.id)).toEqual(["2"]);
    expect(result.in_progress).toEqual([]);
    expect(result.blocked).toEqual([]);
  });

  it("display order surfaces in_progress first", () => {
    expect(STATUS_DISPLAY_ORDER[0]).toBe("in_progress");
  });
});
```

- [ ] **Step 15.2: Praxiom badge**

```tsx
// src/features/spec/components/praxiom-badge.tsx
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";

interface Props {
  praxiomDocumentId?: string;
}

export function PraxiomBadge({ praxiomDocumentId }: Props) {
  if (!praxiomDocumentId) return null; // hidden until Praxiom integration
  return (
    <a
      href={`https://praxiomai.xyz/d/${praxiomDocumentId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex"
    >
      <Badge variant="outline" className="gap-1 font-medium">
        Imported from Praxiom
        <ExternalLink className="h-3 w-3" aria-hidden />
      </Badge>
    </a>
  );
}
```

- [ ] **Step 15.3: SpecPanel**

```tsx
// src/features/spec/components/spec-panel.tsx
"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useQuery } from "convex/react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useSpec } from "../hooks/use-spec";
import { STATUS_LABEL } from "../types";
import {
  groupFeaturesByStatus,
  STATUS_DISPLAY_ORDER,
} from "../lib/group-features";
import { FeatureCard } from "./feature-card";
import { FeatureForm } from "./feature-form";
import { SpecPanelEmptyState } from "./spec-panel-empty-state";
import { PraxiomBadge } from "./praxiom-badge";
import type { SpecFeature } from "../types";

interface Props {
  projectId: Id<"projects">;
}

export function SpecPanel({ projectId }: Props) {
  const project = useQuery(api.projects.getById, { id: projectId });
  const {
    spec,
    isLoading,
    isEmpty,
    addFeature,
    updateFeature,
    removeFeature,
  } = useSpec(projectId);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editing: SpecFeature | null =
    editingId && spec ? spec.features.find((f) => f.id === editingId) ?? null : null;

  const groups = groupFeaturesByStatus(spec?.features ?? []);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      <header className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3">
        <div className="flex flex-col min-w-0">
          <span className="text-xs uppercase tracking-wide text-zinc-500">
            Spec
          </span>
          <h2 className="text-sm font-semibold truncate">
            {project?.name ?? "Untitled project"}
          </h2>
        </div>
        <PraxiomBadge praxiomDocumentId={spec?.praxiomDocumentId} />
      </header>

      {isLoading ? (
        <div className="p-4 space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : isEmpty ? (
        <SpecPanelEmptyState
          onAddFirst={() => {
            setEditingId(null);
            setFormOpen(true);
          }}
        />
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">
            {STATUS_DISPLAY_ORDER.map((status) => {
              const list = groups[status];
              if (list.length === 0) return null;
              return (
                <section key={status} className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    {STATUS_LABEL[status]} ({list.length})
                  </h3>
                  <div className="space-y-2">
                    {list.map((feature) => (
                      <FeatureCard
                        key={feature.id}
                        feature={feature}
                        onEdit={() => {
                          setEditingId(feature.id);
                          setFormOpen(true);
                        }}
                        onPatch={(patch) =>
                          updateFeature(feature.id, patch)
                        }
                        onDelete={() => removeFeature(feature.id)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {!isEmpty && (
        <footer className="p-3 border-t border-zinc-200 dark:border-zinc-800">
          <Button
            variant="outline"
            className="w-full gap-1.5"
            onClick={() => {
              setEditingId(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add feature
          </Button>
        </footer>
      )}

      <FeatureForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingId(null);
        }}
        initial={editing}
        onSubmit={async (values) => {
          if (editingId) {
            await updateFeature(editingId, values);
          } else {
            await addFeature(values);
          }
        }}
      />
    </div>
  );
}
```

- [ ] **Step 15.4: Run tests + commit**

```bash
npx vitest run tests/unit/spec/group-features.test.ts
git add src/features/spec/lib/group-features.ts \
        src/features/spec/components/praxiom-badge.tsx \
        src/features/spec/components/spec-panel.tsx \
        tests/unit/spec/group-features.test.ts
git commit -m "feat(spec): SpecPanel with grouped features and Praxiom badge stub"
```

---

## Task 16: Right-Pane Tabs Host and URL Sync

**Why now:** SpecPanel renders. The remaining job is positioning it next to PreviewPane (sub-plan 02).

**Files:**
- Create: `src/features/projects/hooks/use-right-pane-tab.ts`
- Create: `src/features/projects/components/right-pane.tsx`

- [ ] **Step 16.1: URL state hook**

```typescript
// src/features/projects/hooks/use-right-pane-tab.ts
"use client";

import { parseAsStringLiteral, useQueryState } from "nuqs";

export const RIGHT_PANE_TABS = ["preview", "spec"] as const;
export type RightPaneTab = (typeof RIGHT_PANE_TABS)[number];

export function useRightPaneTab() {
  return useQueryState(
    "rightPane",
    parseAsStringLiteral(RIGHT_PANE_TABS).withDefault("preview"),
  );
}
```

- [ ] **Step 16.2: Tabs host**

```tsx
// src/features/projects/components/right-pane.tsx
"use client";

import dynamic from "next/dynamic";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import type { Id } from "../../../../convex/_generated/dataModel";
import {
  useRightPaneTab,
  type RightPaneTab,
} from "../hooks/use-right-pane-tab";

const SpecPanel = dynamic(
  () => import("@/features/spec/components/spec-panel").then((m) => m.SpecPanel),
  { ssr: false },
);

// PreviewPane lands in sub-plan 02. Until then, render a stub when selected.
const PreviewPane = dynamic(
  () =>
    import("@/features/preview/components/preview-pane")
      .then((m) => m.PreviewPane)
      .catch(() => ({
        default: () => (
          <div className="h-full flex items-center justify-center text-sm text-zinc-500">
            Preview pane lands in sub-plan 02.
          </div>
        ),
      })),
  { ssr: false },
);

export function RightPane({ projectId }: { projectId: Id<"projects"> }) {
  const [tab, setTab] = useRightPaneTab();
  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as RightPaneTab)}
      className="h-full flex flex-col"
    >
      <TabsList className="rounded-none border-b border-zinc-200 dark:border-zinc-800 px-2 justify-start gap-1 bg-transparent">
        <TabsTrigger value="preview">Preview</TabsTrigger>
        <TabsTrigger value="spec">Spec</TabsTrigger>
      </TabsList>
      <TabsContent value="preview" className="flex-1 overflow-hidden">
        <PreviewPane projectId={projectId} />
      </TabsContent>
      <TabsContent value="spec" className="flex-1 overflow-hidden">
        <SpecPanel projectId={projectId} />
      </TabsContent>
    </Tabs>
  );
}
```

- [ ] **Step 16.3: Commit**

```bash
git add src/features/projects/hooks/use-right-pane-tab.ts src/features/projects/components/right-pane.tsx
git commit -m "feat(projects): right-pane Tabs host with URL search-param state"
```

---

## Task 17: Layout Integration

**Files:**
- Modify: `src/features/projects/components/project-id-layout.tsx`
- Modify: `src/app/layout.tsx` (add `NuqsAdapter` if not present)

- [ ] **Step 17.1: Wire NuqsAdapter once at the root**

If `src/app/layout.tsx` does not already wrap children in `<NuqsAdapter>`, add it next to the existing providers. nuqs requires this exactly once near the top of the tree.

```tsx
// src/app/layout.tsx (excerpt)
import { NuqsAdapter } from "nuqs/adapters/next/app";

// inside <body>:
<NuqsAdapter>{/* existing providers + children */}</NuqsAdapter>
```

- [ ] **Step 17.2: Modify the layout to host RightPane**

```tsx
// src/features/projects/components/project-id-layout.tsx
"use client";

import { Allotment } from "allotment";

import { ConversationSidebar } from "@/features/conversations/components/conversation-sidebar";
import { RightPane } from "@/features/projects/components/right-pane";

import { Navbar } from "./navbar";
import { Id } from "../../../../convex/_generated/dataModel";

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 800;
const DEFAULT_CONVERSATION_SIDEBAR_WIDTH = 360;
const DEFAULT_EDITOR_WIDTH = 720;
const DEFAULT_RIGHT_WIDTH = 420;
const MIN_RIGHT_WIDTH = 320;

export const ProjectIdLayout = ({
  children,
  projectId,
}: {
  children: React.ReactNode;
  projectId: Id<"projects">;
}) => {
  return (
    <div className="w-full h-screen flex flex-col">
      <Navbar projectId={projectId} />
      <div className="flex-1 flex overflow-hidden">
        <Allotment
          className="flex-1"
          defaultSizes={[
            DEFAULT_CONVERSATION_SIDEBAR_WIDTH,
            DEFAULT_EDITOR_WIDTH,
            DEFAULT_RIGHT_WIDTH,
          ]}
        >
          <Allotment.Pane
            snap
            minSize={MIN_SIDEBAR_WIDTH}
            maxSize={MAX_SIDEBAR_WIDTH}
            preferredSize={DEFAULT_CONVERSATION_SIDEBAR_WIDTH}
          >
            <ConversationSidebar projectId={projectId} />
          </Allotment.Pane>
          <Allotment.Pane>{children}</Allotment.Pane>
          <Allotment.Pane
            snap
            minSize={MIN_RIGHT_WIDTH}
            preferredSize={DEFAULT_RIGHT_WIDTH}
          >
            <RightPane projectId={projectId} />
          </Allotment.Pane>
        </Allotment>
      </div>
    </div>
  );
};
```

- [ ] **Step 17.3: Manual smoke**

```bash
npm run dev
```

Open a project, confirm three panes (conversation | editor | preview/spec). Click the **Spec** tab. URL becomes `?rightPane=spec`. Reload — Spec is still selected. Snap the right pane closed; it stays closed across reloads thanks to Allotment local storage.

- [ ] **Step 17.4: Commit**

```bash
git add src/features/projects/components/project-id-layout.tsx src/app/layout.tsx
git commit -m "feat(layout): add right pane with Preview/Spec tabs"
```

---

## Task 18: Component Tests — `StatusBadge`, `FeatureForm`

**Files:**
- Create: `tests/unit/spec/status-badge.test.tsx`
- Create: `tests/unit/spec/feature-form.test.tsx`
- Create: `tests/unit/spec/feature-form-schema.test.ts`

- [ ] **Step 18.1: StatusBadge rendering**

```tsx
// tests/unit/spec/status-badge.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { StatusBadge } from "../../../src/features/spec/components/status-badge";
import { FEATURE_STATUSES } from "../../../src/features/spec/types";

describe("StatusBadge", () => {
  it.each(FEATURE_STATUSES)("renders label for %s", (status) => {
    render(<StatusBadge status={status} readOnly />);
    expect(screen.getByText(/Todo|In progress|Done|Blocked/i)).toBeInTheDocument();
  });

  it("calls onChange when picking a new status", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StatusBadge status="todo" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /change status/i }));
    await user.click(screen.getByRole("menuitem", { name: /done/i }));

    expect(onChange).toHaveBeenCalledWith("done");
  });
});
```

- [ ] **Step 18.2: Schema tests**

```typescript
// tests/unit/spec/feature-form-schema.test.ts
import { describe, expect, it } from "vitest";
import { featureFormSchema } from "../../../src/features/spec/lib/feature-form-schema";

describe("featureFormSchema", () => {
  it("requires title", () => {
    const r = featureFormSchema.safeParse({
      title: "",
      description: "",
      acceptanceCriteria: [],
      status: "todo",
      priority: "p1",
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty criterion rows", () => {
    const r = featureFormSchema.safeParse({
      title: "x",
      description: "",
      acceptanceCriteria: [""],
      status: "todo",
      priority: "p1",
    });
    expect(r.success).toBe(false);
  });

  it("accepts a fully valid spec", () => {
    const r = featureFormSchema.safeParse({
      title: "Login",
      description: "Users sign in",
      acceptanceCriteria: ["Sees Google button"],
      status: "in_progress",
      priority: "p0",
    });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 18.3: FeatureForm interaction test**

```tsx
// tests/unit/spec/feature-form.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { FeatureForm } from "../../../src/features/spec/components/feature-form";

describe("FeatureForm", () => {
  it("blocks submission when title missing and shows an error", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <FeatureForm open onOpenChange={() => {}} onSubmit={onSubmit} />,
    );

    await user.click(screen.getByRole("button", { name: /add feature/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/title is required/i);
  });

  it("submits trimmed values for a valid feature", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <FeatureForm open onOpenChange={() => {}} onSubmit={onSubmit} />,
    );

    await user.type(screen.getByLabelText(/title/i), "Login");
    await user.type(
      screen.getByLabelText(/description/i),
      "Users sign in via Google.",
    );
    await user.click(screen.getByRole("button", { name: /add feature/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Login", status: "todo", priority: "p1" }),
    );
  });

  it("hydrates existing values when editing", () => {
    render(
      <FeatureForm
        open
        onOpenChange={() => {}}
        onSubmit={() => {}}
        initial={{
          id: "abc",
          title: "Existing",
          description: "",
          acceptanceCriteria: [],
          status: "blocked",
          priority: "p0",
        }}
      />,
    );
    expect(screen.getByDisplayValue("Existing")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /edit feature/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 18.4: Run + commit**

```bash
npx vitest run tests/unit/spec
git add tests/unit/spec
git commit -m "test(spec): StatusBadge, FeatureForm, schema"
```

---

## Task 19: End-to-End Smoke Test

**Why manual:** Playwright lives in sub-plan 09. We exercise the full path manually with the dev server.

- [ ] **Step 19.1: Boot the stack**

```bash
npx convex dev &
npm run dev
```

- [ ] **Step 19.2: Empty-state path**

1. Open a brand-new project.
2. Click the **Spec** tab in the right pane.
3. Confirm the empty state shows "Describe what you're building" copy.
4. Click "Add your first feature".
5. Submit a feature. The Sheet closes. The empty state is replaced with the grouped list.

- [ ] **Step 19.3: Edit / status / reorder**

1. Click the pencil on a feature card. Edit the title. Save. The card updates instantly (optimistic).
2. Click the status badge. Change to "In progress". The card moves to the In progress section without flicker.
3. Drag a criterion in the form between two others. Save. The new order persists across reload.

- [ ] **Step 19.4: Delete and Praxiom badge**

1. Click the trash icon. Confirm. The card disappears.
2. (Manual DB) In the Convex dashboard, set `praxiomDocumentId = "doc_test"` on the spec row. Reload — the "Imported from Praxiom" badge appears in the panel header. Set it back to undefined; the badge disappears.

- [ ] **Step 19.5: URL persistence**

1. Switch to the Spec tab. Reload. Tab is still Spec. URL contains `?rightPane=spec`.
2. Switch back to Preview. Reload. Tab is Preview.

- [ ] **Step 19.6: Permissions**

Log in as a different user, navigate directly to the project URL. The Convex query rejects with the ownership error and the panel shows the Convex error boundary.

- [ ] **Step 19.7: No commit**

This is a verification task only.

---

## Task 20: Documentation and Final Sweep

**Files:**
- Modify: `README.md` (Spec panel feature line under "What ships in v1")

- [ ] **Step 20.1: README addendum**

Add a sentence to the v1 feature list:

> Spec panel — first-class feature list with status, priority, acceptance criteria, and a Praxiom integration hook ready for §18.4.

- [ ] **Step 20.2: Run the full test suite**

```bash
npm run typecheck
npm run test:unit
```

Both green.

- [ ] **Step 20.3: Spot-check Constitution conformance**

- [ ] §11.2 — `specs` table fields match exactly (no extra columns).
- [ ] §18.4 — schema has `praxiomDocumentId` *and* the badge is hidden by default *and* the import endpoint is intentionally **not** added here (sub-plan 09 covers it as a 501 stub).
- [ ] §1.1 mission language — "Specs help the AI stay on track" appears in the empty state and Sheet description.
- [ ] §2.2 first-class — Spec is a peer tab to Preview, not buried in a drawer.

- [ ] **Step 20.4: Commit**

```bash
git add README.md
git commit -m "docs: note spec panel in v1 feature list"
```

---

## Self-Review Checklist

Before marking this sub-plan complete, verify:

- [ ] All 20 tasks have green commits
- [ ] `npm run test:unit` passes (Convex specs + group helper + schema + StatusBadge + FeatureForm)
- [ ] `npm run typecheck` passes
- [ ] Manual end-to-end smoke test passes (Task 19)
- [ ] No `// TODO` placeholders remain in spec-panel code
- [ ] Convex schema includes `specs` with `by_project` index, exactly per §11.2
- [ ] Every mutation in `convex/specs.ts` calls `assertOwnsProject` first
- [ ] Optimistic updates are wired on add / update / remove / reorder
- [ ] `?rightPane=spec` survives reload
- [ ] Praxiom badge is hidden when `praxiomDocumentId` is undefined
- [ ] No imports from `convex/_generated/api` outside `src/features/spec/hooks/use-spec.ts` and the panel itself (keeps the Convex coupling local)
- [ ] CONSTITUTION conformance: re-read Articles I §1.1, II §2.2, XI §11.2, XVIII; spot-check copy + fields

---

## Deferred to Sub-Plan 02 (E2B Sandbox + Preview)

The Preview tab content is owned by sub-plan 02. This sub-plan ships a `dynamic()` import with a graceful fallback so the Spec tab is reviewable in isolation. When sub-plan 02 lands, the fallback resolves to the real `<PreviewPane />` and no changes here are needed.

## Deferred to Sub-Plan 04 (Conversation Polish)

The agent's ability to *write to the spec* via a `update_spec` tool is sub-plan 04 / a later iteration. Today, only humans mutate `specs`. The schema and mutations are already designed so an `agent` `updatedBy` value is legal — when the tool is added, the agent simply calls the same mutations with `updatedBy: "agent"`.

## Deferred to Sub-Plan 09 (Hardening)

- The `/api/praxiom/import` 501 stub endpoint (§18.4 minimum surface).
- Playwright e2e covering the spec panel.
- Sentry breadcrumbs around mutation failures.
- Rate limiting on `addFeature` (right now a script could pump features unbounded).
