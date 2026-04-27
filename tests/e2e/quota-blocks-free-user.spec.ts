/**
 * E2E: free user at quota cap gets a 429 from /api/messages.
 *
 * CONSTITUTION §17.2 + §16.3. Marked `fixme` until a test Clerk user with
 * a pre-seeded `usage` row at the cap is provisioned. The query exists
 * (api.plans.assertWithinQuotaInternal) and the route enforces it.
 *
 * Reads:
 *   E2E_FREE_USER_TOKEN  — Clerk session JWT for a user at the token cap
 *   E2E_FREE_CONVERSATION_ID  — a conversation owned by that user
 */

import { test, expect } from "@playwright/test"

test.fixme(
  "free-tier user over monthly token cap gets 429 with upgrade payload",
  async ({ request }) => {
    const token = process.env.E2E_FREE_USER_TOKEN
    const conversationId = process.env.E2E_FREE_CONVERSATION_ID
    if (!token || !conversationId) {
      test.skip(true, "Missing E2E_FREE_USER_TOKEN or E2E_FREE_CONVERSATION_ID")
      return
    }

    const res = await request.post("/api/messages", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: { conversationId, message: "hello" },
    })

    expect(res.status()).toBe(429)
    const body = await res.json()
    expect(body.error).toBe("quota_exceeded")
    expect(body.reason).toBe("monthly_tokens")
    expect(body.upgradeUrl).toBe("/pricing")
    expect(typeof body.limit).toBe("number")
    expect(typeof body.current).toBe("number")
    expect(body.current).toBeGreaterThanOrEqual(body.limit)
  },
)
