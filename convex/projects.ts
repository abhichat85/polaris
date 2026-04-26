import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { verifyAuth } from "./auth";

export const create = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    const projectId = await ctx.db.insert("projects", {
      name: args.name,
      ownerId: identity.subject,
      updatedAt: Date.now(),
    });

    return projectId;
  },
});

export const getPartial = query({
  args: {
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    return await ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("ownerId", identity.subject))
      .order("desc")
      .take(args.limit);
  },
});

export const get = query({
  args: {},
  handler: async (ctx) => {
    const identity = await verifyAuth(ctx);

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
