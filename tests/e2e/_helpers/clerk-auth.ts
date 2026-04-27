/**
 * Clerk auth helper for Playwright E2E tests.
 *
 * Authority: CONSTITUTION §16.3 — the 5 mandatory smoke specs need an
 * authenticated Clerk session. This helper uses Clerk's testing tokens
 * (https://clerk.com/docs/testing/playwright) so we never have to
 * automate the real sign-in flow.
 *
 * Required env (set in CI + local .env.test):
 *   CLERK_TESTING_TOKEN       — generated in Clerk dashboard → API keys → Testing
 *   E2E_CLERK_TEST_USER_ID    — Clerk user_id for the seeded test account
 *
 * Usage in a spec:
 *
 *   import { authenticatedPage } from "./_helpers/clerk-auth"
 *
 *   test("flow as authed user", async ({ browser }) => {
 *     const page = await authenticatedPage(browser);
 *     await page.goto("/dashboard");
 *     ...
 *   });
 */

import type { Browser, Page } from "@playwright/test"
import { setupClerkTestingToken } from "@clerk/testing/playwright"

export const E2E_CLERK_TESTING_TOKEN = "CLERK_TESTING_TOKEN"
export const E2E_CLERK_TEST_USER_ID = "E2E_CLERK_TEST_USER_ID"

export const hasClerkTestEnv = (): boolean => {
  return !!process.env[E2E_CLERK_TESTING_TOKEN]
}

/**
 * Returns a Page with the Clerk testing token preloaded. The test user
 * must be created in advance via Clerk dashboard or the Backend API.
 */
export async function authenticatedPage(browser: Browser): Promise<Page> {
  if (!hasClerkTestEnv()) {
    throw new Error(
      `Missing ${E2E_CLERK_TESTING_TOKEN} env. Generate one in the Clerk dashboard → "Testing tokens".`,
    )
  }
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await setupClerkTestingToken({ page })
  return page
}
