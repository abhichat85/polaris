/**
 * E2E: deploy an existing project to Vercel via the deploy pipeline.
 *
 * CONSTITUTION §16.3. Marked `fixme` until VERCEL_API_TOKEN test scope +
 * a sandbox Supabase project are wired into the test runner.
 *
 * Reads:
 *   E2E_TEST_PROJECT_ID — project to deploy
 */

import { test, expect } from "@playwright/test"

test.fixme(
  "deploy pipeline produces a live URL within budget",
  async ({ page }) => {
    const projectId = process.env.E2E_TEST_PROJECT_ID
    if (!projectId) {
      test.skip(true, "E2E_TEST_PROJECT_ID not set")
      return
    }

    await page.goto(`/projects/${projectId}`)

    // Trigger deploy from the UI. Surface may evolve — this selector should
    // match whatever button the IDE exposes (currently part of the rail's
    // export action; will be promoted to a dedicated Deploy affordance).
    await page.getByRole("button", { name: /Deploy/i }).click()

    // §14 budget: provisioning + build < 5 minutes.
    await expect(
      page.locator("a[href^='https://']").filter({ hasText: /vercel\.app/i }),
    ).toBeVisible({ timeout: 5 * 60_000 })
  },
)
