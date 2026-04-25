import { describe, it, expect } from "vitest"
import {
  SCAFFOLD_TEMPLATE_PATHS,
  isScaffoldTemplatePath,
  validateScaffoldPaths,
} from "@/features/scaffold/lib/scaffold-policy"

describe("isScaffoldTemplatePath", () => {
  it("returns true for known template-owned paths", () => {
    for (const p of SCAFFOLD_TEMPLATE_PATHS) {
      expect(isScaffoldTemplatePath(p), p).toBe(true)
    }
  })

  it("returns false for normal app code", () => {
    expect(isScaffoldTemplatePath("src/app/page.tsx")).toBe(false)
    expect(isScaffoldTemplatePath("src/components/Button.tsx")).toBe(false)
  })
})

describe("validateScaffoldPaths", () => {
  it("accepts paths in writable directories", () => {
    const result = validateScaffoldPaths([
      { path: "src/app/page.tsx", content: "x" },
      { path: "supabase/migrations/001_init.sql", content: "create table x();" },
    ])
    expect(result.ok).toBe(true)
  })

  it("accepts overrides of src/app/page.tsx (template ships a placeholder)", () => {
    const result = validateScaffoldPaths([{ path: "src/app/page.tsx", content: "x" }])
    expect(result.ok).toBe(true)
  })

  it("silently allows template paths (package.json) — merge layer overrides them", () => {
    const result = validateScaffoldPaths([{ path: "package.json", content: "{}" }])
    expect(result.ok).toBe(true)
  })

  it("silently allows template paths (next.config.ts)", () => {
    const result = validateScaffoldPaths([{ path: "next.config.ts", content: "x" }])
    expect(result.ok).toBe(true)
  })

  it("rejects writes to .github/ (locked, not a template path)", () => {
    const result = validateScaffoldPaths([
      { path: ".github/workflows/deploy.yml", content: "x" },
    ])
    expect(result.ok).toBe(false)
  })

  it("rejects writes to .env (locked, not a template path)", () => {
    const result = validateScaffoldPaths([{ path: ".env", content: "SECRET=" }])
    expect(result.ok).toBe(false)
  })

  it("rejects writes inside node_modules/", () => {
    const result = validateScaffoldPaths([
      { path: "node_modules/whatever.js", content: "x" },
    ])
    expect(result.ok).toBe(false)
  })

  it("rejects writes outside any writable directory", () => {
    const result = validateScaffoldPaths([{ path: "scripts/build.sh", content: "x" }])
    expect(result.ok).toBe(false)
  })

  it("collects all violations, not just the first", () => {
    const result = validateScaffoldPaths([
      { path: ".github/workflows/x.yml", content: "x" },
      { path: "src/app/page.tsx", content: "ok" },
      { path: "scripts/x.sh", content: "x" },
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.violations.map((v) => v.path).sort()).toEqual(
        [".github/workflows/x.yml", "scripts/x.sh"].sort(),
      )
    }
  })
})
