/**
 * Scenario 07 — Image-to-UI (vision input).
 *
 * Tests Phase D (image attachments → planner). The user pastes a
 * Stripe-style invoice screenshot and asks for a layout match. The
 * eval asserts on structural elements (header, line-items table,
 * total row, action button) — looser than pixel diff because the
 * agent has freedom on visual style, but tight on layout primitives.
 *
 * Note: the screenshot reference image lives at
 *   tests/eval/v2/fixtures/invoice-reference.png
 * checked in as a tracked binary. The runner passes it as an image
 * attachment via scenario.attachments[].
 */

import type { RealEvalScenario } from "../types"
import { expect } from "@playwright/test"

export const SCENARIO_07: RealEvalScenario = {
  id: "07-image-to-ui",
  title: "Build invoice page from a reference screenshot",
  prompt: `Build this invoice layout as a /invoice page. Match the
overall structure: header with company name + invoice number, customer
info row, line-items table (description / quantity / unit price /
amount), subtotal and total rows, and a primary "Pay invoice" button.
Visual styling can be your interpretation — I care about the layout
matching.`,
  attachments: [
    { kind: "image", pngPath: "tests/eval/v2/fixtures/invoice-reference.png" },
  ],
  budget: {
    maxIterations: 80,
    maxTokens: 400_000,
    maxWallClockMs: 30 * 60_000,
  },
  postBuild: [
    {
      id: "invoice-page-renders",
      description: "/invoice renders without errors",
      run: async (page, { url, screenshot }) => {
        const response = await page.goto(url("/invoice"), { waitUntil: "networkidle" })
        expect(response?.status() ?? 0).toBeLessThan(400)
        await screenshot("invoice-desktop", { fullPage: true })
      },
    },
    {
      id: "has-line-items-table",
      description: "Page contains a table with line items",
      run: async (page, { url }) => {
        await page.goto(url("/invoice"), { waitUntil: "networkidle" })
        const tableCount = await page.locator("table, [role='table']").count()
        expect(tableCount).toBeGreaterThanOrEqual(1)
      },
    },
    {
      id: "has-total-row",
      description: "Page contains a total/subtotal row",
      run: async (page, { url }) => {
        await page.goto(url("/invoice"), { waitUntil: "networkidle" })
        const text = await page.locator("body").innerText()
        expect(text.toLowerCase()).toMatch(/total|subtotal|amount due/)
      },
    },
    {
      id: "has-pay-button",
      description: "Page contains a Pay-invoice button",
      run: async (page, { url }) => {
        await page.goto(url("/invoice"), { waitUntil: "networkidle" })
        const buttons = page.locator(
          'button:has-text("Pay"), a:has-text("Pay"), button:has-text("Submit")',
        )
        await expect(buttons.first()).toBeVisible({ timeout: 5_000 })
      },
    },
  ],
}
