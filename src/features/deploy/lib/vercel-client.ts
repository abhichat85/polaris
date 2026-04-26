/**
 * Vercel REST client. Authority: sub-plan 07.
 *
 * Thin wrapper over https://api.vercel.com — uses fetch directly so we don't
 * pull in the official SDK. Token is provided by caller (read from
 * `process.env.VERCEL_TOKEN` at call sites).
 *
 * Never logs the token. All non-2xx responses raise with the API's error
 * message attached.
 */

const VERCEL_API = "https://api.vercel.com"

export interface VercelFile {
  /** POSIX path relative to project root, e.g. "src/app/page.tsx". */
  file: string
  /** UTF-8 contents (we don't currently support binary blob uploads). */
  data: string
}

export interface VercelDeployment {
  id: string
  url: string
  readyState: VercelReadyState
}

export type VercelReadyState =
  | "QUEUED"
  | "INITIALIZING"
  | "BUILDING"
  | "READY"
  | "ERROR"
  | "CANCELED"

export interface VercelProject {
  id: string
  name: string
}

export interface VercelClientDeps {
  token: string
  /** Optional override for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch
}

export class VercelClient {
  private readonly token: string
  private readonly fetchImpl: typeof fetch

  constructor(deps: VercelClientDeps) {
    this.token = deps.token
    this.fetchImpl = deps.fetchImpl ?? fetch
  }

  async createDeployment(
    projectName: string,
    files: VercelFile[],
    envVars: Record<string, string>,
  ): Promise<VercelDeployment> {
    const body = {
      name: projectName,
      files,
      env: envVars,
      projectSettings: { framework: "nextjs" },
      target: "production",
    }
    const res = await this.request("POST", "/v13/deployments", body)
    return {
      id: res.id,
      url: res.url,
      readyState: (res.readyState ?? "QUEUED") as VercelReadyState,
    }
  }

  async getDeploymentStatus(deploymentId: string): Promise<VercelDeployment> {
    const res = await this.request("GET", `/v13/deployments/${deploymentId}`)
    return {
      id: res.id,
      url: res.url,
      readyState: (res.readyState ?? "QUEUED") as VercelReadyState,
    }
  }

  async getProject(name: string): Promise<VercelProject | null> {
    const res = await this.requestRaw(
      "GET",
      `/v9/projects/${encodeURIComponent(name)}`,
    )
    if (res.status === 404) return null
    if (!res.ok) await this.throwFromResponse(res)
    const body = await res.json()
    return { id: body.id, name: body.name }
  }

  async createProject(
    name: string,
    framework: "nextjs" = "nextjs",
  ): Promise<VercelProject> {
    const res = await this.request("POST", "/v9/projects", { name, framework })
    return { id: res.id, name: res.name }
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
    return this.fetchImpl(`${VERCEL_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  }

  private async throwFromResponse(res: Response): Promise<never> {
    let message = `Vercel API ${res.status}`
    try {
      const body = await res.json()
      if (body?.error?.message) message = body.error.message
      else if (body?.error?.code) message = body.error.code
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(message)
  }
}
