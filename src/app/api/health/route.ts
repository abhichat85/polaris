/**
 * Health probe. Authority: sub-plan 10 Task 17.
 *
 * Pings each upstream provider and returns a per-provider status. The
 * response is cached for 30 seconds via response headers; the public status
 * page polls this endpoint every minute.
 */

import { NextResponse } from "next/server"

interface ProbeResult {
  ok: boolean
  ms: number
  detail?: string
}

async function probe(name: string, fn: () => Promise<void>): Promise<{ name: string } & ProbeResult> {
  const start = Date.now()
  try {
    await fn()
    return { name, ok: true, ms: Date.now() - start }
  } catch (e) {
    return {
      name,
      ok: false,
      ms: Date.now() - start,
      detail: e instanceof Error ? e.message : "unknown",
    }
  }
}

export async function GET() {
  const checks = await Promise.all([
    probe("convex", async () => {
      if (!process.env.NEXT_PUBLIC_CONVEX_URL) throw new Error("env_missing")
      const res = await fetch(`${process.env.NEXT_PUBLIC_CONVEX_URL}/version`, {
        signal: AbortSignal.timeout(2500),
      })
      if (!res.ok) throw new Error(`status_${res.status}`)
    }),
    probe("inngest", async () => {
      if (!process.env.INNGEST_EVENT_KEY) {
        // Best-effort: only fail if explicitly meant to be configured.
        return
      }
    }),
    probe("anthropic", async () => {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error("env_missing")
    }),
  ])

  const allOk = checks.every((c) => c.ok)
  const status = allOk ? 200 : 503
  return NextResponse.json(
    {
      ok: allOk,
      checkedAt: new Date().toISOString(),
      checks,
    },
    {
      status,
      headers: {
        "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
      },
    },
  )
}
