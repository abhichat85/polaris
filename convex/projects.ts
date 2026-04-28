import { v } from "convex/values";

import { mutation, query, type QueryCtx } from "./_generated/server";
import { verifyAuth } from "./auth";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * D-020 — resolve the workspaceId scope for a request:
 *   - explicit `workspaceId` arg wins (caller chose); validate membership
 *   - else fall back to the user's "current" workspace (first owned, else
 *     first member-of). May return null for legacy users with no workspace
 *     yet — in that case we silently fall back to ownerId-only filtering.
 */
async function resolveScope(
  ctx: QueryCtx,
  userId: string,
  explicit: Id<"workspaces"> | undefined,
): Promise<{ workspaceId: Id<"workspaces"> | null }> {
  if (explicit) {
    const member = await ctx.db
      .query("workspace_members")
      .withIndex("by_user_workspace", (q) =>
        q.eq("userId", userId).eq("workspaceId", explicit),
      )
      .first()
    if (!member) throw new Error("Not a member of this workspace")
    return { workspaceId: explicit }
  }
  // Default: first-owned, else first membership.
  const owned = await ctx.db
    .query("workspaces")
    .withIndex("by_owner", (q) => q.eq("ownerId", userId))
    .first()
  if (owned) return { workspaceId: owned._id }
  const membership = await ctx.db
    .query("workspace_members")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first()
  return { workspaceId: membership?.workspaceId ?? null }
}

export const create = mutation({
  args: {
    name: v.string(),
    /** D-020 — optional workspaceId; defaults to caller's current workspace. */
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args): Promise<Id<"projects">> => {
    const identity = await verifyAuth(ctx);
    // resolveScope re-uses QueryCtx-shape methods — db.query is available
    // on MutationCtx as well, so the cast is safe.
    const scope = await resolveScope(ctx as unknown as QueryCtx, identity.subject, args.workspaceId);

    // D-020 — every NEW project must belong to a workspace. New users get
    // one auto-created via the Clerk webhook (`workspaces.createPersonal`),
    // so this should only ever fail for legacy users who never re-signed
    // in after the migration was deployed; in that case we auto-bootstrap
    // their personal workspace inline before inserting the project.
    let workspaceId = scope.workspaceId;
    if (!workspaceId) {
      // Inline bootstrap — same shape as createPersonal, scoped to this
      // mutation's transaction so we never see a partial state.
      const slugBase = `personal-${identity.subject.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toLowerCase()}`;
      let slug = slugBase;
      let n = 1;
      while (true) {
        const taken = await ctx.db
          .query("workspaces")
          .withIndex("by_slug", (q) => q.eq("slug", slug))
          .first();
        if (!taken) break;
        n += 1;
        slug = `${slugBase}-${n}`;
        if (n > 50) throw new Error("Could not allocate slug");
      }
      const customer = await ctx.db
        .query("customers")
        .withIndex("by_user", (q) => q.eq("userId", identity.subject))
        .unique();
      const plan = customer?.plan ?? "free";
      const now = Date.now();
      workspaceId = await ctx.db.insert("workspaces", {
        name: "Personal workspace",
        slug,
        ownerId: identity.subject,
        plan,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("workspace_members", {
        workspaceId,
        userId: identity.subject,
        role: "owner",
        joinedAt: now,
      });
    }

    const projectId = await ctx.db.insert("projects", {
      name: args.name,
      ownerId: identity.subject,
      workspaceId,
      updatedAt: Date.now(),
    });

    return projectId;
  },
});

export const getPartial = query({
  args: {
    limit: v.number(),
    /** D-020 — when supplied, filter to that workspace. */
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args): Promise<Doc<"projects">[]> => {
    const identity = await verifyAuth(ctx);
    const scope = await resolveScope(ctx, identity.subject, args.workspaceId);

    if (scope.workspaceId) {
      // Scoped path — return all projects in the workspace the user can access.
      const all = await ctx.db
        .query("projects")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", scope.workspaceId!))
        .order("desc")
        .take(args.limit);
      return all;
    }
    // Legacy fallback — unscoped users still see their owned projects.
    return await ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("ownerId", identity.subject))
      .order("desc")
      .take(args.limit);
  },
});

export const get = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args): Promise<Doc<"projects">[]> => {
    const identity = await verifyAuth(ctx);
    const scope = await resolveScope(ctx, identity.subject, args.workspaceId);

    if (scope.workspaceId) {
      return await ctx.db
        .query("projects")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", scope.workspaceId!))
        .order("desc")
        .collect();
    }
    return await ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("ownerId", identity.subject))
      .order("desc")
      .collect();
  },
});

export const getById = query({
  args: {
    id: v.id("projects")
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    const project = await ctx.db.get("projects", args.id);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project");
    }

    return project;
  },
});

export const rename = mutation({
  args: {
    id: v.id("projects"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    const project = await ctx.db.get("projects", args.id);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project");
    }

    await ctx.db.patch("projects", args.id, {
      name: args.name,
      updatedAt: Date.now(),
    });
  },
});

