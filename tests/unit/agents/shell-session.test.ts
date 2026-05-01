/**
 * Tests for ShellSession — D-051 / Phase 1.1.
 *
 * Coverage:
 *   - cwd persistence across calls
 *   - sentinel parsing + stdout cleanup
 *   - cwd update on `cd` command
 *   - reset() clears state
 *   - registry lazy-init + dispose
 *   - special-character handling in cwd path (spaces, single quotes)
 *   - rejects empty/blank commands
 *   - exit code preservation
 */
import { describe, expect, it } from "vitest"
import { MockSandboxProvider } from "@/lib/sandbox/mock-provider"
import {
  ShellSession,
  ShellSessionRegistry,
  DEFAULT_CWD,
} from "@/lib/agents/shell-session"
import type { ExecOptions, ExecResult } from "@/lib/sandbox/types"

/** Create a sandbox with a deterministic exec handler that simulates a shell. */
async function setup(
  handler?: (cmd: string, opts?: ExecOptions) => ExecResult,
): Promise<{
  sandbox: MockSandboxProvider
  sandboxId: string
  session: ShellSession
}> {
  const sandbox = new MockSandboxProvider()
  if (handler) {
    sandbox.execHandler = handler
  }
  const sb = await sandbox.create("nextjs", {})
  let counter = 0
  const session = new ShellSession(sandbox, sb.id, {
    generateMarker: () => `TEST_MARKER_${counter++}`,
  })
  return { sandbox, sandboxId: sb.id, session }
}

describe("ShellSession", () => {
  it("starts at DEFAULT_CWD", async () => {
    const { session } = await setup()
    expect(session.getCwd()).toBe(DEFAULT_CWD)
  })

  it("respects initialCwd option", async () => {
    const sandbox = new MockSandboxProvider()
    const sb = await sandbox.create("nextjs", {})
    const s = new ShellSession(sandbox, sb.id, { initialCwd: "/workspace" })
    expect(s.getCwd()).toBe("/workspace")
  })

  it("rejects empty command", async () => {
    const { session } = await setup()
    await expect(session.exec("")).rejects.toThrow(/non-empty/i)
    await expect(session.exec("   ")).rejects.toThrow(/non-empty/i)
  })

  it("includes cd preamble + sentinel echo in wrapped command", async () => {
    let captured = ""
    const { session } = await setup((cmd) => {
      captured = cmd
      return {
        stdout: "ls output\n__POLARIS_TEST_MARKER_0__:CWD:/",
        stderr: "",
        exitCode: 0,
        durationMs: 1,
      }
    })
    await session.exec("ls")
    expect(captured).toContain("cd '/'")
    expect(captured).toContain("ls")
    expect(captured).toContain("__POLARIS_TEST_MARKER_0__:CWD:")
    expect(captured).toContain("exit $__polaris_rc")
  })

  it("strips sentinel line from returned stdout", async () => {
    const { session } = await setup(() => ({
      stdout: "user output line 1\nuser output line 2\n__POLARIS_TEST_MARKER_0__:CWD:/",
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    }))
    const result = await session.exec("echo hi")
    expect(result.stdout).not.toContain("__POLARIS_")
    expect(result.stdout).toContain("user output line 1")
    expect(result.stdout).toContain("user output line 2")
  })

  it("updates cwd from sentinel and persists across calls", async () => {
    let n = 0
    const { session } = await setup(() => {
      n++
      const newCwd = n === 1 ? "/srv/app" : "/srv/app/sub"
      return {
        stdout: `stdout ${n}\n__POLARIS_TEST_MARKER_${n - 1}__:CWD:${newCwd}`,
        stderr: "",
        exitCode: 0,
        durationMs: 1,
      }
    })

    await session.exec("cd /srv/app")
    expect(session.getCwd()).toBe("/srv/app")

    await session.exec("cd sub")
    expect(session.getCwd()).toBe("/srv/app/sub")
  })

  it("does NOT update cwd when sentinel is missing (e.g. command crashed)", async () => {
    const { session } = await setup(() => ({
      stdout: "no sentinel here",
      stderr: "boom",
      exitCode: 137,
      durationMs: 1,
    }))
    const before = session.getCwd()
    await session.exec("crash-the-shell")
    expect(session.getCwd()).toBe(before)
  })

  it("preserves exit code from the wrapped command", async () => {
    const { session } = await setup(() => ({
      stdout: "__POLARIS_TEST_MARKER_0__:CWD:/",
      stderr: "rip",
      exitCode: 42,
      durationMs: 1,
    }))
    const r = await session.exec("false")
    expect(r.exitCode).toBe(42)
    expect(r.stderr).toBe("rip")
  })

  it("uses tracked cwd as the cd preamble target across invocations", async () => {
    let cmdHistory: string[] = []
    let n = 0
    const { session } = await setup((cmd) => {
      cmdHistory.push(cmd)
      const i = n++
      const cwd = i === 0 ? "/a" : i === 1 ? "/a" : "/a"
      return {
        stdout: `__POLARIS_TEST_MARKER_${i}__:CWD:${cwd}`,
        stderr: "",
        exitCode: 0,
        durationMs: 1,
      }
    })

    await session.exec("cd /a")
    expect(session.getCwd()).toBe("/a")

    await session.exec("ls")
    // Second invocation must cd into the tracked cwd (/a), not /
    expect(cmdHistory[1].split("\n")[0]).toContain("cd '/a'")
  })

  it("escapes single quotes in cwd paths safely", async () => {
    let captured = ""
    const sandbox = new MockSandboxProvider()
    sandbox.execHandler = (cmd) => {
      captured = cmd
      return {
        stdout: `__POLARIS_M__:CWD:/path/with'quote`,
        stderr: "",
        exitCode: 0,
        durationMs: 1,
      }
    }
    const sb = await sandbox.create("nextjs", {})
    let n = 0
    const session = new ShellSession(sandbox, sb.id, {
      initialCwd: "/path/with'quote",
      generateMarker: () => `M_${n++}`,
    })
    await session.exec("ls")
    // Single quote correctly escaped via close/escape/reopen pattern
    expect(captured).toContain("cd '/path/with'\\''quote'")
  })

  it("reset() returns cwd to default", async () => {
    const { session } = await setup(() => ({
      stdout: "__POLARIS_TEST_MARKER_0__:CWD:/elsewhere",
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    }))
    await session.exec("cd /elsewhere")
    expect(session.getCwd()).toBe("/elsewhere")
    session.reset()
    expect(session.getCwd()).toBe(DEFAULT_CWD)
  })
})

