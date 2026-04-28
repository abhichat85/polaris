/**
 * Scenario 03 — Product list with add-to-cart.
 *
 * Tests: state management + interactivity. The agent must wire a
 * mock data source, render product cards, and implement an
 * add-to-cart counter that updates the header.
 */

import type { RealEvalScenario } from "../types"
import { expect } from "@playwright/test"

export const SCENARIO_03: RealEvalScenario = {
  id: "03-product-list-cart",
  title: "Product list page with Add-to-Cart counter",
  prompt: `Build a /products page that lists 6 products from a mock data
file (src/data/products.ts) — each product has id, name, price, and
image (use placeholder.com for image urls). Each product card has an
"Add to Cart" button. The site header shows a cart count badge that
increments when the user clicks Add to Cart on any card. Use
localStorage so the count persists across reloads.`,
  budget: {
    maxIterations: 90,
    maxTokens: 350_000,
    maxWallClockMs: 30 * 60_000,
  },
  postBuild: [
    {
      id: "products-page-lists-six",
      description: "/products renders 6 product cards",
      run: async (page, { url, screenshot }) => {
        await page.goto(url("/products"), { waitUntil: "networkidle" })
        // Look for buttons containing "Add to Cart"
        const addButtons = page.locator('button:has-text("Add to Cart")')
        await expect(addButtons).toHaveCount(6, { timeout: 10_000 })
        await screenshot("products-grid", { fullPage: true })
      },
    },
    {
      id: "click-add-to-cart-increments-counter",
      description: "Clicking Add-to-Cart twice → cart count = 2",
      run: async (page, { url, screenshot }) => {
        await page.goto(url("/products"), { waitUntil: "networkidle" })
        const addButtons = page.locator('button:has-text("Add to Cart")')
        await addButtons.nth(0).click()
        await addButtons.nth(1).click()
        // Cart count badge — flexible selector. Look for ANY element
        // with text containing "2" near a "cart" label.
        const body = await page.locator("body").innerText()
        expect(body).toMatch(/cart[^0-9]*2|2[^0-9]*cart/i)
        await screenshot("after-two-adds")
      },
    },
    {
      id: "cart-persists-across-reload",
      description: "Cart count survives a page reload (localStorage)",
      run: async (page, { url }) => {
        await page.goto(url("/products"), { waitUntil: "networkidle" })
        await page.locator('button:has-text("Add to Cart")').first().click()
        await page.reload({ waitUntil: "networkidle" })
        const body = await page.locator("body").innerText()
        // Count should still be ≥ 1 after reload
        expect(body).toMatch(/cart[^0-9]*[1-9]|[1-9][^0-9]*cart/i)
      },
    },
    {
      id: "no-console-errors-on-add",
      description: "No console.error during the add-to-cart flow",
      run: async (page, { url, consoleMessages }) => {
        await page.goto(url("/products"), { waitUntil: "networkidle" })
        await page.locator('button:has-text("Add to Cart")').first().click()
        const errors = consoleMessages().filter((m) => m.startsWith("[error]"))
        expect(errors, errors.join("\n")).toEqual([])
      },
    },
  ],
}
