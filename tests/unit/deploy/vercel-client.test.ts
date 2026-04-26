import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { VercelClient } from "@/features/deploy/lib/vercel-client"

describe("VercelClient", () => {
  const token = "vercel_test_token"
  let client: VercelClient
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    // @ts-expect-error overriding global
    global.fetch = fetchMock
    client = new VercelClient({ token })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function ok(body: unknown) {
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }
  }

  function err(status: number, body: unknown) {
    return {
      ok: false,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }
  }

  describe("createDeployment", () => {
    it("POSTs to /v13/deployments with bearer auth and returns deployment id", async () => {
      fetchMock.mockResolvedValueOnce(
        ok({ id: "dpl_123", url: "polaris-app.vercel.app", readyState: "QUEUED" }),
      )

      const result = await client.createDeployment(
        "polaris-app",
        [{ file: "package.json", data: "{}" }],
        { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" },
      )

      expect(result.id).toBe("dpl_123")
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe("https://api.vercel.com/v13/deployments")
      expect(init.method).toBe("POST")
      expect(init.headers.Authorization).toBe(`Bearer ${token}`)
      const body = JSON.parse(init.body)
      expect(body.name).toBe("polaris-app")
      expect(body.files).toEqual([{ file: "package.json", data: "{}" }])
      expect(body.projectSettings.framework).toBe("nextjs")
    })

    it("includes env vars in the deployment payload", async () => {
      fetchMock.mockResolvedValueOnce(ok({ id: "d1", url: "x", readyState: "QUEUED" }))

      await client.createDeployment("p", [], { FOO: "bar" })

      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.env).toEqual({ FOO: "bar" })
    })

    it("throws on non-2xx response with error message", async () => {
      fetchMock.mockResolvedValueOnce(err(403, { error: { message: "forbidden" } }))
      await expect(
        client.createDeployment("p", [], {}),
      ).rejects.toThrow(/forbidden/)
    })
  })

  describe("getDeploymentStatus", () => {
    it("GETs /v13/deployments/:id and returns readyState", async () => {
      fetchMock.mockResolvedValueOnce(
        ok({ id: "dpl_1", readyState: "READY", url: "live.vercel.app" }),
      )
      const status = await client.getDeploymentStatus("dpl_1")
      expect(status.readyState).toBe("READY")
      expect(status.url).toBe("live.vercel.app")
      const [url] = fetchMock.mock.calls[0]
      expect(url).toBe("https://api.vercel.com/v13/deployments/dpl_1")
    })
  })

  describe("getProject", () => {
    it("returns project on 200", async () => {
      fetchMock.mockResolvedValueOnce(ok({ id: "prj_1", name: "polaris-app" }))
      const project = await client.getProject("polaris-app")
      expect(project?.id).toBe("prj_1")
    })

    it("returns null on 404", async () => {
      fetchMock.mockResolvedValueOnce(err(404, { error: { code: "not_found" } }))
      const project = await client.getProject("missing")
      expect(project).toBeNull()
    })
  })

  describe("createProject", () => {
    it("POSTs /v9/projects with framework", async () => {
      fetchMock.mockResolvedValueOnce(ok({ id: "prj_2", name: "p" }))
      const project = await client.createProject("p", "nextjs")
      expect(project.id).toBe("prj_2")
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe("https://api.vercel.com/v9/projects")
      const body = JSON.parse(init.body)
      expect(body.name).toBe("p")
      expect(body.framework).toBe("nextjs")
    })
  })
})
