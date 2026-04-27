/**
 * E2E: import a public GitHub repo via the dashboard.
 * CONSTITUTION §16.3.
 *
 * Required env: CLERK_TESTING_TOKEN, E2E_GITHUB_TEST_REPO
 */

import { test, expect } from "@playwright/test"
import { authenticatedPage, hasClerkTestEnv } from "./_helpers/clerk-auth"

test("import a public GitHub repo creates a project with files", async ({ browser }) => {
  const repo = process.env.E2E_GITHUB_TEST_REPO
  if (!hasClerkTestEnv() || !repo) {
    test.skip(true, "CLERK_TESTING_TOKEN or E2E_GITHUB_TEST_REPO not set")
    return
  }
  const page = await authenticatedPage(browser)

  await page.goto("/dashboard")
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+i" : "Control+i",
  )

  await page.getByPlaceholder(/owner\/repo|github.com/i).fill(repo)
  await page.getByRole("button", { name: /Import/i }).click()

  await expect(page).toHaveURL(/\/projects\/.+/, { timeout: 60_000 })
  await expect(page.getByText(/Explorer/i)).toBeVisible({ timeout: 15_000 })
})