export const updateExportStatus = mutation({
  args: {
    id: v.id("projects"),
    status: v.union(
      v.literal("exporting"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);
    const project = await ctx.db.get("projects", args.id);
    if (!project) throw new Error("Project not found");
    // Internal mutations (called by Inngest via admin key) might not have identity?
    // But verifyAuth requires it.
    // If called from Inngest, we usually simulate a user or skip auth if using internal mutation.
    // For now, let's assume Inngest calls this with a user token context or we make it internal.
    // If we make it internal, we don't export it here, or we use `internalMutation`.

    // For simplicity, let's assume the user calls "start export" (status=exporting).
    // The background job needs to set status=completed.
    // Background job runs without user session usually.
    // So we need an `internalMutation` for the background job.

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch("projects", args.id, {
      exportStatus: args.status,
    });
  },
});
// ── Verification settings (D-038) ───────────────────────────────────────────
// Per-project overrides for the agent verification loop (D-036, D-037).
// Settings are sparse: any field omitted falls through to the tier default
// resolved by agent-loop.ts at run start (Free → all off, Pro/Team → all on).

export const setVerificationSettings = mutation({
  args: {
    id: v.id("projects"),
    typecheck: v.optional(v.boolean()),
    lint: v.optional(v.boolean()),
    build: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx)
    const project = await ctx.db.get(args.id)
    if (!project) throw new Error("Project not found")
    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project")
    }
    // Build a sparse update — only include fields that were passed in so
    // we never accidentally clobber an existing value with `undefined`.
    const next: { typecheck?: boolean; lint?: boolean; build?: boolean } = {}
    if (args.typecheck !== undefined) next.typecheck = args.typecheck
    if (args.lint !== undefined) next.lint = args.lint
    if (args.build !== undefined) next.build = args.build

    await ctx.db.patch(args.id, {
      verification: { ...(project.verification ?? {}), ...next },
      updatedAt: Date.now(),
    })
  },
})

export const getVerificationSettings = query({
  args: { id: v.id("projects") },
  returns: v.object({
    typecheck: v.optional(v.boolean()),
    lint: v.optional(v.boolean()),
    build: v.optional(v.boolean()),
  }),
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx)
    const project = await ctx.db.get(args.id)
    if (!project) throw new Error("Project not found")
    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project")
    }
    return project.verification ?? {}
  },
})

// ── Live context (D-044) ─────────────────────────────────────────────────────
// IDE writes activeRoute on path change; tool executor pushes recentEdits
// after each successful agent edit. The runner reads these fields at turn
// start to inject "what the user is currently looking at" (D-047).

const MAX_ACTIVE_FILES = 5
const MAX_RECENT_EDITS = 10

export const setActiveRoute = mutation({
  args: { id: v.id("projects"), route: v.string() },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx)
    const project = await ctx.db.get(args.id)
    if (!project) throw new Error("Project not found")
    if (project.ownerId !== identity.subject) throw new Error("Unauthorized")
    await ctx.db.patch(args.id, {
      activeRoute: args.route,
      updatedAt: Date.now(),
    })
  },
})

export const pushActiveFile = mutation({
  args: { id: v.id("projects"), path: v.string() },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx)
    const project = await ctx.db.get(args.id)
    if (!project) throw new Error("Project not found")
    if (project.ownerId !== identity.subject) throw new Error("Unauthorized")
    const existing = (project.activeFiles ?? []).filter((p) => p !== args.path)
    const next = [args.path, ...existing].slice(0, MAX_ACTIVE_FILES)
    await ctx.db.patch(args.id, {
      activeFiles: next,
      updatedAt: Date.now(),
    })
  },
})

export const recordRecentEditInternal = mutation({
  args: {
    internalKey: v.string(),
    id: v.id("projects"),
    path: v.string(),
    at: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const expected = process.env.POLARIS_CONVEX_INTERNAL_KEY
    if (!expected || args.internalKey !== expected) {
      throw new Error("invalid_internal_key")
    }
    const project = await ctx.db.get(args.id)
    if (!project) return
    const at = args.at ?? Date.now()
    const existing = (project.recentEdits ?? []).filter((e) => e.path !== args.path)
    const next = [{ path: args.path, at }, ...existing].slice(0, MAX_RECENT_EDITS)
    await ctx.db.patch(args.id, { recentEdits: next })
  },
})

export const getLiveContextInternal = query({
  args: { internalKey: v.string(), id: v.id("projects") },
  handler: async (ctx, args) => {
    const expected = process.env.POLARIS_CONVEX_INTERNAL_KEY
    if (!expected || args.internalKey !== expected) {
      throw new Error("invalid_internal_key")
    }
    const project = await ctx.db.get(args.id)
    if (!project) return null
    return {
      activeRoute: project.activeRoute ?? null,
      activeFiles: project.activeFiles ?? [],
      recentEdits: project.recentEdits ?? [],
    }
  },
})

// ── Internal-key-gated mutations for Inngest GitHub workflows ───────────────
// Authority: sub-plan 06 Task 11.

const validateGithubInternalKey = (key: string) => {
  const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY;
  if (!internalKey) throw new Error("POLARIS_CONVEX_INTERNAL_KEY is not configured");
  if (key !== internalKey) throw new Error("invalid_internal_key");
};

export const setImportStatusInternal = mutation({
  args: {
    internalKey: v.string(),
    id: v.id("projects"),
    status: v.union(
      v.literal("importing"),
      v.literal("completed"),
      v.literal("failed"),
    ),
  },
  handler: async (ctx, args) => {
    validateGithubInternalKey(args.internalKey);
    await ctx.db.patch(args.id, { importStatus: args.status });
  },
});

export const setExportStatusInternal = mutation({
  args: {
    internalKey: v.string(),
    id: v.id("projects"),
    status: v.union(
      v.literal("exporting"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    exportRepoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateGithubInternalKey(args.internalKey);
    const patch: { exportStatus: typeof args.status; exportRepoUrl?: string } = {
      exportStatus: args.status,
    };
    if (args.exportRepoUrl) patch.exportRepoUrl = args.exportRepoUrl;
    await ctx.db.patch(args.id, patch);
  },
});
