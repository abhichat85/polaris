/**
 * Tests for find_definition / find_references — D-053 / Phase 3.2.
 */
import { describe, expect, it, vi } from "vitest"
import {
  findDefinition,
  findReferences,
  formatCodeNavMatches,
  type CodeNavDeps,
} from "@/lib/tools/code-nav"

/** Build a deps object whose `exec` returns the given ripgrep stdout. */
function mockDeps(stdout: string, exitCode = 0): { deps: CodeNavDeps; exec: ReturnType<typeof vi.fn> } {
  const exec = vi.fn(async () => ({ exitCode, stdout, stderr: "" }))
  return { deps: { exec }, exec }
}

/** Build deps that captures the issued command for inspection. */
function captureDeps(stdout: string, exitCode = 0): { deps: CodeNavDeps; cmds: string[] } {
  const cmds: string[] = []
  const deps: CodeNavDeps = {
    exec: async (cmd) => {
      cmds.push(cmd)
      return { exitCode, stdout, stderr: "" }
    },
  }
  return { deps, cmds }
}

describe("findDefinition", () => {
  it("returns empty result for empty symbol", async () => {
    const { deps } = mockDeps("")
    const r = await findDefinition({ symbol: "" }, deps)
    expect(r.matches).toHaveLength(0)
  })

  it("issues a regex search by default (not fixed-string)", async () => {
    const { deps, cmds } = captureDeps("", 1)
    await findDefinition({ symbol: "useStore" }, deps)
    expect(cmds[0]).toContain("rg")
    // No --fixed-strings flag — we want regex matching for kind variants
    expect(cmds[0]).not.toContain("--fixed-strings")
  })

  it("escapes regex metacharacters in symbol names", async () => {
    const { deps, cmds } = captureDeps("", 1)
    await findDefinition({ symbol: "a$b" }, deps)
    expect(cmds[0]).toContain("a\\$b") // escaped
  })

  it("includes function definition pattern by default", async () => {
    const { deps, cmds } = captureDeps("", 1)
    await findDefinition({ symbol: "Foo" }, deps)
    const cmd = cmds[0]
    expect(cmd).toContain("function")
    expect(cmd).toContain("class")
    expect(cmd).toContain("interface")
    expect(cmd).toContain("type")
    expect(cmd).toContain("const")
  })

  it("respects kind filter", async () => {
    const { deps, cmds } = captureDeps("", 1)
    await findDefinition({ symbol: "Foo", kind: "interface" }, deps)
    expect(cmds[0]).toContain("interface")
    expect(cmds[0]).not.toMatch(/function\\s\+Foo/)
  })

  it("parses ripgrep output into matches with kind inference", async () => {
    const stdout = [
      "src/store.ts:5:export const useStore = create<State>(() => ({}))",
      "src/types.ts:10:export interface UseStoreOptions {",
      "src/components/Button.tsx:3:function useStore() { return null }",
    ].join("\n")
    const { deps } = mockDeps(stdout)
    const r = await findDefinition({ symbol: "useStore" }, deps)
    expect(r.matches).toHaveLength(3)
    expect(r.matches[0]).toMatchObject({
      path: "src/store.ts",
      line: 5,
      kind: "const",
    })
    expect(r.matches[1].kind).toBe("interface")
    expect(r.matches[2].kind).toBe("function")
  })

  it("respects pathGlob", async () => {
    const { deps, cmds } = captureDeps("", 1)
    await findDefinition({ symbol: "Foo", pathGlob: "src/**/*.ts" }, deps)
    expect(cmds[0]).toContain("--glob='src/**/*.ts'")
  })

  it("clamps maxResults to hard max", async () => {
    const { deps, cmds } = captureDeps("", 1)
    await findDefinition({ symbol: "Foo", maxResults: 5000 }, deps)
    expect(cmds[0]).toContain("--max-count=500")
  })

  it("uses default maxResults when not specified", async () => {
    const { deps, cmds } = captureDeps("", 1)
    await findDefinition({ symbol: "Foo" }, deps)
    expect(cmds[0]).toContain("--max-count=20")
  })

  it("treats exit code 1 as no matches", async () => {
    const { deps } = mockDeps("", 1)
    const r = await findDefinition({ symbol: "Nope" }, deps)
    expect(r.matches).toHaveLength(0)
    expect(r.truncated).toBe(false)
  })

  it("throws on exit code >= 2", async () => {
    const { deps } = mockDeps("", 2)
    await expect(findDefinition({ symbol: "X" }, deps)).rejects.toThrow(/ripgrep failed/)
  })

  it("truncates snippet at 200 chars and appends ellipsis", async () => {
    const long = "x".repeat(300)
    const stdout = `src/file.ts:1:export const Foo = "${long}"`
    const { deps } = mockDeps(stdout)
    const r = await findDefinition({ symbol: "Foo" }, deps)
    expect(r.matches[0].snippet.length).toBeLessThanOrEqual(201)
    expect(r.matches[0].snippet.endsWith("…")).toBe(true)
  })

  it("flags truncated when matches hit cap", async () => {
    // Generate 20 matches (the default cap).
    const stdout = Array.from({ length: 20 }, (_, i) => `src/f${i}.ts:1:foo`).join("\n")
    const { deps } = mockDeps(stdout)
    const r = await findDefinition({ symbol: "foo" }, deps)
    expect(r.matches).toHaveLength(20)
    expect(r.truncated).toBe(true)
  })
})

