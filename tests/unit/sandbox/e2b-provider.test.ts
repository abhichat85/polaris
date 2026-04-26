/**
 * E2BSandboxProvider tests. The `@e2b/code-interpreter` SDK is mocked so we
 * can exercise every translation rule (POSIX paths, defaulting, error mapping)
 * without an E2B account.
 *
 * Authority: CONSTITUTION §6.2 (interface contract), §14.5 (perf budgets) —
 * exercised here only via the structural surface; production budget checks
 * land in sub-plan 09 (Hardening).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

interface MockE2BSandbox {
  sandboxId: string
  files: {
    write: ReturnType<typeof vi.fn>
    read: ReturnType<typeof vi.fn>
    list: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
  }
  commands: {
    run: ReturnType<typeof vi.fn>
  }
  getHost: ReturnType<typeof vi.fn>
  kill: ReturnType<typeof vi.fn>
  isRunning: ReturnType<typeof vi.fn>
}

function makeMockE2B(id = "abc"): MockE2BSandbox {
  return {
    sandboxId: id,
    files: {
      write: vi.fn().mockResolvedValue(undefined),
      read: vi.fn().mockResolvedValue(""),
      list: vi.fn().mockResolvedValue([]),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    commands: {
      run: vi.fn().mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 }),
    },
    getHost: vi.fn().mockReturnValue(`3000-${id}.e2b.dev`),
    kill: vi.fn().mockResolvedValue(undefined),
    isRunning: vi.fn().mockResolvedValue(true),
  }
}

let mockE2B = makeMockE2B()

vi.mock("@e2b/code-interpreter", () => ({
  Sandbox: {
    create: vi.fn(async () => mockE2B),
    connect: vi.fn(async () => mockE2B),
  },
}))

import { E2BSandboxProvider, SandboxDeadError } from "@/lib/sandbox/e2b-provider"
import { Sandbox as E2B } from "@e2b/code-interpreter"

beforeEach(() => {
  vi.clearAllMocks()
  mockE2B = makeMockE2B()
  ;(E2B.create as ReturnType<typeof vi.fn>).mockImplementation(async () => mockE2B)
  ;(E2B.connect as ReturnType<typeof vi.fn>).mockImplementation(async () => mockE2B)
})

describe("E2BSandboxProvider", () => {
  const provider = new E2BSandboxProvider({ apiKey: "test-key" })

  describe("create", () => {
    it("provisions a sandbox with the requested template", async () => {
      const h = await provider.create("nextjs-supabase", {})
      expect(E2B.create).toHaveBeenCalledWith(
        "nextjs-supabase",
        expect.objectContaining({ apiKey: "test-key" }),
      )
      expect(h.id).toBe("abc")
      expect(typeof h.createdAt).toBe("number")
    })

    it("forwards timeoutMs and metadata", async () => {
      await provider.create("nextjs-supabase", {
        timeoutMs: 60_000,
        metadata: { projectId: "p1" },
      })
      expect(E2B.create).toHaveBeenCalledWith(
        "nextjs-supabase",
        expect.objectContaining({
          timeoutMs: 60_000,
          metadata: expect.objectContaining({ projectId: "p1" }),
        }),
      )
    })

    it("defaults timeoutMs to 24h when omitted", async () => {
      await provider.create("nextjs-supabase", {})
      const call = (E2B.create as ReturnType<typeof vi.fn>).mock.calls[0]!
      expect(call[1].timeoutMs).toBe(24 * 60 * 60 * 1000)
    })
  })

  describe("writeFile", () => {
    it("normalizes leading slash and writes via files.write", async () => {
      await provider.writeFile("abc", "/src/app/page.tsx", "X")
      expect(mockE2B.files.write).toHaveBeenCalledWith("/src/app/page.tsx", "X")
    })

    it("normalizes a relative path to leading-slash POSIX", async () => {
      await provider.writeFile("abc", "deeply/nested/new/file.ts", "Y")
      expect(mockE2B.files.write).toHaveBeenCalledWith("/deeply/nested/new/file.ts", "Y")
    })

    it("throws SandboxDeadError when SDK reports sandbox-not-found", async () => {
      mockE2B.files.write.mockRejectedValueOnce(new Error("sandbox not found"))
      await expect(provider.writeFile("abc", "src/x.ts", "z")).rejects.toBeInstanceOf(
        SandboxDeadError,
      )
    })
  })

  describe("readFile", () => {
    it("returns string content", async () => {
      mockE2B.files.read.mockResolvedValueOnce("hello")
      expect(await provider.readFile("abc", "src/x.ts")).toBe("hello")
    })
  })

  describe("listFiles", () => {
    it("returns POSIX paths from E2B entries", async () => {
      mockE2B.files.list.mockResolvedValueOnce([
        { name: "page.tsx", path: "/src/app/page.tsx", type: "file" },
        { name: "layout.tsx", path: "/src/app/layout.tsx", type: "file" },
      ])
      expect(await provider.listFiles("abc", "/src/app")).toEqual([
        "/src/app/page.tsx",
        "/src/app/layout.tsx",
      ])
    })
  })

  describe("deleteFile", () => {
    it("calls files.remove with the POSIX path", async () => {
      await provider.deleteFile("abc", "src/x.ts")
      expect(mockE2B.files.remove).toHaveBeenCalledWith("/src/x.ts")
    })

    it("maps sandbox-expired errors to SandboxDeadError", async () => {
      mockE2B.files.remove.mockRejectedValueOnce(new Error("sandbox expired"))
      await expect(provider.deleteFile("abc", "src/x.ts")).rejects.toBeInstanceOf(
        SandboxDeadError,
      )
    })
  })

  describe("exec", () => {
    it("returns stdout/stderr/exitCode/durationMs", async () => {
      mockE2B.commands.run.mockResolvedValueOnce({
        stdout: "ok\n",
        stderr: "",
        exitCode: 0,
      })
      const r = await provider.exec("abc", "echo ok")
      expect(r.stdout).toBe("ok\n")
      expect(r.exitCode).toBe(0)
      expect(r.durationMs).toBeGreaterThanOrEqual(0)
    })

    it("applies a 60s default timeout", async () => {
      await provider.exec("abc", "true")
      expect(mockE2B.commands.run).toHaveBeenCalledWith(
        "true",
        expect.objectContaining({ timeoutMs: 60_000 }),
      )
    })

    it("forwards explicit cwd and timeoutMs", async () => {
      await provider.exec("abc", "ls", { cwd: "/app", timeoutMs: 5_000 })
      expect(mockE2B.commands.run).toHaveBeenCalledWith(
        "ls",
        expect.objectContaining({ cwd: "/app", timeoutMs: 5_000 }),
      )
    })
  })

  describe("execDetached", () => {
    it("runs command in background mode and returns the pid", async () => {
      mockE2B.commands.run.mockResolvedValueOnce({ pid: 1234 })
      const r = await provider.execDetached("abc", "npm run dev", { cwd: "/" })
      expect(mockE2B.commands.run).toHaveBeenCalledWith(
        "npm run dev",
        expect.objectContaining({ background: true, cwd: "/" }),
      )
      expect(r.pid).toBe(1234)
    })

    it("throws when the SDK does not return a pid", async () => {
      mockE2B.commands.run.mockResolvedValueOnce({})
      await expect(provider.execDetached("abc", "x")).rejects.toThrow(/pid/)
    })
  })

  describe("getPreviewUrl", () => {
    it("calls getHost(port) and prepends https://", async () => {
      const url = await provider.getPreviewUrl("abc", 3000)
      expect(mockE2B.getHost).toHaveBeenCalledWith(3000)
      expect(url).toBe("https://3000-abc.e2b.dev")
    })
  })

  describe("isAlive", () => {
    it("returns false when connect rejects", async () => {
      ;(E2B.connect as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("not found"))
      expect(await provider.isAlive("ghost")).toBe(false)
    })

    it("returns true when sandbox is reachable and isRunning", async () => {
      expect(await provider.isAlive("abc")).toBe(true)
    })

    it("returns false when isRunning resolves false", async () => {
      mockE2B.isRunning.mockResolvedValueOnce(false)
      expect(await provider.isAlive("abc")).toBe(false)
    })
  })

  describe("kill", () => {
    it("invokes underlying kill", async () => {
      await provider.kill("abc")
      expect(mockE2B.kill).toHaveBeenCalled()
    })
  })

  it("name is 'e2b'", () => {
    expect(provider.name).toBe("e2b")
  })

  it("constructor rejects an empty apiKey", () => {
    expect(() => new E2BSandboxProvider({ apiKey: "" })).toThrow(/apiKey/)
  })
})
