import { describe, it, expect, beforeEach } from "vitest"
import { InMemoryFileService } from "@/lib/files/in-memory-file-service"
import type { FileService } from "@/lib/files/types"

describe("InMemoryFileService implements FileService", () => {
  let svc: FileService
  const projectId = "proj_1"

  beforeEach(() => {
    svc = new InMemoryFileService()
  })

  describe("readPath", () => {
    it("returns null for a non-existent path", async () => {
      expect(await svc.readPath(projectId, "src/missing.ts")).toBeNull()
    })

    it("returns the file content for an existing path", async () => {
      await svc.createPath(projectId, "src/x.ts", "const x = 1", "user")
      const file = await svc.readPath(projectId, "src/x.ts")
      expect(file).not.toBeNull()
      expect(file!.content).toBe("const x = 1")
    })

    it("isolates files by projectId", async () => {
      await svc.createPath("proj_a", "src/x.ts", "A", "user")
      await svc.createPath("proj_b", "src/x.ts", "B", "user")
      expect((await svc.readPath("proj_a", "src/x.ts"))!.content).toBe("A")
      expect((await svc.readPath("proj_b", "src/x.ts"))!.content).toBe("B")
    })
  })

  describe("writePath", () => {
    it("overwrites an existing file", async () => {
      await svc.createPath(projectId, "src/x.ts", "old", "user")
      await svc.writePath(projectId, "src/x.ts", "new", "agent")
      expect((await svc.readPath(projectId, "src/x.ts"))!.content).toBe("new")
    })

    it("throws when the path does not exist (use createPath)", async () => {
      await expect(svc.writePath(projectId, "src/missing.ts", "x", "agent")).rejects.toThrow(
        /not found/i,
      )
    })

    it("records updatedBy", async () => {
      await svc.createPath(projectId, "src/x.ts", "x", "user")
      await svc.writePath(projectId, "src/x.ts", "y", "agent")
      const file = await svc.readPath(projectId, "src/x.ts")
      expect(file!.updatedBy).toBe("agent")
    })
  })

  describe("createPath", () => {
    it("creates a new file", async () => {
      await svc.createPath(projectId, "src/new.ts", "new", "user")
      const file = await svc.readPath(projectId, "src/new.ts")
      expect(file!.content).toBe("new")
    })

    it("throws when the path already exists", async () => {
      await svc.createPath(projectId, "src/x.ts", "x", "user")
      await expect(svc.createPath(projectId, "src/x.ts", "y", "user")).rejects.toThrow(
        /already exists/i,
      )
    })
  })

  describe("deletePath", () => {
    it("removes the file", async () => {
      await svc.createPath(projectId, "src/x.ts", "x", "user")
      await svc.deletePath(projectId, "src/x.ts")
      expect(await svc.readPath(projectId, "src/x.ts")).toBeNull()
    })

    it("throws on missing path", async () => {
      await expect(svc.deletePath(projectId, "src/missing.ts")).rejects.toThrow(/not found/i)
    })
  })

  describe("listPath", () => {
    beforeEach(async () => {
      await svc.createPath(projectId, "src/app/page.tsx", "p", "user")
      await svc.createPath(projectId, "src/app/layout.tsx", "l", "user")
      await svc.createPath(projectId, "src/components/Button.tsx", "b", "user")
      await svc.createPath(projectId, "package.json", "{}", "user")
    })

    it("lists immediate children of a directory", async () => {
      const result = await svc.listPath(projectId, "src/app/")
      expect(result.files.sort()).toEqual(["src/app/layout.tsx", "src/app/page.tsx"])
    })

    it("lists nested folder names as folders, not files", async () => {
      const result = await svc.listPath(projectId, "src/")
      expect(result.folders.sort()).toEqual(["src/app", "src/components"])
      expect(result.files).toEqual([])
    })

    it("lists root with '/' directory", async () => {
      const result = await svc.listPath(projectId, "/")
      expect(result.files).toContain("package.json")
      expect(result.folders).toContain("src")
    })
  })
})
