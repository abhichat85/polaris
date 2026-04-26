import { headers } from "next/headers"

interface HealthResponse {
  ok: boolean
  checkedAt: string
  checks: { name: string; ok: boolean; ms: number; detail?: string }[]
}

async function fetchHealth(): Promise<HealthResponse | null> {
  const h = await headers()
  const host = h.get("host") ?? "localhost:3000"
  const proto = h.get("x-forwarded-proto") ?? "http"
  const url = `${proto}://${host}/api/health`
  try {
    const res = await fetch(url, { cache: "no-store" })
    return (await res.json()) as HealthResponse
  } catch {
    return null
  }
}

export const dynamic = "force-dynamic"

export default async function StatusPage() {
  const health = await fetchHealth()
  return (
    <section className="bg-surface-0">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="font-heading text-3xl font-semibold tracking-[-0.02em] text-foreground">
          System status
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Live probes refresh every 30 seconds. For incident history, see{" "}
          <a className="text-primary hover:underline" href="https://status.praxiomai.xyz">
            status.praxiomai.xyz
          </a>
          .
        </p>

        <div
          className={`mt-8 rounded-lg p-6 ${
            health?.ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
          }`}
        >
          <p className="font-heading text-lg font-semibold">
            {health?.ok ? "All systems operational" : "Degraded service"}
          </p>
          <p className="mt-1 text-sm opacity-80">
            Last checked {health?.checkedAt ?? "—"}
          </p>
        </div>

        <div className="mt-8 rounded-lg bg-surface-2 p-2">
          {(health?.checks ?? []).map((c) => (
            <div
              key={c.name}
              className="flex items-center justify-between rounded-md px-4 py-3 hover:bg-surface-3"
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={`size-2 rounded-full ${
                    c.ok ? "bg-success" : "bg-destructive"
                  }`}
                />
                <span className="text-sm font-medium capitalize text-foreground">
                  {c.name}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">{c.ms}ms</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
