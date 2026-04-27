/**
 * Doc-gardener drift detection — Wave 4.2.
 *
 * Pure function so it can be unit-tested without Convex. The Inngest
 * function loads project state, hands it here, then surfaces findings
 * back to the project's primary conversation.
 *
 * What we look for (intentionally narrow — false-positive cost is high
 * because the user sees these as chat messages):
 *   - Missing `/AGENTS.md` (D-030 — every project should have one)
 *   - Missing `/.polaris/notes.md` (D-027 — durable scratchpad)
 *   - Plan features stuck in `in_progress` for > 14 days (likely abandoned)
 *   - Plan features whose acceptance criteria mention paths that don't
 *     exist anymore (handled separately when filesystem is wired in)
 */

export type DriftSeverity = "info" | "warning"

export interface DriftNotice {
  severity: DriftSeverity
  /** Stable id so the UI can dedupe across runs. */
  id: string
  message: string
  /** Optional remediation hint the agent can pick up. */
  remediation?: string
}

export interface DriftInput {
  agentsMdContent: string | null
  notesMdContent: string | null
  features: Array<{
    id: string
    status: "todo" | "in_progress" | "done" | "blocked"
    /** ms since epoch — when this feature's status was last touched. */
    updatedAt?: number
  }>
  /** Project mtime (newest convex doc/file change). For activity gating. */
  lastActivityAt: number
  now: number
  /** How long an `in_progress` feature can sit untouched before flagging. */
  staleAfterMs?: number
}

export interface DriftFindings {
  notices: DriftNotice[]
  /** True when nothing is amiss. UI may suppress the assistant message. */
  clean: boolean
}

const DEFAULT_STALE_MS = 14 * 24 * 60 * 60 * 1000

export function detectDrift(input: DriftInput): DriftFindings {
  const notices: DriftNotice[] = []
  const staleAfter = input.staleAfterMs ?? DEFAULT_STALE_MS

  if (input.agentsMdContent == null) {
    notices.push({
      severity: "warning",
      id: "missing-agents-md",
      message:
        "No `/AGENTS.md` found. Without it, every new agent run rediscovers your codebase from scratch.",
      remediation:
        "Have Polaris generate one: ask `Create AGENTS.md describing this project's structure, conventions, and locked files.`",
    })
  } else if (input.agentsMdContent.trim().length < 80) {
    notices.push({
      severity: "info",
      id: "agents-md-too-short",
      message:
        "`/AGENTS.md` exists but is very short. Consider adding architecture notes, conventions, and locked files.",
    })
  }

  if (input.notesMdContent == null) {
    notices.push({
      severity: "info",
      id: "missing-notes-md",
      message:
        "No `/.polaris/notes.md` scratchpad. The agent will start fresh every session.",
      remediation:
        "Polaris will create one as it works — no action needed unless you want to seed it manually.",
    })
  }

  for (const f of input.features) {
    if (f.status !== "in_progress") continue
    const age = input.now - (f.updatedAt ?? input.lastActivityAt ?? input.now)
    if (age > staleAfter) {
      const days = Math.round(age / (24 * 60 * 60 * 1000))
      notices.push({
        severity: "warning",
        id: `stale-feature:${f.id}`,
        message: `Feature \`${f.id}\` has been \`in_progress\` for ~${days} days.`,
        remediation:
          "Either resume work, mark it `blocked` with a reason, or `done` if it actually shipped.",
      })
    }
  }

  return { notices, clean: notices.length === 0 }
}

/**
 * Render a single chat message body summarising findings. Caller posts
 * it as an assistant message in the project's primary conversation.
 */
export function renderDriftReport(findings: DriftFindings): string {
  if (findings.clean) {
    return "Doc-gardener: no drift detected. Project docs are fresh."
  }
  const lines: string[] = ["**Doc-gardener notice**", ""]
  for (const n of findings.notices) {
    const tag = n.severity === "warning" ? "⚠️" : "ℹ️"
    lines.push(`${tag} ${n.message}`)
    if (n.remediation) lines.push(`   → ${n.remediation}`)
    lines.push("")
  }
  lines.push(
    "_Sent by the daily doc-gardener (paid tier). Reply to this thread to act on any of these._",
  )
  return lines.join("\n")
}
