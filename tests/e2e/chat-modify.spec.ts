/**
 * E2E: open an existing project, send a chat instruction, agent writes
 * a file change visible in the editor.
 *
 * CONSTITUTION §16.3. Marked `fixme` until test fixtures (a seeded
 * project owned by the E2E user) and a deterministic agent stub are
 * available.
 */

import { test, expect } from "@playwright/test"

test.fixme(
  "chat instruction modifies a file in the open project",
  async ({ page }) => {
    const projectId = process.env.E2E_TEST_PROJECT_ID
    if (!projectId) {
      test.skip(true, "E2E_TEST_PROJECT_ID not set")
      return
    }

    await page.goto(`/projects/${projectId}`)
    // Wait for editor + agent panes.
    await expect(page.getByText(/Agent/i).first()).toBeVisible({ timeout: 15_000 })

    // Send a deterministic edit instruction.
    const input = page.getByPlaceholder(/Ask Polaris/i)
    await input.fill("Rename the variable `Counter` to `Tally` in App.tsx.")
    await input.press("Enter")

    // Streaming-status indicator within 3s, completion within 60s.
    await expect(page.getByText(/Counter|Tally/i).first()).toBeVisible({
      timeout: 60_000,
    })
  },
)
