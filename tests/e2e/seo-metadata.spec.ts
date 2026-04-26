/**
 * SEO + metadata e2e. Authority: sub-plan 10 Task 8 + 21.
 */

import { test, expect } from "@playwright/test"

test("sitemap.xml lists the canonical pages", async ({ request }) => {
  const res = await request.get("/sitemap.xml")
  expect(res.status()).toBe(200)
  const xml = await res.text()
  for (const path of ["/pricing", "/about", "/legal/terms", "/legal/privacy"]) {
    expect(xml).toContain(path)
  }
})

test("robots.txt disallows /api and /settings", async ({ request }) => {
  const res = await request.get("/robots.txt")
  expect(res.status()).toBe(200)
  const txt = await res.text()
  expect(txt).toContain("Disallow")
  expect(txt).toMatch(/\/api\//)
  expect(txt).toMatch(/\/settings\//)
})

test("landing page has og:title meta", async ({ page }) => {
  await page.goto("/")
  const og = await page.locator('meta[property="og:title"]').getAttribute("content")
  expect(og).toBeTruthy()
})
