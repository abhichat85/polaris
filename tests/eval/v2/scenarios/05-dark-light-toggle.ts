/**
 * Scenario 05 — Dark/light mode toggle with persistence.
 *
 * Tests: theme management, localStorage round-trip, document-level
 * class manipulation.
 */

import type { RealEvalScenario } from "../types"
import { expect } from "@playwright/test"

export const SCENARIO_05: RealEvalScenario = {
  id: "05-dark-light-toggle",
  title: "Dark/light mode toggle persisted in localStorage",
  prompt: `Add a dark/light mode toggle button in the site header. The
toggle should swap the document <html> class between "dark" and "light"
(or add/remove "dark" — whichever is the project's Tailwind convention).
Persist the chosen mode in localStorage so reloading keeps the
preference. Default to system preference on first visit.`,
  budget: {
    maxIterations: 60,
    maxTokens: 220_000,
    maxWallClockMs: 20 * 60_000,
  },
  postBuild: [
    {
      id: "toggle-button-visible-in-header",
      description: "Header contains a clickable theme toggle",
      run: async (page, { url, screenshot }) => {
        await page.goto(url("/"), { waitUntil: "networkidle" })
        // Match common labels: "theme", "dark", "light", or icons (sun/moon)
        const toggle = page
          .locator(
            'button:has-text("theme"), button:has-text("dark"), button:has-text("light"), button[aria-label*="theme" i], button[aria-label*="dark" i]',
          )
          .first()
        await expect(toggle).toBeVisible({ timeout: 10_000 })
        await screenshot("header-with-toggle")
      },
    },
    {
      id: "click-flips-html-class",
      description: "Clicking toggle changes <html> class",
      run: async (page, { url }) => {
        await page.goto(url("/"), { waitUntil: "networkidle" })
        const before = await page.evaluate(() => document.documentElement.className)
        const toggle = page
          .locator(
            'button:has-text("theme"), button:has-text("dark"), button:has-text("light"), button[aria-label*="theme" i], button[aria-label*="dark" i]',
          )
          .first()
        await toggle.click()
        await page.waitForTimeout(150)
        const after = await page.evaluate(() => document.documentElement.className)
        expect(after, `before='${before}' after='${after}'`).not.toBe(before)
      },
    },
    {
      id: "preference-persists-after-reload",
      description: "Theme preference survives a reload",
      run: async (page, { url }) => {
        await page.goto(url("/"), { waitUntil: "networkidle" })
        const toggle = page
          .locator(
            'button:has-text("theme"), button:has-text("dark"), button:has-text("light"), button[aria-label*="theme" i], button[aria-label*="dark" i]',
          )
          .first()
        await toggle.click()
        await page.waitForTimeout(150)
        const afterClick = await page.evaluate(() => document.documentElement.className)
        await page.reload({ waitUntil: "networkidle" })
        const afterReload = await page.evaluate(() => document.documentElement.className)
        expect(afterReload).toBe(afterClick)
      },
    },
  ],
}
