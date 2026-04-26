/**
 * GitHub integration storage. Authority: sub-plan 06 Task 4.
 *
 * `*Enc` fields hold AES-256-GCM ciphertext (see src/lib/crypto/token-encryption.ts).
 * The decrypt step lives in `getOctokitForUser()` server-only — Convex never sees
 * plaintext tokens, and queries here never return token columns to the client.
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

/**
 * Public query: returns the connection metadata WITHOUT tokens.
 * Safe to expose to authed clients — UI shows "Connected as @octocat".
 */
export const getConnection = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const row = await ctx.db
      .query("integrations")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", userId).eq("provider", "github"),
      )
      .first()
    if (!row) return null
    // Strip token columns before returning.
    return {
      _id: row._id,
      provider: row.provider,
      accountLogin: row.accountLogin,
      accountId: row.accountId,
      scopes: row.scopes,
      connectedAt: row.connectedAt,
      lastUsedAt: row.lastUsedAt,
    }
  },
})

/**
 * Server-only: fetch the encrypted token for decryption inside a server route
 * or Inngest function. Marked internal so it's not exposed in the public api.
 */
export const getEncryptedToken = mutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const row = await ctx.db
      .query("integrations")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", userId).eq("provider", "github"),
      )
      .first()
    if (!row) return null
    return {
      accessTokenEnc: row.accessTokenEnc,
      refreshTokenEnc: row.refreshTokenEnc,
      scopes: row.scopes,
      expiresAt: row.expiresAt,
    }
  },
})

/**
 * Upsert the GitHub connection after a successful OAuth callback.
 * Caller MUST encrypt the token before invoking. We never accept plaintext.
 */
export const setGithub = mutation({
  args: {
    userId: v.string(),
    accountLogin: v.string(),
    accountId: v.string(),
    accessTokenEnc: v.string(),
    refreshTokenEnc: v.optional(v.string()),
    scopes: v.array(v.string()),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("integrations")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", "github"),
      )
      .first()
    const now = Date.now()
    if (existing) {
      await ctx.db.patch(existing._id, {
        accountLogin: args.accountLogin,
        accountId: args.accountId,
        accessTokenEnc: args.accessTokenEnc,
        refreshTokenEnc: args.refreshTokenEnc,
        scopes: args.scopes,
        expiresAt: args.expiresAt,
        connectedAt: now,
      })
      return existing._id
    }
    return await ctx.db.insert("integrations", {
      userId: args.userId,
      provider: "github",
      accountLogin: args.accountLogin,
      accountId: args.accountId,
      accessTokenEnc: args.accessTokenEnc,
      refreshTokenEnc: args.refreshTokenEnc,
      scopes: args.scopes,
      expiresAt: args.expiresAt,
      connectedAt: now,
    })
  },
})

export const touchLastUsed = mutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const row = await ctx.db
      .query("integrations")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", userId).eq("provider", "github"),
      )
      .first()
    if (row) await ctx.db.patch(row._id, { lastUsedAt: Date.now() })
  },
})

export const disconnect = mutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const row = await ctx.db
      .query("integrations")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", userId).eq("provider", "github"),
      )
      .first()
    if (row) await ctx.db.delete(row._id)
  },
})
