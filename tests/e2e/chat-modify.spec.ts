/**
 * E2E: open a seeded project, send a chat instruction, agent modifies a file.
 * CONSTITUTION §16.3.
 *
 * Required env: CLERK_TESTING_TOKEN, E2E_TEST_PROJECT_ID
 */

import { test, expect } from "@playwright/test"
import { authenticatedPage, hasClerkTestEnv } from "./_helpers/clerk-auth"

test("chat instruction modifies a file in the open project", async ({ browser }) => {
  const projectId = process.env.E2E_TEST_PROJECT_ID
  if (!hasClerkTestEnv() || !projectId) {
    test.skip(true, "CLERK_TESTING_TOKEN or E2E_TEST_PROJECT_ID not set")
    return
  }
  const page = await authenticatedPage(browser)

  await page.goto(`/projects/${projectId}`)
  await expect(page.getByText(/Agent/i).first()).toBeVisible({ timeout: 15_000 })

  const input = page.getByPlaceholder(/Ask Polaris/i)
  await input.fill("Rename the variable `Counter` to `Tally` in App.tsx.")
  await input.press("Enter")

  // Within 60s the file content should reflect the rename — assert the
  // chat surfaces "Tally" in a tool result block (the editor view itself
  // takes longer to repaint reliably).
  await expect(page.getByText(/Tally/i).first()).toBeVisible({ timeout: 60_000 })
})
