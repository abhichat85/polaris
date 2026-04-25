import { describe, it, expect } from "vitest"
import { MockSandboxProvider } from "@/lib/sandbox/mock-provider"
import type { SandboxProvider } from "@/lib/sandbox/types"

describe("MockSandboxProvider conforms to SandboxProvider", () => {
  it("structurally implements the interface (compile-time + runtime)", async () => {
    const p: SandboxProvider = new MockSandboxProvider()
    expect(p.name).toBe("mock")
    expect(typeof p.create).toBe("function")
    expect(typeof p.writeFile).toBe("function")
    expect(typeof p.exec).toBe("function")
  })

  it("creates a sandbox with a unique id", async () => {
    const p = new MockSandboxProvider()
    const a = await p.create("nextjs-supabase", {})
    const b = await p.create("nextjs-supabase", {})
    expect(a.id).not.toBe(b.id)
  })

  it("supports the write/read/delete cycle", async () => {
    const p = new MockSandboxProvider()
    const { id } = await p.create("nextjs", {})
    await p.writeFile(id, "src/x.ts", "export const x = 1")
    expect(await p.readFile(id, "src/x.ts")).toBe("export const x = 1")
    await p.deleteFile(id, "src/x.ts")
    await expect(p.readFile(id, "src/x.ts")).rejects.toThrow(/ENOENT/)
  })

  it("normalizes leading slash in paths", async () => {
    const p = new MockSandboxProvider()
    const { id } = await p.create("nextjs", {})
    await p.writeFile(id, "/src/y.ts", "y")
    // Should be readable via either normalized or non-normalized form
    expect(await p.readFile(id, "src/y.ts")).toBe("y")
    expect(await p.readFile(id, "/src/y.ts")).toBe("y")
  })

  it("listFiles returns files under a directory", async () => {
    const p = new MockSandboxProvider()
    const { id } = await p.create("nextjs", {})
    await p.writeFile(id, "src/a.ts", "1")
    await p.writeFile(id, "src/b.ts", "2")
    await p.writeFile(id, "lib/c.ts", "3")
    const files = await p.listFiles(id, "src/")
    expect(files.sort()).toEqual(["src/a.ts", "src/b.ts"])
  })

  it("isAlive flips false after kill", async () => {
    const p = new MockSandboxProvider()
    const { id } = await p.create("nextjs", {})
    expect(await p.isAlive(id)).toBe(true)
    await p.kill(id)
    expect(await p.isAlive(id)).toBe(false)
  })

  it("exec uses default zero-exit when no handler is set", async () => {
    const p = new MockSandboxProvider()
    const { id } = await p.create("nextjs", {})
    const result = await p.exec(id, "npm test")
    expect(result).toMatchObject({ exitCode: 0, stdout: "", stderr: "" })
  })

  it("exec delegates to execHandler when set (lets tests script outputs)", async () => {
    const p = new MockSandboxProvider()
    p.execHandler = (cmd) =>
      cmd.startsWith("npm install")
        ? { stdout: "added 5 packages", stderr: "", exitCode: 0, durationMs: 1234 }
        : { stdout: "", stderr: "unknown command", exitCode: 1, durationMs: 1 }
    const { id } = await p.create("nextjs", {})
    const ok = await p.exec(id, "npm install lodash")
    expect(ok).toMatchObject({ exitCode: 0, stdout: "added 5 packages" })
    const fail = await p.exec(id, "do_thing")
    expect(fail).toMatchObject({ exitCode: 1 })
  })

  it("execDetached records pid and command", async () => {
    const p = new MockSandboxProvider()
    const { id } = await p.create("nextjs", {})
    const { pid } = await p.execDetached(id, "npm run dev")
    expect(pid).toBeGreaterThan(0)
    const state = p.sandboxes.get(id)!
    expect(state.detached[0]).toMatchObject({ pid, cmd: "npm run dev" })
  })

  it("getPreviewUrl returns a deterministic mock URL", async () => {
    const p = new MockSandboxProvider()
    const { id } = await p.create("nextjs", {})
    const url = await p.getPreviewUrl(id, 3000)
    expect(url).toBe(`https://3000-${id}.mock.e2b.dev`)
  })

  it("operations on a dead sandbox throw", async () => {
    const p = new MockSandboxProvider()
    const { id } = await p.create("nextjs", {})
    p.killExternally(id)
    await expect(p.writeFile(id, "src/x.ts", "x")).rejects.toThrow(/not alive/)
    await expect(p.readFile(id, "src/x.ts")).rejects.toThrow(/not alive/)
  })
})
