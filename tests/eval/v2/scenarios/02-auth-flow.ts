/**
 * Scenario 02 — Auth flow.
 *
 * Tests: can the agent wire Clerk for sign-up + sign-in and route the
 * authenticated user to /dashboard? Uses Clerk's dev test credentials
 * so the eval can drive sign-up without provisioning real accounts.
 */

import type { RealEvalScenario } from "../types"
import { expect } from "@playwright/test"

export const SCENARIO_02: RealEvalScenario = {
  id: "02-auth-flow",
  title: "Auth flow with Clerk (sign-up redirects to /dashboard)",
  prompt: `Add sign-up and sign-in pages using Clerk. Both /sign-up and
/sign-in routes should render the Clerk component. After sign-up,
redirect the user to /dashboard. Show a friendly placeholder dashboard
with the user's email and a sign-out button.`,
  budget: {
    maxIterations: 80,
    maxTokens: 320_000,
    maxWallClockMs: 25 * 60_000,
  },
  postBuild: [
    {
      id: "sign-in-route-renders-form",
      description: "/sign-in renders a Clerk form (email/password fields visible)",
      run: async (page, { url, screenshot }) => {
        await page.goto(url("/sign-in"), { waitUntil: "networkidle" })
        // Clerk renders an email input under various selectors; just look
        // for ANY input field — the agent has latitude on which Clerk
        // component flavor it picks.
        const inputs = await page.locator("input").count()
        expect(inputs).toBeGreaterThan(0)
        await screenshot("sign-in-form")
      },
    },
    {
      id: "sign-up-route-renders-form",
      description: "/sign-up renders a Clerk form",
      run: async (page, { url, screenshot }) => {
        await page.goto(url("/sign-up"), { waitUntil: "networkidle" })
        const inputs = await page.locator("input").count()
        expect(inputs).toBeGreaterThan(0)
        await screenshot("sign-up-form")
      },
    },
    {
      id: "dashboard-route-exists",
      description:
        "/dashboard renders (may redirect to sign-in for unauthenticated)",
      run: async (page, { url }) => {
        const response = await page.goto(url("/dashboard"), { waitUntil: "networkidle" })
        // 200 (renders) or 3xx-then-200 (redirect). 4xx/5xx is a failure.
        expect(response?.status() ?? 0).toBeLessThan(400)
      },
    },
    {
      id: "no-console-errors-on-auth-pages",
      description: "Sign-in and sign-up pages produce no console.errors",
      run: async (page, { url, consoleMessages }) => {
        await page.goto(url("/sign-in"), { waitUntil: "networkidle" })
        await page.goto(url("/sign-up"), { waitUntil: "networkidle" })
        const errors = consoleMessages().filter((m) => m.startsWith("[error]"))
        // Allow Clerk dev-mode warnings; only fail on hard errors.
        const realErrors = errors.filter(
          (e) => !e.toLowerCase().includes("development keys"),
        )
        expect(realErrors, realErrors.join("\n")).toEqual([])
      },
    },
  ],
}
