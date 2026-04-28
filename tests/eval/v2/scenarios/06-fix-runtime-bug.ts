/**
 * Scenario 06 — Fix a runtime bug from a pre-seeded broken project.
 *
 * Tests: the agent's ability to consume runtime errors (D-046 auto-inject)
 * and the read_runtime_errors tool (D-045) to diagnose what's wrong
 * without the user spelling out the cause.
 *
 * Pre-seed: a deliberately broken Add-to-Cart button whose click
 * handler reads `cart.count` on an undefined object.
 */

import type { RealEvalScenario } from "../types"
import { expect } from "@playwright/test"

const BROKEN_PAGE = `"use client"

import { useState } from "react"

export default function ProductsPage() {
  const [cart, setCart] = useState<{ count: number } | null>(null)

  return (
    <main className="p-8">
      <h1>Products</h1>
      <button
        type="button"
        onClick={() => {
          // BUG: reads .count on the null initial state without guard.
          // Clicking will throw: "Cannot read properties of null (reading 'count')"
          const next = cart.count + 1
          setCart({ count: next })
        }}
      >
        Add to Cart
      </button>
      <p>In cart: {cart?.count ?? 0}</p>
    </main>
  )
}
`

export const SCENARIO_06: RealEvalScenario = {
  id: "06-fix-runtime-bug",
  title: "Fix a runtime bug given the seeded broken state",
  prompt: `The Add-to-Cart button on /products doesn't work. When I click
it, the page just freezes or throws. Please fix it. Don't change the
file structure — just fix the bug.`,
  preSeed: {
    "src/app/products/page.tsx": BROKEN_PAGE,
  },
  budget: {
    maxIterations: 50,
    maxTokens: 200_000,
    maxWallClockMs: 20 * 60_000,
  },
  postBuild: [
    {
      id: "click-no-longer-throws",
      description: "Clicking Add-to-Cart does not produce a console error",
      run: async (page, { url, consoleMessages }) => {
        await page.goto(url("/products"), { waitUntil: "networkidle" })
        const before = consoleMessages().length
        await page.locator('button:has-text("Add to Cart")').first().click()
        await page.waitForTimeout(300)
        const newMessages = consoleMessages().slice(before)
        const errors = newMessages.filter((m) => m.startsWith("[error]"))
        expect(errors, errors.join("\n")).toEqual([])
      },
    },
    {
      id: "click-increments-counter",
      description: "Clicking Add-to-Cart increments the counter",
      run: async (page, { url, screenshot }) => {
        await page.goto(url("/products"), { waitUntil: "networkidle" })
        const before = await page.locator("body").innerText()
        await page.locator('button:has-text("Add to Cart")').first().click()
        await page.waitForTimeout(200)
        const after = await page.locator("body").innerText()
        // We don't assert exact text — the agent has freedom on UX.
        // Just confirm SOMETHING changed and the counter went up.
        expect(after).not.toBe(before)
        expect(after).toMatch(/cart[^0-9]*[1-9]|[1-9][^0-9]*cart|in cart[^0-9]*[1-9]/i)
        await screenshot("after-fix")
      },
    },
  ],
}
