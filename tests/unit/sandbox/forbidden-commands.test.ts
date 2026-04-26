/**
 * CONSTITUTION §8.4 — `run_command` must reject these patterns.
 */
import { describe, it, expect } from "vitest"
import { isForbiddenCommand } from "@/lib/sandbox/forbidden-commands"

describe("isForbiddenCommand", () => {
  it("rejects sudo", () => {
    expect(isForbiddenCommand("sudo apt-get install foo")).toBe(true)
  })
  it("rejects rm -rf /", () => {
    expect(isForbiddenCommand("rm -rf /")).toBe(true)
    expect(isForbiddenCommand("rm -rf  /")).toBe(true)
    expect(isForbiddenCommand("cd / && rm -rf /")).toBe(true)
  })
  it("rejects npm/pnpm/yarn dev variations (already running)", () => {
    expect(isForbiddenCommand("npm run dev")).toBe(true)
    expect(isForbiddenCommand("pnpm run dev")).toBe(true)
    expect(isForbiddenCommand("yarn dev")).toBe(true)
    expect(isForbiddenCommand("npm  run   dev")).toBe(true)
  })
  it("allows safe commands", () => {
    expect(isForbiddenCommand("npm install lodash")).toBe(false)
    expect(isForbiddenCommand("npm test")).toBe(false)
    expect(isForbiddenCommand("npm run build")).toBe(false)
    expect(isForbiddenCommand("npm run lint")).toBe(false)
    expect(isForbiddenCommand("ls -la")).toBe(false)
    expect(isForbiddenCommand("rm -rf node_modules")).toBe(false)
  })
})
