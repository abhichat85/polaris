import { describe, it, expect, beforeEach } from "vitest"
import { ToolExecutor } from "@/lib/tools/executor"
import type { ToolExecutionContext } from "@/lib/tools/types"
import { InMemoryFileService } from "@/lib/files/in-memory-file-service"
import { MockSandboxProvider } from "@/lib/sandbox/mock-provider"

const PROJECT = "proj_1"

async function makeFixture() {
  const files = new InMemoryFileService()
  const sandbox = new MockSandboxProvider()
  const sb = await sandbox.create("nextjs-supabase", {})
  const ctx: ToolExecutionContext = {
    projectId: PROJECT,
    sandboxId: sb.id,
    userId: "u_1",
  }
  const executor = new ToolExecutor({ files, sandbox })
  return { files, sandbox, sb, ctx, executor }
}

describe("ToolExecutor", () => {
  describe("permission checks", () => {
    it("denies write_file to package.json with PATH_LOCKED", async () => {
      const { executor, ctx } = await makeFixture()
      const result = await executor.execute(
        { id: "t1", name: "write_file", input: { path: "package.json", content: "x" } },
        ctx,
      )
      expect(result).toMatchObject({ ok: false, errorCode: "PATH_LOCKED" })
    })

    it("denies edit_file to .env with PATH_LOCKED", async () => {
      const { executor, ctx } = await makeFixture()
      const result = await executor.execute(
        { id: "t2", name: "edit_file", input: { path: ".env", search: "x", replace: "y" } },
        ctx,
      )
      expect(result).toMatchObject({ ok: false, errorCode: "PATH_LOCKED" })
    })

    it("denies create_file outside writable dirs", async () => {
      const { executor, ctx } = await makeFixture()
      const result = await executor.execute(
        { id: "t3", name: "create_file", input: { path: "scripts/foo.sh", content: "#!/bin/sh" } },
        ctx,
      )
      expect(result).toMatchObject({ ok: false, errorCode: "PATH_LOCKED" })
    })

    it("denies delete_file inside .next/", async () => {
      const { executor, ctx } = await makeFixture()
      const result = await executor.execute(
        { id: "t4", name: "delete_file", input: { path: ".next/cache/x" } },
        ctx,
      )
      expect(result).toMatchObject({ ok: false, errorCode: "PATH_LOCKED" })
    })

    it("does NOT permission-check read_file (model can see locked files)", async () => {
      const { executor, ctx, files } = await makeFixture()
      await files.createPath(PROJECT, "package.json", '{"name":"x"}', "scaffold")
      const result = await executor.execute(
        { id: "t5", name: "read_file", input: { path: "package.json" } },
        ctx,
      )
      expect(result).toMatchObject({ ok: true })
    })
  })

  describe("read_file", () => {
    it("returns file content on success", async () => {
      const { executor, ctx, files } = await makeFixture()
      await files.createPath(PROJECT, "src/x.ts", "const x = 1", "user")
      const result = await executor.execute(
        { id: "r1", name: "read_file", input: { path: "src/x.ts" } },
        ctx,
      )
      expect(result).toEqual({ ok: true, data: { content: "const x = 1" } })
    })

    it("returns PATH_NOT_FOUND when missing", async () => {
      const { executor, ctx } = await makeFixture()
      const result = await executor.execute(
        { id: "r2", name: "read_file", input: { path: "src/missing.ts" } },
        ctx,
      )
      expect(result).toMatchObject({ ok: false, errorCode: "PATH_NOT_FOUND" })
    })

    it("denies reads inside read-only dirs (node_modules)", async () => {
      const { executor, ctx } = await makeFixture()
      const result = await executor.execute(
        { id: "r3", name: "read_file", input: { path: "node_modules/foo/index.js" } },
        ctx,
      )
      expect(result).toMatchObject({ ok: false, errorCode: "PATH_LOCKED" })
    })
  })

  describe("write_file (Convex first, then sandbox)", () => {
    it("writes to FileService and sandbox in that order", async () => {
      const { executor, ctx, files, sandbox, sb } = await makeFixture()
      await files.createPath(PROJECT, "src/x.ts", "old", "user")
      const result = await executor.execute(
        { id: "w1", name: "write_file", input: { path: "src/x.ts", content: "new" } },
        ctx,
      )
      expect(result).toMatchObject({ ok: true, data: { written: "src/x.ts" } })
      expect((await files.readPath(PROJECT, "src/x.ts"))!.content).toBe("new")
      expect(await sandbox.readFile(sb.id, "src/x.ts")).toBe("new")
    })

    it("returns PATH_NOT_FOUND when file does not exist", async () => {
      const { executor, ctx } = await makeFixture()
      const result = await executor.execute(
        { id: "w2", name: "write_file", input: { path: "src/missing.ts", content: "x" } },
        ctx,
      )
      expect(result).toMatchObject({ ok: false, errorCode: "PATH_NOT_FOUND" })
    })

    it("returns SANDBOX_DEAD when sandbox write fails (FileService still updated)", async () => {
      const { executor, ctx, files, sandbox, sb } = await makeFixture()
      await files.createPath(PROJECT, "src/x.ts", "old", "user")
      sandbox.killExternally(sb.id)
      const result = await executor.execute(
        { id: "w3", name: "write_file", input: { path: "src/x.ts", content: "new" } },
        ctx,
      )
      expect(result).toMatchObject({ ok: false, errorCode: "SANDBOX_DEAD" })
      // FileService still updated — Convex is the source of truth
      expect((await files.readPath(PROJECT, "src/x.ts"))!.content).toBe("new")
    })

    it("works with no sandbox (sandboxId=null) — FileService only", async () => {
      const files = new InMemoryFileService()
      const sandbox = new MockSandboxProvider()
      const executor = new ToolExecutor({ files, sandbox })
      const ctx: ToolExecutionContext = { projectId: PROJECT, sandboxId: null, userId: "u" }
      await files.createPath(PROJECT, "src/x.ts", "old", "user")
      const result = await executor.execute(
        { id: "w4", name: "write_file", input: { path: "src/x.ts", content: "new" } },
        ctx,
      )
      expect(result).toMatchObject({ ok: true })
    })
  })

  describe("edit_file", () => {
    it("applies an edit and writes Convex first, then sandbox", async () => {
      const { executor, ctx, files, sandbox, sb } = await makeFixture()
      await files.createPath(PROJECT, "src/x.ts", "const a = 1\nconst b = 2", "user")
      const result = await executor.execute(
        {
          id: "e1",
          name: "edit_file",
          input: { path: "src/x.ts", search: "const a = 1", replace: "const a = 42" },
        },
        ctx,
      )
      expect(result).toMatchObject({ ok: true, data: { edited: "src/x.ts" } })
      expect((await files.readPath(PROJECT, "src/x.ts"))!.content).toBe(
        "const a = 42\nconst b = 2",
      )
      expect(await sandbox.readFile(sb.id, "src/x.ts")).toBe("const a = 42\nconst b = 2")
    })

    it("returns EDIT_NOT_FOUND when search string is absent", async () => {
      const { executor, ctx, files } = await makeFixture()
      await files.createPath(PROJECT, "src/x.ts", "hello world", "user")
      const result = await executor.execute(
        { id: "e2", name: "edit_file", input: { path: "src/x.ts", search: "missing", replace: "y" } },
        ctx,
      )
      expect(result).toMatchObject({ ok: false, errorCode: "EDIT_NOT_FOUND" })
    })

    it("returns EDIT_NOT_UNIQUE when search matches multiple times", async () => {
      const { executor, ctx, files } = await makeFixture()
      await files.createPath(PROJECT, "src/x.ts", "abc abc abc", "user")
      const result = await executor.execute(
        { id: "e3", name: "edit_file", input: { path: "src/x.ts", search: "abc", replace: "z" } },
        ctx,
      )
      expect(result).toMatchObject({ ok: false, errorCode: "EDIT_NOT_UNIQUE" })
    })

    it("returns PATH_NOT_FOUND when file is missing", async () => {
      const { executor, ctx } = await makeFixture()
      const result = await executor.execute(
        { id: "e4", name: "edit_file", input: { path: "src/missing.ts", search: "x", replace: "y" } },
        ctx,
      )
      expect(result).toMatchObject({ ok: false, errorCode: "PATH_NOT_FOUND" })
    })
  })

  describe("create_file / delete_file", () => {
    it("create_file creates the file in both stores", async () => {
      const { executor, ctx, files, sandbox, sb } = await makeFixture()
      const result = await executor.execute(
        { id: "c1", name: "create_file", input: { path: "src/new.ts", content: "x" } },
        ctx,
      )
      expect(result).toMatchObject({ ok: true, data: { created: "src/new.ts" } })
      expect((await files.readPath(PROJECT, "src/new.ts"))!.content).toBe("x")
      expect(await sandbox.readFile(sb.id, "src/new.ts")).toBe("x")
    })

    it("create_file returns PATH_ALREADY_EXISTS on duplicate", async () => {
      const { executor, ctx, files } = await makeFixture()
      await files.createPath(PROJECT, "src/x.ts", "x", "user")
      const result = await executor.execute(
        { id: "c2", name: "create_file", input: { path: "src/x.ts", content: "y" } },
        ctx,
      )
      expect(result).toMatchObject({ ok: false, errorCode: "PATH_ALREADY_EXISTS" })
    })

    it("delete_file removes from both stores", async () => {
      const { executor, ctx, files, sandbox, sb } = await makeFixture()
      await files.createPath(PROJECT, "src/x.ts", "x", "user")
      await sandbox.writeFile(sb.id, "src/x.ts", "x")
      const result = await executor.execute(
        { id: "d1", name: "delete_file", input: { path: "src/x.ts" } },
        ctx,
      )
      expect(result).toMatchObject({ ok: true })
      expect(await files.readPath(PROJECT, "src/x.ts")).toBeNull()
    })

    it("delete_file returns PATH_NOT_FOUND when missing", async () => {
      const { executor, ctx } = await makeFixture()
      const result = await executor.execute(
        { id: "d2", name: "delete_file", input: { path: "src/missing.ts" } },
        ctx,
      )
      expect(result).toMatchObject({ ok: false, errorCode: "PATH_NOT_FOUND" })
    })
  })

  describe("list_files", () => {
    it("returns files and folders for a directory", async () => {
      const { executor, ctx, files } = await makeFixture()
      await files.createPath(PROJECT, "src/app/page.tsx", "p", "user")
      await files.createPath(PROJECT, "src/components/Button.tsx", "b", "user")
      const result = await executor.execute(
        { id: "l1", name: "list_files", input: { directory: "src/" } },
        ctx,
      )
      expect(result).toMatchObject({ ok: true })
      const data = (result as any).data
      expect(data.folders.sort()).toEqual(["src/app", "src/components"])
    })
  })

  describe("run_command", () => {
    it("rejects forbidden commands", async () => {
      const { executor, ctx } = await makeFixture()
      const result = await executor.execute(
        { id: "rc1", name: "run_command", input: { command: "sudo rm -rf /" } },
        ctx,
      )
      expect(result).toMatchObject({ ok: false, errorCode: "COMMAND_FORBIDDEN" })
    })

    it("rejects npm run dev (already running)", async () => {
      const { executor, ctx } = await makeFixture()
      const result = await executor.execute(
        { id: "rc2", name: "run_command", input: { command: "npm run dev" } },
        ctx,
      )
      expect(result).toMatchObject({ ok: false, errorCode: "COMMAND_FORBIDDEN" })
    })

    it("returns SANDBOX_DEAD when no sandbox is attached", async () => {
      const files = new InMemoryFileService()
      const sandbox = new MockSandboxProvider()
      const executor = new ToolExecutor({ files, sandbox })
      const ctx: ToolExecutionContext = { projectId: PROJECT, sandboxId: null, userId: "u" }
      const result = await executor.execute(
        { id: "rc3", name: "run_command", input: { command: "npm test" } },
        ctx,
      )
      expect(result).toMatchObject({ ok: false, errorCode: "SANDBOX_DEAD" })
    })

    it("delegates to sandbox.exec and returns the result", async () => {
      const { executor, ctx, sandbox } = await makeFixture()
      sandbox.execHandler = (cmd) =>
        cmd === "npm install lodash"
          ? { stdout: "added 1 package", stderr: "", exitCode: 0, durationMs: 1234 }
          : { stdout: "", stderr: "no", exitCode: 1, durationMs: 1 }
      const result = await executor.execute(
        { id: "rc4", name: "run_command", input: { command: "npm install lodash" } },
        ctx,
      )
      expect(result).toMatchObject({
        ok: true,
        data: expect.objectContaining({
          stdout: "added 1 package",
          exitCode: 0,
          durationMs: 1234,
        }),
      })
    })

    it("truncates stdout and stderr at 4000 chars", async () => {
      const { executor, ctx, sandbox } = await makeFixture()
      sandbox.execHandler = () => ({
        stdout: "x".repeat(5000),
        stderr: "y".repeat(5000),
        exitCode: 0,
        durationMs: 10,
      })
      const result = await executor.execute(
        { id: "rc5", name: "run_command", input: { command: "echo hi" } },
        ctx,
      )
      const data = (result as any).data
      expect(data.stdout.length).toBeLessThanOrEqual(4100)
      expect(data.stdout).toContain("[…truncated")
    })
  })

  describe("unknown tools", () => {
    it("returns INTERNAL_ERROR for an unknown tool name", async () => {
      const { executor, ctx } = await makeFixture()
      const result = await executor.execute(
        { id: "u1", name: "fly_to_mars" as never, input: {} },
        ctx,
      )
      expect(result).toMatchObject({ ok: false, errorCode: "INTERNAL_ERROR" })
    })
  })
})
