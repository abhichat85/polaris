/**
 * Backfill mutation: creates one personal workspace per existing project
 * owner and patches every legacy project with `workspaceId`. Run once after
 * the schema is pushed:
 *
 *   npx convex run "migrations/2026-04-create-personal-workspaces:run"
 *
 * Idempotent — re-running is a no-op.
 *
 * Authority: CONSTITUTION D-020. Adds workspaces under the existing
 * single-owner data model without breaking access (since `workspaceId`
 * stays optional until a follow-up commit makes it required).
 */

import { internalMutation } from "../_generated/server"

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allProjects = await ctx.db.query("projects").collect()

    // Distinct owners that don't yet have a personal workspace.
    const ownerIds = new Set(allProjects.map((p) => p.ownerId))

    let workspacesCreated = 0
    let projectsBackfilled = 0

    for (const ownerId of ownerIds) {
      // Skip owners that already have a workspace they own.
      const existing = await ctx.db
        .query("workspaces")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .first()

      let workspaceId = existing?._id

      if (!workspaceId) {
        // Resolve plan from customers row, default "free".
        const customer = await ctx.db
          .query("customers")
          .withIndex("by_user", (q) => q.eq("userId", ownerId))
          .unique()
        const plan = customer?.plan ?? "free"

        // Slug = first 8 chars of userId. Stable + unique enough for
        // personal workspaces (real collisions are vanishingly rare).
        const slug = `personal-${ownerId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toLowerCase()}`

        const now = Date.now()
        workspaceId = await ctx.db.insert("workspaces", {
          name: "Personal workspace",
          slug,
          ownerId,
          plan,
          createdAt: now,
          updatedAt: now,
        })
        workspacesCreated += 1

        await ctx.db.insert("workspace_members", {
          workspaceId,
          userId: ownerId,
          role: "owner",
          joinedAt: now,
        })
      }

      // Backfill projects owned by this user that don't yet have workspaceId.
      const ownedProjects = allProjects.filter(
        (p) => p.ownerId === ownerId && !p.workspaceId,
      )
      for (const p of ownedProjects) {
        await ctx.db.patch(p._id, { workspaceId })
        projectsBackfilled += 1
      }
    }

    return {
      ownersProcessed: ownerIds.size,
      workspacesCreated,
      projectsBackfilled,
    }
  },
})
