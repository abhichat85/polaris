/**
 * Marketing site e2e. Authority: sub-plan 09 Task 18 (canonical path 1 — public).
 * Asserts the marketing surface ships without a signed-in session.
 */

import { test, expect } from "@playwright/test"

test.describe("marketing", () => {
  test("landing renders the hero and CTA", async ({ page }) => {
    await page.goto("/")
    await expect(
      page.getByRole("heading", {
        name: /from idea to running app, in one chat/i,
      }),
    ).toBeVisible()
    await expect(page.getByRole("link", { name: /start building/i })).toBeVisible()
  })

  test("pricing page lists three tiers", async ({ page }) => {
    await page.goto("/pricing")
    await expect(page.getByRole("heading", { name: /pricing/i })).toBeVisible()
    await expect(page.getByText(/free/i).first()).toBeVisible()
    await expect(page.getByText(/^pro$/i).first()).toBeVisible()
    await expect(page.getByText(/^team$/i).first()).toBeVisible()
  })

  test("status page renders", async ({ page }) => {
    await page.goto("/status")
    await expect(page.getByRole("heading", { name: /system status/i })).toBeVisible()
  })

  test("legal pages render with effective date", async ({ page }) => {
    for (const slug of ["terms", "privacy", "dpa", "cookies"]) {
      await page.goto(`/legal/${slug}`)
      await expect(page.getByText(/effective/i)).toBeVisible()
    }
  })

  test("trace id propagates back as response header", async ({ request }) => {
    const res = await request.get("/")
    expect(res.headers()["x-polaris-trace-id"]).toMatch(/^[0-9A-Z]{26}$/)
  })
})
