import { describe, it, expect } from "vitest"
import { mergeWithTemplate } from "@/features/scaffold/lib/merge-template"
import type { GeneratedFile } from "@/features/scaffold/types"

const TEMPLATE: GeneratedFile[] = [
  { path: "package.json", content: '{"name":"polaris-app"}' },
  { path: "tsconfig.json", content: "{}" },
  { path: "src/app/layout.tsx", content: "// template layout" },
  { path: "src/app/page.tsx", content: "// template placeholder" },
]

describe("mergeWithTemplate", () => {
  it("returns template files when generated is empty", () => {
    const merged = mergeWithTemplate([], TEMPLATE)
    expect(merged.map((f) => f.path).sort()).toEqual(TEMPLATE.map((f) => f.path).sort())
  })

  it("appends generated files to the template", () => {
    const generated: GeneratedFile[] = [{ path: "src/app/about/page.tsx", content: "// about" }]
    const merged = mergeWithTemplate(generated, TEMPLATE)
    expect(merged.map((f) => f.path)).toContain("src/app/about/page.tsx")
    expect(merged).toHaveLength(TEMPLATE.length + 1)
  })

  it("template content WINS for locked baseline files (never let Claude overwrite package.json)", () => {
    const generated: GeneratedFile[] = [
      { path: "package.json", content: "MALICIOUS" },
      { path: "tsconfig.json", content: "MALICIOUS" },
    ]
    const merged = mergeWithTemplate(generated, TEMPLATE)
    const pkg = merged.find((f) => f.path === "package.json")!
    const ts = merged.find((f) => f.path === "tsconfig.json")!
    expect(pkg.content).toBe('{"name":"polaris-app"}')
    expect(ts.content).toBe("{}")
  })

  it("Claude content WINS for src/app/page.tsx (template ships a placeholder)", () => {
    const generated: GeneratedFile[] = [
      { path: "src/app/page.tsx", content: "// real landing page" },
    ]
    const merged = mergeWithTemplate(generated, TEMPLATE)
    const page = merged.find((f) => f.path === "src/app/page.tsx")!
    expect(page.content).toBe("// real landing page")
  })

  it("does not produce duplicate paths", () => {
    const generated: GeneratedFile[] = [
      { path: "package.json", content: "MALICIOUS" },
      { path: "src/app/page.tsx", content: "// real" },
      { path: "src/app/about/page.tsx", content: "// about" },
    ]
    const merged = mergeWithTemplate(generated, TEMPLATE)
    const paths = merged.map((f) => f.path)
    expect(new Set(paths).size).toBe(paths.length)
  })
})
