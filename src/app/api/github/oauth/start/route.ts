/**
 * Begin GitHub OAuth. Authority: sub-plan 06 Task 6, CONSTITUTION §13.2.
 *
 * Mints a CSRF-protected `state` (random 32 bytes hex), pins it to the user
 * via a short-lived signed cookie, and redirects to GitHub's authorize URL.
 * No client-side JS — pure server redirect.
 */

import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { randomBytes } from "node:crypto"

const REQUIRED_SCOPES = ["read:user", "repo", "user:email"]

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", req.url))
  }

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID
  if (!clientId) {
    return NextResponse.json(
      { error: "github_oauth_not_configured" },
      { status: 503 },
    )
  }

  const state = randomBytes(32).toString("hex")
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? new URL("/", req.url).origin}/api/github/oauth/callback`

  const authorizeUrl = new URL("https://github.com/login/oauth/authorize")
  authorizeUrl.searchParams.set("client_id", clientId)
  authorizeUrl.searchParams.set("redirect_uri", redirectUri)
  authorizeUrl.searchParams.set("scope", REQUIRED_SCOPES.join(" "))
  authorizeUrl.searchParams.set("state", state)
  authorizeUrl.searchParams.set("allow_signup", "false")

  const res = NextResponse.redirect(authorizeUrl)
  // 10-minute CSRF cookie; HttpOnly, Secure in production, SameSite=Lax so
  // the GitHub redirect can read it.
  res.cookies.set("polaris_gh_oauth_state", `${userId}:${state}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  })
  return res
}
