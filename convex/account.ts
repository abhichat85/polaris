/**
 * Account cascade. Authority: sub-plan 10 Task 15, CONSTITUTION §13.5.
 *
 * Deletes every Convex row owned by `userId`. Stripe + Clerk cascades happen
 * server-side after this returns (see src/app/api/gdpr/delete/route.ts).
 *
 * Idempotent — safe to retry.
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

export const exportBundle = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    // User-owned rows by ownerId/userId.
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect()
    const projectIds = projects.map((p) => p._id)

    const conversations: Array<unknown> = []
    const messages: Array<unknown> = []
    const files: Array<unknown> = []
    const specs: Array<unknown> = []
    const deployments: Array<unknown> = []
    for (const pid of projectIds) {
      const convs = await ctx.db
        .query("conversations")
        .withIndex("by_project", (q) => q.eq("projectId", pid))
        .collect()
      conversations.push(...convs)
      for (const c of convs) {
        const msgs = await ctx.db
          .query("messages")
          .withIndex("by_conversation", (q) => q.eq("conversationId", c._id))
          .collect()
        messages.push(...msgs)
      }
      const projectFiles = await ctx.db
        .query("files")
        .withIndex("by_project", (q) => q.eq("projectId", pid))
        .collect()
      files.push(...projectFiles)
      const projectSpecs = await ctx.db
        .query("specs")
        .withIndex("by_project", (q) => q.eq("projectId", pid))
        .collect()
      specs.push(...projectSpecs)
      const projectDeploys = await ctx.db
        .query("deployments")
        .withIndex("by_project", (q) => q.eq("projectId", pid))
        .collect()
      deployments.push(...projectDeploys)
    }

    const profile = await ctx.db
      .query("user_profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique()

    const integration = await ctx.db
      .query("integrations")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", userId).eq("provider", "github"),
      )
      .first()

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique()

    return {
      userId,
      exportedAt: Date.now(),
      profile,
      // OAuth tokens are deliberately stripped. They're stored encrypted and
      // we don't return ciphertext nor plaintext in user-facing exports.
      integration: integration
        ? {
            provider: integration.provider,
            accountLogin: integration.accountLogin,
            scopes: integration.scopes,
            connectedAt: integration.connectedAt,
          }
        : null,
      // Stripe identifier shown so the user can reconcile their bank statement;
      // the secret token isn't here because we never store it.
      customer: customer
        ? {
            stripeCustomerId: customer.stripeCustomerId,
            plan: customer.plan,
            subscriptionStatus: customer.subscriptionStatus,
            currentPeriodEnd: customer.currentPeriodEnd,
          }
        : null,
      projects,
      conversations,
      messages,
      files,
      specs,
      deployments,
    }
  },
})

const validateInternalKey = (key: string) => {
  const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY
  if (!internalKey) throw new Error("POLARIS_CONVEX_INTERNAL_KEY is not configured")
  if (key !== internalKey) throw new Error("invalid_internal_key")
}

export const cascadeDelete = mutation({
  args: { internalKey: v.string(), userId: v.string() },
  handler: async (ctx, { internalKey, userId }) => {
    validateInternalKey(internalKey)

    // Per-project rows first, so we don't orphan messages/files.
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect()
    const stats = {
      projects: 0,
      conversations: 0,
      messages: 0,
      files: 0,
      specs: 0,
      deployments: 0,
      checkpoints: 0,
      sandboxes: 0,
      profile: 0,
      integration: 0,
      customer: 0,
    }

    for (const p of projects) {
      const convs = await ctx.db
        .query("conversations")
        .withIndex("by_project", (q) => q.eq("projectId", p._id))
        .collect()
      for (const c of convs) {
        const msgs = await ctx.db
          .query("messages")
          .withIndex("by_conversation", (q) => q.eq("conversationId", c._id))
          .collect()
        for (const m of msgs) {
          await ctx.db.delete(m._id)
          stats.messages++

          const ckpt = await ctx.db
            .query("agent_checkpoints")
            .withIndex("by_message", (q) => q.eq("messageId", m._id))
            .first()
          if (ckpt) {
            await ctx.db.delete(ckpt._id)
            stats.checkpoints++
          }
        }
        await ctx.db.delete(c._id)
        stats.conversations++
      }

      const fs = await ctx.db
        .query("files")
        .withIndex("by_project", (q) => q.eq("projectId", p._id))
        .collect()
      for (const f of fs) {
        await ctx.db.delete(f._id)
        stats.files++
      }

      const sp = await ctx.db
        .query("specs")
        .withIndex("by_project", (q) => q.eq("projectId", p._id))
        .collect()
      for (const s of sp) {
        await ctx.db.delete(s._id)
        stats.specs++
      }

      const dp = await ctx.db
        .query("deployments")
        .withIndex("by_project", (q) => q.eq("projectId", p._id))
        .collect()
      for (const d of dp) {
        await ctx.db.delete(d._id)
        stats.deployments++
      }

      const sb = await ctx.db
        .query("sandboxes")
        .withIndex("by_project", (q) => q.eq("projectId", p._id))
        .collect()
      for (const s of sb) {
        await ctx.db.delete(s._id)
        stats.sandboxes++
      }

      await ctx.db.delete(p._id)
      stats.projects++
    }

    // User-scoped, project-independent rows.
    const profile = await ctx.db
      .query("user_profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique()
    if (profile) {
      await ctx.db.delete(profile._id)
      stats.profile = 1
    }

    const integration = await ctx.db
      .query("integrations")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", userId).eq("provider", "github"),
      )
      .first()
    if (integration) {
      await ctx.db.delete(integration._id)
      stats.integration = 1
    }

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique()
    if (customer) {
      await ctx.db.delete(customer._id)
      stats.customer = 1
    }

    return stats
  },
})
