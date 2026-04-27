/**
 * Workspaces — multi-tenancy primitives. Authority: CONSTITUTION §11.2,
 * Decision Log D-020.
 *
 * This commit is ADDITIVE only: schema + queries/mutations + a backfill
 * migration. Project access control is NOT yet workspace-scoped — that's
 * a follow-up after the migration runs and `projects.workspaceId` is
 * verified populated.
 *
 * Slug uniqueness is enforced at write time (not by a DB constraint).
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { verifyAuth } from "./auth"
import { Doc, Id } from "./_generated/dataModel"

const roleLiteral = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("member"),
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const slugify = (name: string): string => {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
  return base || "workspace"
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Returns the current user's "default" workspace — first owned, else first
 * one they're a member of, else `null`. Settings + rail switcher both rely
 * on this never throwing for an authed user with no workspaces yet.
 */
export const getCurrent = query({
  args: {},
  handler: async (ctx): Promise<Doc<"workspaces"> | null> => {
    const identity = await verifyAuth(ctx)
    const userId = identity.subject

    // First-owned takes precedence.
    const owned = await ctx.db
      .query("workspaces")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .first()
    if (owned) return owned

    // Else first membership.
    const membership = await ctx.db
      .query("workspace_members")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first()
    if (!membership) return null

    return await ctx.db.get(membership.workspaceId)
  },
})

/**
 * All workspaces the current user can access, with their role. Used by the
 * workspace switcher.
 */
export const listForUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await verifyAuth(ctx)
    const userId = identity.subject

    const memberships = await ctx.db
      .query("workspace_members")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()

    const out: Array<Doc<"workspaces"> & { role: Doc<"workspace_members">["role"] }> =
      []
    for (const m of memberships) {
      const w = await ctx.db.get(m.workspaceId)
      if (w) out.push({ ...w, role: m.role })
    }
    return out
  },
})

/**
 * Member list for a workspace. Caller must be a member.
 */
export const listMembers = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const identity = await verifyAuth(ctx)
    const userId = identity.subject

    const isMember = await ctx.db
      .query("workspace_members")
      .withIndex("by_user_workspace", (q) =>
        q.eq("userId", userId).eq("workspaceId", workspaceId),
      )
      .first()
    if (!isMember) {
      throw new Error("Not a member of this workspace")
    }

    return await ctx.db
      .query("workspace_members")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect()
  },
})

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Create a workspace owned by the current user. Atomically inserts the
 * workspaces row and the owner membership row.
 */
export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }): Promise<Id<"workspaces">> => {
    const identity = await verifyAuth(ctx)
    const userId = identity.subject

    const trimmed = name.trim()
    if (!trimmed) throw new Error("Workspace name is required")

    // Resolve a unique slug — append -2, -3, ... on collision.
    const baseSlug = slugify(trimmed)
    let slug = baseSlug
    let suffix = 1
    while (true) {
      const existing = await ctx.db
        .query("workspaces")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .first()
      if (!existing) break
      suffix += 1
      slug = `${baseSlug}-${suffix}`
      if (suffix > 50) throw new Error("Could not allocate slug")
    }

    // Plan defaults to the user's customer plan, or "free".
    const customer = await ctx.db
      .query("customers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique()
    const plan = customer?.plan ?? "free"

    const now = Date.now()
    const workspaceId = await ctx.db.insert("workspaces", {
      name: trimmed,
      slug,
      ownerId: userId,
      plan,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert("workspace_members", {
      workspaceId,
      userId,
      role: "owner",
      joinedAt: now,
    })

    return workspaceId
  },
})

/**
 * Pre-create a membership for an invited user. Idempotent — calling twice
 * with the same (workspaceId, userId) returns the existing row.
 *
 * Sending the actual invitation email is a separate concern (Clerk).
 */
export const invite = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    role: v.union(v.literal("admin"), v.literal("member")),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx)
    const callerId = identity.subject

    const callerMembership = await ctx.db
      .query("workspace_members")
      .withIndex("by_user_workspace", (q) =>
        q.eq("userId", callerId).eq("workspaceId", args.workspaceId),
      )
      .first()
    if (!callerMembership || callerMembership.role !== "owner") {
      throw new Error("Only workspace owners can invite members")
    }

    const existing = await ctx.db
      .query("workspace_members")
      .withIndex("by_user_workspace", (q) =>
        q.eq("userId", args.userId).eq("workspaceId", args.workspaceId),
      )
      .first()
    if (existing) return existing._id

    return await ctx.db.insert("workspace_members", {
      workspaceId: args.workspaceId,
      userId: args.userId,
      role: args.role,
      joinedAt: Date.now(),
    })
  },
})

/**
 * Owner-only role update. Cannot demote the last owner.
 */
export const updateRole = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    role: roleLiteral,
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx)
    const callerId = identity.subject

    const callerMembership = await ctx.db
      .query("workspace_members")
      .withIndex("by_user_workspace", (q) =>
        q.eq("userId", callerId).eq("workspaceId", args.workspaceId),
      )
      .first()
    if (!callerMembership || callerMembership.role !== "owner") {
      throw new Error("Only workspace owners can change roles")
    }

    const target = await ctx.db
      .query("workspace_members")
      .withIndex("by_user_workspace", (q) =>
        q.eq("userId", args.userId).eq("workspaceId", args.workspaceId),
      )
      .first()
    if (!target) throw new Error("Member not found")

    // Prevent demoting the last remaining owner.
    if (target.role === "owner" && args.role !== "owner") {
      const owners = await ctx.db
        .query("workspace_members")
        .withIndex("by_workspace", (q) =>
          q.eq("workspaceId", args.workspaceId),
        )
        .filter((q) => q.eq(q.field("role"), "owner"))
        .collect()
      if (owners.length <= 1) {
        throw new Error("Cannot demote the last owner")
      }
    }

    await ctx.db.patch(target._id, { role: args.role })
    return target._id
  },
})

/**
 * Owner-only member removal. Cannot remove the last owner.
 */
export const removeMember = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx)
    const callerId = identity.subject

    const callerMembership = await ctx.db
      .query("workspace_members")
      .withIndex("by_user_workspace", (q) =>
        q.eq("userId", callerId).eq("workspaceId", args.workspaceId),
      )
      .first()
    if (!callerMembership || callerMembership.role !== "owner") {
      throw new Error("Only workspace owners can remove members")
    }

    const target = await ctx.db
      .query("workspace_members")
      .withIndex("by_user_workspace", (q) =>
        q.eq("userId", args.userId).eq("workspaceId", args.workspaceId),
      )
      .first()
    if (!target) return null

    if (target.role === "owner") {
      const owners = await ctx.db
        .query("workspace_members")
        .withIndex("by_workspace", (q) =>
          q.eq("workspaceId", args.workspaceId),
        )
        .filter((q) => q.eq(q.field("role"), "owner"))
        .collect()
      if (owners.length <= 1) {
        throw new Error("Cannot remove the last owner")
      }
    }

    await ctx.db.delete(target._id)
    return target._id
  },
})
