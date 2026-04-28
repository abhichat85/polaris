/**
 * Scenario 08 — Fullstack todo with Convex persistence.
 *
 * Tests: end-to-end fullstack — schema definition, mutations, queries,
 * UI wiring. The persistence assertion validates that Convex round-trips
 * actually work (not just the optimistic UI).
 */

import type { RealEvalScenario } from "../types"
import { expect } from "@playwright/test"

export const SCENARIO_08: RealEvalScenario = {
  id: "08-fullstack-todo",
  title: "Fullstack todo app (Convex add/toggle/delete + persist)",
  prompt: `Build a fullstack todo app at /todos using Convex:

- Convex schema: todos table with text (string), done (boolean), userId (string).
- Mutations: addTodo, toggleTodo, deleteTodo.
- Query: listTodos (returns todos for the current user, newest first).
- UI: input + Add button at the top. Below, list of todos with a
  checkbox (toggle done) and a × button (delete). Strikethrough done
  todos.
- Persistence: todos must survive a page reload.`,
  budget: {
    maxIterations: 100,
    maxTokens: 450_000,
    maxWallClockMs: 35 * 60_000,
  },
  postBuild: [
    {
      id: "todos-page-renders",
      description: "/todos page renders with input + add button",
      run: async (page, { url, screenshot }) => {
        await page.goto(url("/todos"), { waitUntil: "networkidle" })
        const input = page.locator('input[type="text"], input:not([type])').first()
        await expect(input).toBeVisible({ timeout: 10_000 })
        const addButton = page
          .locator('button:has-text("Add"), button[type="submit"]')
          .first()
        await expect(addButton).toBeVisible()
        await screenshot("empty-state")
      },
    },
    {
      id: "add-three-todos",
      description: "Adding three todos shows all three in the list",
      run: async (page, { url }) => {
        await page.goto(url("/todos"), { waitUntil: "networkidle" })
        const input = page.locator('input[type="text"], input:not([type])').first()
        const addButton = page
          .locator('button:has-text("Add"), button[type="submit"]')
          .first()

        for (const t of ["First task", "Second task", "Third task"]) {
          await input.fill(t)
          await addButton.click()
          await page.waitForTimeout(200)
        }

        const text = await page.locator("body").innerText()
        for (const t of ["First task", "Second task", "Third task"]) {
          expect(text).toContain(t)
        }
      },
    },
    {
      id: "toggle-marks-done",
      description: "Clicking checkbox marks the todo done (visual change)",
      run: async (page, { url }) => {
        await page.goto(url("/todos"), { waitUntil: "networkidle" })
        const input = page.locator('input[type="text"], input:not([type])').first()
        await input.fill("Toggle me")
        await page
          .locator('button:has-text("Add"), button[type="submit"]')
          .first()
          .click()
        await page.waitForTimeout(300)

        const checkbox = page.locator('input[type="checkbox"]').first()
        await checkbox.click()
        await page.waitForTimeout(200)
        await expect(checkbox).toBeChecked()
      },
    },
    {
      id: "todos-persist-across-reload",
      description: "Reloading preserves the todo list",
      run: async (page, { url }) => {
        await page.goto(url("/todos"), { waitUntil: "networkidle" })
        const input = page.locator('input[type="text"], input:not([type])').first()
        await input.fill("Persistent")
        await page
          .locator('button:has-text("Add"), button[type="submit"]')
          .first()
          .click()
        await page.waitForTimeout(500)
        await page.reload({ waitUntil: "networkidle" })
        const text = await page.locator("body").innerText()
        expect(text).toContain("Persistent")
      },
    },
  ],
}
