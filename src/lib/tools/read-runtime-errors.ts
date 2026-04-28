/**
 * D-045 — `read_runtime_errors` tool implementation.
 *
 * Pure async function that fetches unconsumed runtime errors for the
 * project and (optionally) marks them consumed. The executor wires
 * this with a Convex client adapter.
 *
 * Returns formatted text suitable for direct injection into a tool
 * result. Empty input → "No runtime errors." (not an error — that's
 * the desired state).
 */

export interface RuntimeErrorRow {
  _id: string
  kind:
    | "error"
    | "unhandled_rejection"
    | "console_error"
    | "network_error"
    | "react_error_boundary"
  message: string
  stack?: string
  url?: string
  componentStack?: string
  timestamp: number
  count?: number
}

export interface ReadRuntimeErrorsArgs {
  /** Optional cutoff: only return errors at or after this timestamp.
   * Default: now - 60s. */
  since?: number
  /** Mark these errors as seen so subsequent calls skip them. Default true. */
  markConsumed?: boolean
}

export interface ReadRuntimeErrorsDeps {
  list: (args: { since?: number }) => Promise<RuntimeErrorRow[]>
  markConsumed: (ids: string[]) => Promise<void>
  /** Test seam — defaults to Date.now(). */
  now?: () => number
}

export interface ReadRuntimeErrorsResult {
  count: number
  formatted: string
  /** Ids that were marked consumed (empty if markConsumed=false). */
  consumed: string[]
}

export async function readRuntimeErrors(
  args: ReadRuntimeErrorsArgs,
  deps: ReadRuntimeErrorsDeps,
): Promise<ReadRuntimeErrorsResult> {
  const now = (deps.now ?? Date.now)()
  const since = args.since ?? now - 60_000
  const rows = await deps.list({ since })
  const markConsumed = args.markConsumed ?? true

  if (rows.length === 0) {
    return {
      count: 0,
      formatted:
        "No runtime errors since the last check. The preview app appears healthy.",
      consumed: [],
    }
  }

  const lines: string[] = []
  lines.push(
    `${rows.length} runtime error${rows.length === 1 ? "" : "s"} captured from the preview app:`,
  )
  lines.push("")
  for (const r of rows) {
    const ageSec = Math.max(0, Math.round((now - r.timestamp) / 1000))
    const dupeNote = r.count && r.count > 1 ? ` ×${r.count}` : ""
    const urlNote = r.url ? `  (${r.url})` : ""
    lines.push(`[${r.kind}${dupeNote}] ${truncate(r.message, 240)}${urlNote}`)
    if (r.stack) {
      lines.push(`  ${truncate(firstStackFrame(r.stack), 200)}`)
    }
    if (r.componentStack) {
      lines.push(`  in ${truncate(firstStackFrame(r.componentStack), 200)}`)
    }
    lines.push(`  ${ageSec}s ago`)
  }

  let consumed: string[] = []
  if (markConsumed) {
    consumed = rows.map((r) => r._id)
    await deps.markConsumed(consumed)
  }

  return {
    count: rows.length,
    formatted: lines.join("\n"),
    consumed,
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max) + "…"
}

function firstStackFrame(stack: string): string {
  // Skip the leading "Error: foo" header line; keep the first frame.
  for (const line of stack.split("\n")) {
    const trimmed = line.trim()
    if (trimmed.startsWith("at ")) return trimmed
  }
  return stack.split("\n")[0]
}
