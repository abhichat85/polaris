import { describe, it, expect, vi } from "vitest"
import { verify, type VerifyDeps } from "@/lib/agents/verifier"

type ExecFn = VerifyDeps["exec"]

function makeDeps(
  ...impls: Array<(cmd: string) => Promise<{ exitCode: number; stdout: string; stderr: string }>>
) {
  let i = 0
  const exec = vi.fn<ExecFn>(async (cmd) => {
    if (i >= impls.length) {
      throw new Error(`exec called ${i + 1} times but only ${impls.length} impls provided`)
    }
    return impls[i++](cmd)
  })
  return { exec, deps: { exec } satisfies VerifyDeps }
}

describe("verifier", () => {
  it("empty changedPaths → ok=true, no exec calls", async () => {
    const { exec, deps } = makeDeps()
    const result = await verify(new Set(), deps)
    expect(result).toEqual({ ok: true })
    expect(exec).not.toHaveBeenCalled()
  })

  it("tsc clean (exit 0), no .ts files changed → ok=true, eslint not invoked", async () => {
    const { exec, deps } = makeDeps(
      async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    )
    const result = await verify(new Set(["public/logo.png"]), deps)
    expect(result).toEqual({ ok: true })
    expect(exec).toHaveBeenCalledTimes(1)
    const cmd = exec.mock.calls[0][0]
    expect(cmd).toContain("tsc --noEmit")
  })

  it("tsc clean (exit 0), one .tsx file changed → eslint runs, returns ok if eslint clean", async () => {
    const { exec, deps } = makeDeps(
      async () => ({ exitCode: 0, stdout: "", stderr: "" }), // tsc
      async () => ({ exitCode: 0, stdout: "", stderr: "" }), // eslint
    )
    const result = await verify(new Set(["src/app/page.tsx"]), deps)
    expect(result).toEqual({ ok: true })
    expect(exec).toHaveBeenCalledTimes(2)
    const eslintCmd = exec.mock.calls[1][0]
    expect(eslintCmd).toContain("eslint")
    expect(eslintCmd).toContain("--quiet")
    expect(eslintCmd).toContain("'src/app/page.tsx'")
  })

  it("tsc errors in a changed path → ok=false, stage='tsc', errors contains the matched line", async () => {
    const tscOut = "src/app/page.tsx(12,5): error TS2345: Type 'string' is not assignable.\n"
    const { exec, deps } = makeDeps(
      async () => ({ exitCode: 1, stdout: tscOut, stderr: "" }),
    )
    const result = await verify(new Set(["src/app/page.tsx"]), deps)
    expect(result.ok).toBe(false)
    expect(result.stage).toBe("tsc")
    expect(result.errors).toContain("src/app/page.tsx(12,5)")
    expect(exec).toHaveBeenCalledTimes(1)
  })

  it("tsc errors only in UNCHANGED paths → continues to eslint stage", async () => {
    const tscOut = "src/other/elsewhere.ts(3,1): error TS2345: pre-existing error.\n"
    const { exec, deps } = makeDeps(
      async () => ({ exitCode: 1, stdout: tscOut, stderr: "" }), // tsc fails but no changed-path matches
      async () => ({ exitCode: 0, stdout: "", stderr: "" }), // eslint clean
    )
    const result = await verify(new Set(["src/app/page.tsx"]), deps)
    expect(result).toEqual({ ok: true })
    expect(exec).toHaveBeenCalledTimes(2)
  })

  it("eslint errors on a changed file → ok=false, stage='eslint'", async () => {
    const lintOut =
      "/p/src/app/page.tsx\n  3:1  error  'foo' is not defined  no-undef\n\n1 problem"
    const { exec, deps } = makeDeps(
      async () => ({ exitCode: 0, stdout: "", stderr: "" }), // tsc clean
      async () => ({ exitCode: 1, stdout: lintOut, stderr: "" }), // eslint errors
    )
    const result = await verify(new Set(["src/app/page.tsx"]), deps)
    expect(result.ok).toBe(false)
    expect(result.stage).toBe("eslint")
    expect(result.errors).toContain("no-undef")
  })

  it("multiple tsc errors filtered correctly — only changed-path lines kept", async () => {
    const tscOut = [
      "src/app/page.tsx(12,5): error TS2345: changed-1",
      "src/other/x.ts(3,1): error TS2345: pre-existing",
      "src/app/layout.tsx(4,2): error TS2345: changed-2",
    ].join("\n")
    const { deps } = makeDeps(
      async () => ({ exitCode: 1, stdout: tscOut, stderr: "" }),
    )
    const result = await verify(
      new Set(["src/app/page.tsx", "src/app/layout.tsx"]),
      deps,
    )
    expect(result.ok).toBe(false)
    expect(result.stage).toBe("tsc")
    expect(result.errors).toContain("changed-1")
    expect(result.errors).toContain("changed-2")
    expect(result.errors).not.toContain("pre-existing")
  })

  it("tsc output truncation — at most ~100 lines of matched output", async () => {
    const lines = Array.from(
      { length: 200 },
      (_, i) => `src/app/page.tsx(${i + 1},1): error TS2345: msg ${i}`,
    )
    const { deps } = makeDeps(
      async () => ({ exitCode: 1, stdout: lines.join("\n"), stderr: "" }),
    )
    const result = await verify(new Set(["src/app/page.tsx"]), deps)
    expect(result.ok).toBe(false)
    const outLines = (result.errors ?? "").split("\n").filter((l) => l.length > 0)
    expect(outLines.length).toBeLessThanOrEqual(100)
  })

  it("no lintable files (only .css/.json/.md) → eslint not invoked, ok=true", async () => {
    const { exec, deps } = makeDeps(
      async () => ({ exitCode: 0, stdout: "", stderr: "" }), // tsc only
    )
    const result = await verify(
      new Set(["src/styles.css", "package.json", "README.md"]),
      deps,
    )
    expect(result).toEqual({ ok: true })
    expect(exec).toHaveBeenCalledTimes(1)
    const cmd = exec.mock.calls[0][0]
    expect(cmd).toContain("tsc --noEmit")
  })

  it("filters tsc errors correctly when paths contain parentheses (route groups)", async () => {
    const stdout = [
      "src/app/(app)/dashboard/page.tsx(12,5): error TS2345: bad",
      "src/app/(marketing)/page.tsx(3,1): error TS2322: also bad",
      "src/components/Card.tsx(1,1): error TS2345: ignored — not in changed",
    ].join("\n")
    const exec = vi.fn<ExecFn>(async (cmd) => ({
      exitCode: cmd.includes("tsc") ? 1 : 0,
      stdout: cmd.includes("tsc") ? stdout : "",
      stderr: "",
    }))
    const result = await verify(
      new Set([
        "src/app/(app)/dashboard/page.tsx",
        "src/app/(marketing)/page.tsx",
      ]),
      { exec },
    )
    expect(result.ok).toBe(false)
    expect(result.stage).toBe("tsc")
    expect(result.errors).toContain("src/app/(app)/dashboard/page.tsx")
    expect(result.errors).toContain("src/app/(marketing)/page.tsx")
    expect(result.errors).not.toContain("src/components/Card.tsx")
  })

  it("forwards cwd from deps to exec for tsc and eslint", async () => {
    const exec = vi.fn<ExecFn>(async () => ({
      exitCode: 0,
      stdout: "",
      stderr: "",
    }))
    await verify(new Set(["src/x.ts"]), { exec, cwd: "/proj" })
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining("tsc"),
      expect.objectContaining({ cwd: "/proj" }),
    )
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining("eslint"),
      expect.objectContaining({ cwd: "/proj" }),
    )
  })

  it("eslint output truncation — ESLINT_MAX_LINES enforced", async () => {
    const lines = Array.from({ length: 500 }, (_, i) => `error line ${i}`)
    const { deps } = makeDeps(
      async () => ({ exitCode: 0, stdout: "", stderr: "" }), // tsc clean
      async () => ({ exitCode: 1, stdout: lines.join("\n"), stderr: "" }),
    )
    const result = await verify(new Set(["src/x.ts"]), deps)
    expect(result.ok).toBe(false)
    expect(result.stage).toBe("eslint")
    const outLines = (result.errors ?? "").split("\n")
    // 200 lines + 1 truncation marker
    expect(outLines.length).toBeLessThanOrEqual(201)
    expect(result.errors).toContain("truncated")
  })
})
