/**
 * E2E: trigger a deploy and capture the live URL.
 * CONSTITUTION §16.3.
 *
 * Required env: CLERK_TESTING_TOKEN, E2E_TEST_PROJECT_ID,
 *               VERCEL_TEST_TOKEN, SUPABASE_TEST_TOKEN
 */

import { test, expect } from "@playwright/test"
import { authenticatedPage, hasClerkTestEnv } from "./_helpers/clerk-auth"

test("deploy pipeline produces a live URL", async ({ browser }) => {
  const projectId = process.env.E2E_TEST_PROJECT_ID
  if (
    !hasClerkTestEnv() ||
    !projectId ||
    !process.env.VERCEL_TEST_TOKEN ||
    !process.env.SUPABASE_TEST_TOKEN
  ) {
    test.skip(true, "Deploy E2E requires Clerk + Vercel + Supabase test tokens")
    return
  }
  const page = await authenticatedPage(browser)

  await page.goto(`/projects/${projectId}`)
  await page.getByRole("button", { name: /Deploy/i }).click()

  // §14 budget: provisioning + build < 5 minutes.
  await expect(
    page.locator("a[href^='https://']").filter({ hasText: /vercel\.app/i }),
  ).toBeVisible({ timeout: 5 * 60_000 })
})
