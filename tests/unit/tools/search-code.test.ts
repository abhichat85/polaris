import { describe, it, expect, vi } from "vitest"
import { searchCode } from "@/lib/tools/search-code"

type ExecMock = ReturnType<typeof vi.fn>

function makeDeps(execImpl: (cmd: string, opts?: { cwd?: string; timeoutMs?: number }) => Promise<{
  exitCode: number
  stdout: string
  stderr: string
}>) {
  const exec: ExecMock = vi.fn(execImpl)
  return {
    exec,
    deps: {
      exec: (cmd: string, opts?: { cwd?: string; timeoutMs?: number }) => exec(cmd, opts),
      projectRoot: "/workspace",
    },
  }
}

describe("searchCode", () => {
  it("happy path: parses 2 matches and uses correct flags", async () => {
    const stdout = [
      "src/app/page.tsx:12:export default function Page() {",
      "src/app/layout.tsx:3:import './globals.css'",
    ].join("\n")
    const { exec, deps } = makeDeps(async () => ({ exitCode: 0, stdout, stderr: "" }))

    const result = await searchCode({ query: "import" }, deps)

    expect(result.matches).toHaveLength(2)
    expect(result.matches[0]).toEqual({
      path: "src/app/page.tsx",
      line: 12,
      snippet: "export default function Page() {",
    })
    expect(result.matches[1]).toEqual({
      path: "src/app/layout.tsx",
      line: 3,
      snippet: "import './globals.css'",
    })
    expect(result.truncated).toBe(false)

    const cmd = exec.mock.calls[0][0] as string
    expect(cmd).toContain("--line-number")
    expect(cmd).toContain("--color=never")
    expect(cmd).toContain("--no-heading")
  })

  it("fixed-strings escape: regex=false adds --fixed-strings and passes literal query", async () => {
    const { exec, deps } = makeDeps(async () => ({ exitCode: 1, stdout: "", stderr: "" }))
    await searchCode({ query: "foo.bar(" }, deps)
    const cmd = exec.mock.calls[0][0] as string
    expect(cmd).toContain("--fixed-strings")
    expect(cmd).toContain("'foo.bar('")
  })

  it("regex pass-through: regex=true omits --fixed-strings", async () => {
    const { exec, deps } = makeDeps(async () => ({ exitCode: 1, stdout: "", stderr: "" }))
    await searchCode({ query: "foo.*bar", regex: true }, deps)
    const cmd = exec.mock.calls[0][0] as string
    expect(cmd).not.toContain("--fixed-strings")
  })

  it("no matches: exitCode 1 returns empty matches, not error", async () => {
    const { deps } = makeDeps(async () => ({ exitCode: 1, stdout: "", stderr: "" }))
    const result = await searchCode({ query: "nope" }, deps)
    expect(result).toEqual({ matches: [], truncated: false })
  })

  it("other error: non-0/1 exit code throws including stderr", async () => {
    const { deps } = makeDeps(async () => ({
      exitCode: 2,
      stdout: "",
      stderr: "rg: bad regex",
    }))
    await expect(searchCode({ query: "(", regex: true }, deps)).rejects.toThrow(/rg: bad regex/)
  })

  it("truncated: matches.length === clamped maxResults", async () => {
    const lines = Array.from(
      { length: 80 },
      (_, i) => `src/file${i}.ts:${i + 1}:line ${i}`,
    ).join("\n")
    const { deps } = makeDeps(async () => ({ exitCode: 0, stdout: lines, stderr: "" }))
    const result = await searchCode({ query: "x", maxResults: 80 }, deps)
    expect(result.matches).toHaveLength(80)
    expect(result.truncated).toBe(true)
  })

  it("not truncated: matches < cap", async () => {
    const lines = Array.from(
      { length: 50 },
      (_, i) => `src/file${i}.ts:${i + 1}:line ${i}`,
    ).join("\n")
    const { deps } = makeDeps(async () => ({ exitCode: 0, stdout: lines, stderr: "" }))
    const result = await searchCode({ query: "x", maxResults: 80 }, deps)
    expect(result.matches).toHaveLength(50)
    expect(result.truncated).toBe(false)
  })

  it("glob passes through quoted", async () => {
    const { exec, deps } = makeDeps(async () => ({ exitCode: 1, stdout: "", stderr: "" }))
    await searchCode({ query: "x", pathGlob: "src/**/*.tsx" }, deps)
    const cmd = exec.mock.calls[0][0] as string
    expect(cmd).toContain("--glob='src/**/*.tsx'")
  })

  it("snippet truncated to <= 200 chars", async () => {
    const long = "a".repeat(300)
    const { deps } = makeDeps(async () => ({
      exitCode: 0,
      stdout: `src/x.ts:1:${long}`,
      stderr: "",
    }))
    const result = await searchCode({ query: "a" }, deps)
    expect(result.matches).toHaveLength(1)
    expect(result.matches[0].snippet.length).toBeLessThanOrEqual(200)
  })

  it("clamps maxResults to 500", async () => {
    const { exec, deps } = makeDeps(async () => ({ exitCode: 1, stdout: "", stderr: "" }))
    await searchCode({ query: "x", maxResults: 9999 }, deps)
    const cmd = exec.mock.calls[0][0] as string
    expect(cmd).toContain("--max-count=500")
  })

  it("escapes single quotes in query", async () => {
    const { exec, deps } = makeDeps(async () => ({ exitCode: 1, stdout: "", stderr: "" }))
    await searchCode({ query: "foo'bar" }, deps)
    const cmd = exec.mock.calls[0][0] as string
    // 'foo'\''bar' — single quote escaped
    expect(cmd).toContain("'foo'\\''bar'")
  })

  it("case sensitivity: default false adds --ignore-case", async () => {
    const { exec, deps } = makeDeps(async () => ({ exitCode: 1, stdout: "", stderr: "" }))
    await searchCode({ query: "x" }, deps)
    expect(exec.mock.calls[0][0]).toContain("--ignore-case")
  })

  it("case sensitivity: true omits --ignore-case", async () => {
    const { exec, deps } = makeDeps(async () => ({ exitCode: 1, stdout: "", stderr: "" }))
    await searchCode({ query: "x", caseSensitive: true }, deps)
    expect(exec.mock.calls[0][0]).not.toContain("--ignore-case")
  })
})
