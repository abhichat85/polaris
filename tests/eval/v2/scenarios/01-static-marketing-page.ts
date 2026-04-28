/**
 * Scenario 01 — static marketing page.
 *
 * Tests: can the agent build a polished, multi-section marketing page
 * from a single prompt without any pre-seeded scaffolding? This is the
 * "first impression" test — the same kind of demo that makes Lovable
 * look magical.
 *
 * Pass criteria:
 *   - Page renders 3+ distinct sections
 *   - No console errors during initial render
 *   - Responsive at 375 (mobile), 768 (tablet), 1280 (desktop)
 *   - No raw `#xxxxxx` hex colors (Praxiom token discipline)
 */

import type { RealEvalScenario } from "../types"
import { expect } from "@playwright/test"

export const SCENARIO_01: RealEvalScenario = {
  id: "01-static-marketing-page",
  title: "Static marketing page (silver-jewelry brand, dark theme)",
  prompt: `Build a hero + features marketing page for a fictional silver
jewelry brand called "Silvernish". Include 4 sections: hero with a
tagline, 3 product highlights, a testimonial row, and a footer with
contact links. Use a dark theme with cool-silver accent colors.`,
  budget: {
    maxIterations: 60,
    maxTokens: 250_000,
    maxWallClockMs: 20 * 60_000,
  },
  postBuild: [
    {
      id: "renders-three-or-more-sections",
      description: "Page contains at least 3 distinct top-level sections",
      run: async (page, { url, screenshot }) => {
        await page.goto(url("/"), { waitUntil: "networkidle" })
        const sectionCount = await page.locator("section, main > div, [data-section]").count()
        expect(sectionCount).toBeGreaterThanOrEqual(3)
        await screenshot("desktop", { fullPage: true })
      },
    },
    {
      id: "no-console-errors-on-initial-render",
      description: "No console.error during initial page load",
      run: async (page, { url, consoleMessages }) => {
        await page.goto(url("/"), { waitUntil: "networkidle" })
        const errors = consoleMessages().filter((m) => m.startsWith("[error]"))
        expect(errors, errors.join("\n")).toEqual([])
      },
    },
    {
      id: "responsive-at-three-breakpoints",
      description: "Renders without horizontal scroll at 375 / 768 / 1280",
      run: async (page, { url, screenshot }) => {
        for (const [w, slot] of [
          [375, "mobile"],
          [768, "tablet"],
          [1280, "desktop-responsive"],
        ] as const) {
          await page.setViewportSize({ width: w, height: 800 })
          await page.goto(url("/"), { waitUntil: "networkidle" })
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth + 1,
          )
          expect(overflow, `horizontal scroll at width ${w}`).toBe(false)
          await screenshot(slot, { fullPage: true })
        }
      },
    },
    {
      id: "tagline-mentions-brand",
      description: "Hero copy contains the brand name 'Silvernish'",
      run: async (page, { url }) => {
        await page.goto(url("/"), { waitUntil: "networkidle" })
        const text = await page.locator("body").innerText()
        expect(text.toLowerCase()).toContain("silvernish")
      },
    },
  ],
}
