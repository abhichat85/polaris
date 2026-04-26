/**
 * GitHub OAuth callback. Authority: sub-plan 06 Task 7, CONSTITUTION §13.2.
 *
 * 1. Verify CSRF state against the cookie set by /oauth/start.
 * 2. Exchange `code` for an access token via POST to GitHub.
 * 3. Look up the user's GitHub login + id with the new token.
 * 4. Encrypt the token and store it via internal Convex mutation.
 * 5. Redirect to /settings/integrations with a success flag.
 */

import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { Octokit } from "octokit"
import { encrypt } from "@/lib/crypto/token-encryption"
import { convex } from "@/lib/convex-client"
import { api } from "../../../../../../convex/_generated/api"

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
  error?: string
  error_description?: string
}

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", req.url))
  }

  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const stateCookie = req.cookies.get("polaris_gh_oauth_state")?.value

  if (!code || !state || !stateCookie) {
    return NextResponse.redirect(
      new URL("/settings/integrations?gh=missing_state", req.url),
    )
  }
  const [stateUserId, stateNonce] = stateCookie.split(":")
  if (stateUserId !== userId || stateNonce !== state) {
    return NextResponse.redirect(
      new URL("/settings/integrations?gh=csrf_mismatch", req.url),
    )
  }

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "github_oauth_not_configured" },
      { status: 503 },
    )
  }

  // Exchange code for token.
  let tokenJson: TokenResponse
  try {
    const resp = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    })
    tokenJson = (await resp.json()) as TokenResponse
  } catch {
    return NextResponse.redirect(
      new URL("/settings/integrations?gh=token_exchange_failed", req.url),
    )
  }

  if (!tokenJson.access_token) {
    return NextResponse.redirect(
      new URL("/settings/integrations?gh=no_token", req.url),
    )
  }

  // Look up the user's GitHub identity.
  let login = ""
  let accountId = ""
  try {
    const octokit = new Octokit({ auth: tokenJson.access_token })
    const me = await octokit.rest.users.getAuthenticated()
    login = me.data.login
    accountId = String(me.data.id)
  } catch {
    return NextResponse.redirect(
      new URL("/settings/integrations?gh=user_lookup_failed", req.url),
    )
  }

  const accessTokenEnc = encrypt(tokenJson.access_token)
  const refreshTokenEnc = tokenJson.refresh_token
    ? encrypt(tokenJson.refresh_token)
    : undefined

  await convex.mutation(api.integrations.setGithub, {
    userId,
    accountLogin: login,
    accountId,
    accessTokenEnc,
    refreshTokenEnc,
    scopes: (tokenJson.scope ?? "").split(",").filter(Boolean),
    expiresAt: tokenJson.expires_in
      ? Date.now() + tokenJson.expires_in * 1000
      : 0,
  })

  const res = NextResponse.redirect(
    new URL("/settings/integrations?gh=connected", req.url),
  )
  // Clear CSRF cookie.
  res.cookies.delete("polaris_gh_oauth_state")
  return res
}
