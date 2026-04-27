/**
 * D-031 — Next.js lint suite. Each test exercises one rule + asserts the
 * remediation message is concrete enough to inject into agent context.
 */

import { describe, it, expect } from "vitest"
import { nextJsLints } from "@/lib/scaffold/lints/nextjs"
import { runLints } from "@/lib/scaffold/lints/types"

const find = (id: string) => {
  const lint = nextJsLints.find((l) => l.id === id)
  if (!lint) throw new Error(`lint ${id} missing`)
  return lint
}

describe("forbid-direct-fetch-in-page", () => {
  it("flags a page that calls fetch directly", () => {
    const r = find("forbid-direct-fetch-in-page").check({
      path: "src/app/products/page.tsx",
      content:
        "export default async function Page() {\n  const data = await fetch('https://example.com').then(r => r.json())\n  return <div>{data.title}</div>\n}",
    })
    expect(r).not.toBeNull()
    expect(r?.severity).toBe("error")
    expect(r?.remediation).toMatch(/route handler|server action/)
  })
  it("passes when there's no direct fetch", () => {
    const r = find("forbid-direct-fetch-in-page").check({
      path: "src/app/page.tsx",
      content: "export default function Home() { return <div /> }",
    })
    expect(r).toBeNull()
  })
})

describe("require-zod-at-api-boundary", () => {
  it("flags an API route that reads json without Zod", () => {
    const r = find("require-zod-at-api-boundary").check({
      path: "src/app/api/foo/route.ts",
      content:
        "export async function POST(request: Request) {\n  const body = await request.json()\n  return Response.json(body)\n}",
    })
    expect(r).not.toBeNull()
    expect(r?.remediation).toMatch(/z\.object|Body\.parse/)
  })
  it("passes when Zod is used", () => {
    const r = find("require-zod-at-api-boundary").check({
      path: "src/app/api/foo/route.ts",
      content:
        "import { z } from 'zod'\nconst Body = z.object({ x: z.string() })\nexport async function POST(request: Request) { const body = Body.parse(await request.json()); return Response.json(body) }",
    })
    expect(r).toBeNull()
  })
})

describe("enforce-praxiom-tokens", () => {
  it("flags a hex literal in a UI file", () => {
    const r = find("enforce-praxiom-tokens").check({
      path: "src/components/X.tsx",
      content: "<div className='text-[#ff0000]'>x</div>",
    })
    expect(r).not.toBeNull()
    expect(r?.remediation).toMatch(/Praxiom design token/)
  })
})

describe("forbid-cross-domain-imports", () => {
  it("flags a component importing from @/app", () => {
    const r = find("forbid-cross-domain-imports").check({
      path: "src/components/Foo.tsx",
      content: "import { x } from '@/app/products/utils'\nexport function Foo() { return null }",
    })
    expect(r).not.toBeNull()
    expect(r?.remediation).toMatch(/@\/lib|@\/features/)
  })
})

describe("runLints — bundle smoke", () => {
  it("returns flat array across multiple files + rules", () => {
    const results = runLints(nextJsLints, [
      {
        path: "src/app/page.tsx",
        content: "console.log('hi'); export default function P() { return <div className='text-[#abc]' /> }",
      },
      {
        path: "src/components/Bar.tsx",
        content: "import { x } from '@/app/foo'; export function Bar() { return null }",
      },
    ])
    // page has console.log + hex; component has cross-domain
    expect(results.length).toBeGreaterThanOrEqual(2)
    const ids = new Set(results.map((r) => r.lintId))
    expect(ids.has("forbid-cross-domain-imports")).toBe(true)
  })
})
