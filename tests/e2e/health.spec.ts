/**
 * Health endpoint e2e. Authority: sub-plan 09 Task 21, sub-plan 10 Task 17.
 */

import { test, expect } from "@playwright/test"

test("api/health returns json with checks array", async ({ request }) => {
  const res = await request.get("/api/health")
  expect([200, 503]).toContain(res.status())
  const body = await res.json()
  expect(typeof body.ok).toBe("boolean")
  expect(Array.isArray(body.checks)).toBe(true)
  expect(body.checks.length).toBeGreaterThan(0)
})
