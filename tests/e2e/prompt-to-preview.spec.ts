/**
 * E2E: hero prompt on /dashboard → project IDE with running preview.
 * CONSTITUTION §16.3 mandatory smoke test.
 *
 * Required env: CLERK_TESTING_TOKEN, E2E_CLERK_TEST_USER_ID
 * (when both unset, the test skips gracefully).
 */

import { test, expect } from "@playwright/test"
import { authenticatedPage, hasClerkTestEnv } from "./_helpers/clerk-auth"

test("submitting a prompt creates a project and reaches the IDE", async ({ browser }) => {
  if (!hasClerkTestEnv()) {
    test.skip(true, "CLERK_TESTING_TOKEN not set — staging-only smoke")
    return
  }
  const page = await authenticatedPage(browser)

  await page.goto("/dashboard")
  await expect(page.getByRole("heading", { name: /Polaris/ })).toBeVisible()

  const textarea = page.getByPlaceholder(/Describe what you want to build/i)
  await textarea.fill("A todo app with a dark indigo accent.")
  await textarea.press(
    process.platform === "darwin" ? "Meta+Enter" : "Control+Enter",
  )

  await expect(page).toHaveURL(/\/projects\/.+/, { timeout: 8_000 })

  // §14 budget — preview iframe within 90s P95.
  const previewIframe = page.frameLocator("iframe").first()
  await expect(previewIframe.locator("body")).toBeVisible({ timeout: 90_000 })
})