describe("ShellSessionRegistry", () => {
  it("lazy-creates one session per sandbox", async () => {
    const sandbox = new MockSandboxProvider()
    const reg = new ShellSessionRegistry(sandbox)
    const sb = await sandbox.create("nextjs", {})
    expect(reg.size()).toBe(0)
    const s1 = reg.forSandbox(sb.id)
    expect(reg.size()).toBe(1)
    const s2 = reg.forSandbox(sb.id)
    expect(s1).toBe(s2)
    expect(reg.size()).toBe(1)
  })

  it("creates separate sessions for different sandboxes", async () => {
    const sandbox = new MockSandboxProvider()
    const reg = new ShellSessionRegistry(sandbox)
    const a = await sandbox.create("nextjs", {})
    const b = await sandbox.create("nextjs", {})
    const sa = reg.forSandbox(a.id)
    const sb = reg.forSandbox(b.id)
    expect(sa).not.toBe(sb)
    expect(reg.size()).toBe(2)
  })

  it("dispose(sandboxId) removes only that session", async () => {
    const sandbox = new MockSandboxProvider()
    const reg = new ShellSessionRegistry(sandbox)
    const a = await sandbox.create("nextjs", {})
    const b = await sandbox.create("nextjs", {})
    reg.forSandbox(a.id)
    reg.forSandbox(b.id)
    reg.dispose(a.id)
    expect(reg.size()).toBe(1)
  })

  it("disposeAll() clears every session", async () => {
    const sandbox = new MockSandboxProvider()
    const reg = new ShellSessionRegistry(sandbox)
    const a = await sandbox.create("nextjs", {})
    const b = await sandbox.create("nextjs", {})
    reg.forSandbox(a.id)
    reg.forSandbox(b.id)
    reg.disposeAll()
    expect(reg.size()).toBe(0)
  })
})
