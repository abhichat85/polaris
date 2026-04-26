/**
 * Server-only Octokit factory. Authority: sub-plan 06 Task 5, CONSTITUTION §13.2.
 *
 * Decrypts the user's stored token JIT and constructs an Octokit instance.
 * NEVER call this from a client/edge file — `process.env` is server-only and
 * `decrypt()` reads the encryption key from there.
 */

import "server-only"
import { Octokit } from "octokit"
import { decrypt } from "@/lib/crypto/token-encryption"
import { convex as getConvexClientInstance } from "@/lib/convex-client"
const getConvexClient = () => getConvexClientInstance
import { api } from "../../../convex/_generated/api"

interface ConnectionMeta {
  accessTokenEnc: string
  refreshTokenEnc?: string
  scopes: string[]
  expiresAt: number
}

/**
 * Returns an Octokit instance authenticated with the user's GitHub token.
 * Throws if the user has never connected GitHub.
 */
export async function getOctokitForUser(userId: string): Promise<Octokit> {
  const convex = getConvexClient()
  const meta = (await convex.mutation(api.integrations.getEncryptedToken, {
    userId,
  })) as ConnectionMeta | null
  if (!meta) {
    throw new Error("github_not_connected")
  }
  const token = decrypt(meta.accessTokenEnc)
  // Touch lastUsedAt asynchronously — best-effort.
  void convex.mutation(api.integrations.touchLastUsed, { userId }).catch(() => {})
  return new Octokit({ auth: token })
}

/**
 * Returns the safe (token-stripped) connection record, or null.
 */
export async function getConnection(userId: string) {
  const convex = getConvexClient()
  return await convex.query(api.integrations.getConnection, { userId })
}
