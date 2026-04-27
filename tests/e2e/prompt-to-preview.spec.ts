/**
 * E2E: hero prompt on /dashboard → project IDE with running preview.
 *
 * CONSTITUTION §16.3 mandatory smoke test. Marked `fixme` until:
 *   1. Test Clerk session helper is wired (E2E_CLERK_TEST_USER_ID env)
 *   2. The agent backend (E2B sandbox + scaffold pipeline) is reachable
 *      from the test runner (or stubbed via Inngest dev mode).
 *
 * To run locally once the prerequisites are in place:
 *   E2E_CLERK_TEST_USER_ID=user_xxx pnpm test:e2e prompt-to-preview
 *
 * Remove the `.fixme` to re-enable.
 */

import { test, expect } from "@playwright/test"

test.fixme(
  "submitting a prompt creates a project and reaches the IDE with a preview URL",
  async ({ page }) => {
    // 1. Authenticate. Production sites use Clerk's testing tokens. Replace
    //    this with the project's preferred auth helper when wired.
    await page.goto("/sign-in")
    // TODO: sign-in via testing token; for now, this fails fast.

    // 2. Land on dashboard.
    await page.goto("/dashboard")
    await expect(page.getByRole("heading", { name: /Polaris/ })).toBeVisible()

    // 3. Type a prompt + submit (⌘↵).
    const textarea = page.getByPlaceholder(/Describe what you want to build/i)
    await textarea.fill("A todo app with a dark indigo accent.")
    await textarea.press(
      process.platform === "darwin" ? "Meta+Enter" : "Control+Enter",
    )

    // 4. We expect to be routed to /projects/<id> within 8s.
    await expect(page).toHaveURL(/\/projects\/.+/, { timeout: 8_000 })

    // 5. Within 90s, an iframe with a preview URL renders. Budget per §14.
    const previewIframe = page.frameLocator("iframe").first()
    await expect(previewIframe.locator("body")).toBeVisible({
      timeout: 90_000,
    })
  },
)
