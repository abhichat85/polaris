import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { SupabaseManagementClient } from "@/features/deploy/lib/supabase-client"

describe("SupabaseManagementClient", () => {
  const token = "sbp_test_token"
  const orgId = "org_xyz"
  let client: SupabaseManagementClient
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    // @ts-expect-error overriding global
    global.fetch = fetchMock
    client = new SupabaseManagementClient({ token, orgId })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function ok(body: unknown, status = 200) {
    return {
      ok: true,
      status,
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

  describe("createProject", () => {
    it("POSTs /v1/projects with org id and db_pass", async () => {
      fetchMock.mockResolvedValueOnce(
        ok({ id: "ref123", name: "polaris-app", status: "COMING_UP" }),
      )

      const project = await client.createProject(
        "polaris-app",
        "us-east-1",
        "S3cret!",
      )

      expect(project.id).toBe("ref123")
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe("https://api.supabase.com/v1/projects")
      expect(init.method).toBe("POST")
      expect(init.headers.Authorization).toBe(`Bearer ${token}`)
      const body = JSON.parse(init.body)
      expect(body.organization_id).toBe(orgId)
      expect(body.name).toBe("polaris-app")
      expect(body.region).toBe("us-east-1")
      expect(body.db_pass).toBe("S3cret!")
    })

    it("throws on non-2xx with API message", async () => {
      fetchMock.mockResolvedValueOnce(err(400, { message: "invalid region" }))
      await expect(
        client.createProject("p", "moon-1", "x"),
      ).rejects.toThrow(/invalid region/)
    })
  })

  describe("getProject", () => {
    it("returns project when found", async () => {
      fetchMock.mockResolvedValueOnce(
        ok({ id: "ref1", name: "p", status: "ACTIVE_HEALTHY" }),
      )
      const project = await client.getProject("ref1")
      expect(project?.status).toBe("ACTIVE_HEALTHY")
      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://api.supabase.com/v1/projects/ref1",
      )
    })

    it("returns null on 404", async () => {
      fetchMock.mockResolvedValueOnce(err(404, { message: "not found" }))
      expect(await client.getProject("missing")).toBeNull()
    })
  })

  describe("runSQL", () => {
    it("POSTs to /database/query with the SQL body", async () => {
      fetchMock.mockResolvedValueOnce(ok([{ ok: 1 }]))
      const out = await client.runSQL("ref1", "select 1;")
      expect(out).toEqual([{ ok: 1 }])
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe("https://api.supabase.com/v1/projects/ref1/database/query")
      expect(init.method).toBe("POST")
      const body = JSON.parse(init.body)
      expect(body.query).toBe("select 1;")
    })
  })

  describe("getApiKeys", () => {
    it("returns anon and service_role keys", async () => {
      fetchMock.mockResolvedValueOnce(
        ok([
          { name: "anon", api_key: "anon_xxx" },
          { name: "service_role", api_key: "service_xxx" },
        ]),
      )
      const keys = await client.getApiKeys("ref1")
      expect(keys.anon).toBe("anon_xxx")
      expect(keys.serviceRole).toBe("service_xxx")
      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://api.supabase.com/v1/projects/ref1/api-keys",
      )
    })

    it("throws when expected keys are missing", async () => {
      fetchMock.mockResolvedValueOnce(ok([{ name: "anon", api_key: "a" }]))
      await expect(client.getApiKeys("ref1")).rejects.toThrow(/service_role/)
    })
  })
})
