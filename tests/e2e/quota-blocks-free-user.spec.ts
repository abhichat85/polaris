/**
 * E2E: free-tier user at quota cap gets 429 from /api/messages.
 * CONSTITUTION §17.2 + §16.3.
 *
 * Required env: CLERK_TESTING_TOKEN, E2E_FREE_USER_TOKEN,
 *               E2E_FREE_CONVERSATION_ID
 *
 * The test user must be pre-seeded with a usage row at the monthly cap;
 * a Convex seed script (`scripts/seed-quota-test-user.ts`) is the
 * canonical way to do that — it uses `usage:increment` to bump the
 * counter to exactly `plans:free.monthlyTokenLimit`.
 */

import { test, expect } from "@playwright/test"

test("free-tier user over monthly token cap gets 429 with upgrade payload", async ({
  request,
}) => {
  const token = process.env.E2E_FREE_USER_TOKEN
  const conversationId = process.env.E2E_FREE_CONVERSATION_ID
  if (!token || !conversationId) {
    test.skip(true, "E2E_FREE_USER_TOKEN or E2E_FREE_CONVERSATION_ID not set")
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
})