describe("findReferences", () => {
  it("returns empty for empty symbol", async () => {
    const { deps } = mockDeps("")
    expect((await findReferences({ symbol: "" }, deps)).matches).toHaveLength(0)
  })

  it("uses word-boundary regex pattern", async () => {
    const { deps, cmds } = captureDeps("", 1)
    await findReferences({ symbol: "foo" }, deps)
    // Pattern is '\bfoo\b' — single-quoted by sq()
    expect(cmds[0]).toContain("\\bfoo\\b")
  })

  it("filters out definition lines by default", async () => {
    const stdout = [
      "src/a.ts:5:export function foo() { return 1 }", // definition
      "src/b.ts:10:foo()",                                 // reference
      "src/c.ts:15:const result = foo() + 1",              // reference
      "src/d.ts:1:export const foo = () => 2",             // definition
    ].join("\n")
    const { deps } = mockDeps(stdout)
    const r = await findReferences({ symbol: "foo" }, deps)
    expect(r.matches).toHaveLength(2)
    expect(r.matches[0].path).toBe("src/b.ts")
    expect(r.matches[1].path).toBe("src/c.ts")
  })

  it("includeDefinitions=true keeps definition lines", async () => {
    const stdout = [
      "src/a.ts:5:export function foo() { return 1 }",
      "src/b.ts:10:foo()",
    ].join("\n")
    const { deps } = mockDeps(stdout)
    const r = await findReferences({ symbol: "foo", includeDefinitions: true }, deps)
    expect(r.matches).toHaveLength(2)
  })

  it("respects maxResults clamping", async () => {
    const { deps, cmds } = captureDeps("", 1)
    await findReferences({ symbol: "foo", maxResults: 99999 }, deps)
    expect(cmds[0]).toContain("--max-count=500")
  })

  it("does not match foo inside foobar (word boundary)", async () => {
    const stdout = "src/file.ts:1:foobar()"
    const { deps } = mockDeps(stdout, 1) // ripgrep would not have matched
    const r = await findReferences({ symbol: "foo" }, deps)
    expect(r.matches).toHaveLength(0)
  })

  it("escapes special regex chars in symbol", async () => {
    const { deps, cmds } = captureDeps("", 1)
    await findReferences({ symbol: "$state" }, deps)
    expect(cmds[0]).toContain("\\bsymbol".replace("symbol", "\\$state"))
  })
})

describe("formatCodeNavMatches", () => {
  it("renders kind tag when present", () => {
    const out = formatCodeNavMatches({
      matches: [
        { path: "src/x.ts", line: 5, snippet: "export const Foo = 1", kind: "const" },
      ],
      truncated: false,
    })
    expect(out).toContain("[const]")
    expect(out).toContain("src/x.ts:5")
  })

  it("appends truncation footer", () => {
    const out = formatCodeNavMatches({
      matches: [{ path: "a", line: 1, snippet: "x" }],
      truncated: true,
    })
    expect(out).toContain("truncated")
  })

  it("returns 'No matches.' for empty result", () => {
    expect(formatCodeNavMatches({ matches: [], truncated: false })).toBe("No matches.")
  })
})
