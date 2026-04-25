import { describe, it, expect } from "vitest"
import { FilePermissionPolicy } from "@/lib/tools/file-permission-policy"

describe("FilePermissionPolicy.canWrite", () => {
  it("denies package.json", () => {
    expect(FilePermissionPolicy.canWrite("package.json")).toBe(false)
  })

  it("denies all .env variants at root", () => {
    expect(FilePermissionPolicy.canWrite(".env")).toBe(false)
    expect(FilePermissionPolicy.canWrite(".env.local")).toBe(false)
    expect(FilePermissionPolicy.canWrite(".env.production")).toBe(false)
    expect(FilePermissionPolicy.canWrite(".env.development")).toBe(false)
  })

  it("denies tsconfig.json and next.config", () => {
    expect(FilePermissionPolicy.canWrite("tsconfig.json")).toBe(false)
    expect(FilePermissionPolicy.canWrite("next.config.ts")).toBe(false)
    expect(FilePermissionPolicy.canWrite("next.config.js")).toBe(false)
    expect(FilePermissionPolicy.canWrite("tailwind.config.ts")).toBe(false)
  })

  it("denies anything inside .github/", () => {
    expect(FilePermissionPolicy.canWrite(".github/workflows/deploy.yml")).toBe(false)
    expect(FilePermissionPolicy.canWrite(".github/CODEOWNERS")).toBe(false)
  })

  it("denies anything inside node_modules/", () => {
    expect(FilePermissionPolicy.canWrite("node_modules/lodash/index.js")).toBe(false)
  })

  it("denies anything inside .next/, dist/, build/, .git/, .vercel/", () => {
    expect(FilePermissionPolicy.canWrite(".next/cache/foo")).toBe(false)
    expect(FilePermissionPolicy.canWrite("dist/index.js")).toBe(false)
    expect(FilePermissionPolicy.canWrite("build/static/chunk.js")).toBe(false)
    expect(FilePermissionPolicy.canWrite(".git/HEAD")).toBe(false)
    expect(FilePermissionPolicy.canWrite(".vercel/output/config.json")).toBe(false)
  })

  it("denies nested .env (e.g. src/.env)", () => {
    expect(FilePermissionPolicy.canWrite("src/.env")).toBe(false)
    expect(FilePermissionPolicy.canWrite("app/.env.local")).toBe(false)
  })

  it("denies lockfiles", () => {
    expect(FilePermissionPolicy.canWrite("package-lock.json")).toBe(false)
    expect(FilePermissionPolicy.canWrite("pnpm-lock.yaml")).toBe(false)
    expect(FilePermissionPolicy.canWrite("yarn.lock")).toBe(false)
  })

  it("denies vercel.json and supabase config", () => {
    expect(FilePermissionPolicy.canWrite("vercel.json")).toBe(false)
    expect(FilePermissionPolicy.canWrite("supabase/config.toml")).toBe(false)
  })

  it("allows src/app/page.tsx", () => {
    expect(FilePermissionPolicy.canWrite("src/app/page.tsx")).toBe(true)
  })

  it("allows public/logo.svg", () => {
    expect(FilePermissionPolicy.canWrite("public/logo.svg")).toBe(true)
  })

  it("allows lib/utils.ts and components/Button.tsx", () => {
    expect(FilePermissionPolicy.canWrite("lib/utils.ts")).toBe(true)
    expect(FilePermissionPolicy.canWrite("components/Button.tsx")).toBe(true)
  })

  it("allows supabase/migrations/001_init.sql", () => {
    expect(FilePermissionPolicy.canWrite("supabase/migrations/001_init.sql")).toBe(true)
  })

  it("allows styles/globals.css", () => {
    expect(FilePermissionPolicy.canWrite("styles/globals.css")).toBe(true)
  })

  it("denies paths outside any writable directory (default deny)", () => {
    expect(FilePermissionPolicy.canWrite("README.md")).toBe(false)
    expect(FilePermissionPolicy.canWrite("docs/CHANGELOG.md")).toBe(false)
    expect(FilePermissionPolicy.canWrite("scripts/build.sh")).toBe(false)
  })

  it("normalizes leading slash in path", () => {
    expect(FilePermissionPolicy.canWrite("/src/app/page.tsx")).toBe(true)
    expect(FilePermissionPolicy.canWrite("/package.json")).toBe(false)
  })
})

describe("FilePermissionPolicy.canRead", () => {
  it("allows reads inside writable dirs", () => {
    expect(FilePermissionPolicy.canRead("src/app/page.tsx")).toBe(true)
  })

  it("allows reads of locked config files (model can SEE them)", () => {
    expect(FilePermissionPolicy.canRead("package.json")).toBe(true)
    expect(FilePermissionPolicy.canRead("tsconfig.json")).toBe(true)
    expect(FilePermissionPolicy.canRead(".env")).toBe(true)
  })

  it("denies reads inside readOnlyDirs (noise)", () => {
    expect(FilePermissionPolicy.canRead("node_modules/foo/index.js")).toBe(false)
    expect(FilePermissionPolicy.canRead(".git/HEAD")).toBe(false)
    expect(FilePermissionPolicy.canRead(".next/cache/foo")).toBe(false)
  })
})

describe("FilePermissionPolicy.describe", () => {
  it("exposes the three lists for diagnostics/UI", () => {
    const d = FilePermissionPolicy.describe()
    expect(d.locked).toContain("package.json")
    expect(d.readOnlyDirs).toContain("node_modules/")
    expect(d.writableDirs).toContain("src/")
  })
})
