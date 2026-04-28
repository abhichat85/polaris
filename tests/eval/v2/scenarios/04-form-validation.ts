/**
 * Scenario 04 — Contact form with validation.
 *
 * Tests: form state, inline validation messaging, success state.
 */

import type { RealEvalScenario } from "../types"
import { expect } from "@playwright/test"

export const SCENARIO_04: RealEvalScenario = {
  id: "04-form-validation",
  title: "Contact form with inline validation",
  prompt: `Add a /contact page with a contact form (name, email, message).
Validate: all three fields required; email must match a basic email
regex. On submit with errors, show inline error messages under each
field. On submit with valid input, show a success state ("Thanks, we'll
be in touch."). No backend — just client-side validation + a fake
submit handler.`,
  budget: {
    maxIterations: 70,
    maxTokens: 280_000,
    maxWallClockMs: 25 * 60_000,
  },
  postBuild: [
    {
      id: "empty-submit-shows-three-errors",
      description: "Submitting empty form shows three required-field errors",
      run: async (page, { url, screenshot }) => {
        await page.goto(url("/contact"), { waitUntil: "networkidle" })
        await page.locator('button[type="submit"], button:has-text("Submit"), button:has-text("Send")').first().click()
        const text = await page.locator("body").innerText()
        // Look for at least 3 error indicators
        const errorMatches = text.match(/required|cannot be empty|please/gi) ?? []
        expect(errorMatches.length).toBeGreaterThanOrEqual(3)
        await screenshot("empty-submit-errors")
      },
    },
    {
      id: "invalid-email-rejected",
      description: "Email field rejects 'not-an-email'",
      run: async (page, { url }) => {
        await page.goto(url("/contact"), { waitUntil: "networkidle" })
        await page.locator('input[name="name"], input[id="name"]').first().fill("Test User")
        await page.locator('input[type="email"], input[name="email"], input[id="email"]').first().fill("not-an-email")
        await page.locator('textarea, input[name="message"], input[id="message"]').first().fill("Hello")
        await page.locator('button[type="submit"], button:has-text("Submit"), button:has-text("Send")').first().click()
        const text = await page.locator("body").innerText()
        expect(text.toLowerCase()).toMatch(/email|invalid/)
      },
    },
    {
      id: "valid-submit-shows-success",
      description: "Valid input → success state visible",
      run: async (page, { url, screenshot }) => {
        await page.goto(url("/contact"), { waitUntil: "networkidle" })
        await page.locator('input[name="name"], input[id="name"]').first().fill("Test User")
        await page.locator('input[type="email"], input[name="email"], input[id="email"]').first().fill("test@example.com")
        await page.locator('textarea, input[name="message"], input[id="message"]').first().fill("Hello world")
        await page.locator('button[type="submit"], button:has-text("Submit"), button:has-text("Send")').first().click()
        await page.waitForTimeout(500)
        const text = await page.locator("body").innerText()
        expect(text.toLowerCase()).toMatch(/thanks|thank you|success|in touch|received/)
        await screenshot("success-state")
      },
    },
  ],
}
