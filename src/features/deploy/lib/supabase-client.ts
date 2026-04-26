/**
 * Supabase Management API client. Authority: sub-plan 07.
 *
 * Wraps https://api.supabase.com/v1/projects. Caller provides token + org id
 * (read from `process.env.SUPABASE_MANAGEMENT_API_KEY` / `SUPABASE_ORG_ID`).
 *
 * Never logs the token or db password. Non-2xx responses raise with the API's
 * `message` field if present.
 */

const SUPABASE_API = "https://api.supabase.com"

export type SupabaseProjectStatus =
  | "COMING_UP"
  | "ACTIVE_HEALTHY"
  | "INACTIVE"
  | "PAUSED"
  | "REMOVED"
  | "RESTORING"
  | "UNKNOWN"

export interface SupabaseProject {
  id: string
  name: string
  status: SupabaseProjectStatus
}

export interface SupabaseApiKeys {
  anon: string
  serviceRole: string
}

export interface SupabaseManagementClientDeps {
  token: string
  orgId: string
  fetchImpl?: typeof fetch
}

export class SupabaseManagementClient {
  private readonly token: string
  private readonly orgId: string
  private readonly fetchImpl: typeof fetch

  constructor(deps: SupabaseManagementClientDeps) {
    this.token = deps.token
    this.orgId = deps.orgId
    this.fetchImpl = deps.fetchImpl ?? fetch
  }

  async createProject(
    name: string,
    region: string,
    dbPassword: string,
  ): Promise<SupabaseProject> {
    const body = {
      organization_id: this.orgId,
      name,
      region,
      db_pass: dbPassword,
      plan: "free",
    }
    const res = await this.request("POST", "/v1/projects", body)
    return {
      id: res.id,
      name: res.name,
      status: (res.status ?? "COMING_UP") as SupabaseProjectStatus,
    }
  }

  async getProject(ref: string): Promise<SupabaseProject | null> {
    const res = await this.requestRaw("GET", `/v1/projects/${ref}`)
    if (res.status === 404) return null
    if (!res.ok) await this.throwFromResponse(res)
    const body = await res.json()
    return {
      id: body.id,
      name: body.name,
      status: (body.status ?? "UNKNOWN") as SupabaseProjectStatus,
    }
  }

  async runSQL(ref: string, query: string): Promise<unknown> {
    return this.request("POST", `/v1/projects/${ref}/database/query`, { query })
  }

  async getApiKeys(ref: string): Promise<SupabaseApiKeys> {
    const res = await this.request("GET", `/v1/projects/${ref}/api-keys`)
    const list = Array.isArray(res) ? res : []
    const anon = list.find((k: { name: string }) => k.name === "anon")?.api_key
    const serviceRole = list.find(
      (k: { name: string }) => k.name === "service_role",
    )?.api_key
    if (!anon || !serviceRole) {
      throw new Error(
        "Supabase API did not return both anon and service_role keys",
      )
    }
    return { anon, serviceRole }
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private async request(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<any> {
    const res = await this.requestRaw(method, path, body)
    if (!res.ok) await this.throwFromResponse(res)
    return res.json()
  }

  private requestRaw(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<Response> {
    return this.fetchImpl(`${SUPABASE_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  }

  private async throwFromResponse(res: Response): Promise<never> {
    let message = `Supabase API ${res.status}`
    try {
      const body = await res.json()
      if (body?.message) message = body.message
      else if (body?.error) message = body.error
    } catch {
      // ignore
    }
    throw new Error(message)
  }
}
