/**
 * E2E: import a public GitHub repo via the dashboard import dialog.
 *
 * CONSTITUTION §16.3. Marked `fixme` until a stable public test repo +
 * Convex test deployment are both in place.
 *
 * The test repo (small, well-known structure) is read from
 *   E2E_GITHUB_TEST_REPO  (e.g. "polarislabs/hello-next")
 * If unset, the test skips.
 */

import { test, expect } from "@playwright/test"

test.fixme(
  "import a public GitHub repo creates a project with files",
  async ({ page }) => {
    const repo = process.env.E2E_GITHUB_TEST_REPO
    if (!repo) {
      test.skip(true, "E2E_GITHUB_TEST_REPO not set")
      return
    }

    await page.goto("/dashboard")

    // Open import dialog (⌘I).
    await page.keyboard.press(
      process.platform === "darwin" ? "Meta+i" : "Control+i",
    )

    await page.getByPlaceholder(/owner\/repo|github.com/i).fill(repo)
    await page.getByRole("button", { name: /Import/i }).click()

    // Within 60s we should land in the project IDE with a non-empty file tree.
    await expect(page).toHaveURL(/\/projects\/.+/, { timeout: 60_000 })
    await expect(page.getByText(/Explorer/i)).toBeVisible({ timeout: 15_000 })
  },
)
