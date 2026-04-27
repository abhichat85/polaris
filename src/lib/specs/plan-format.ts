/**
 * D-026 — canonical plan format. Round-trips between:
 *
 *   - Convex `specs.features` typed array (the structured store)
 *   - `/docs/plan.md` markdown checklist (what the agent + user read/edit)
 *
 * Both representations carry the same data. The markdown form is human-
 * editable; the Convex form drives the UI checklist + status filters.
 *
 * Format spec (markdown):
 *
 *   # <Title>
 *
 *   ## Sprint 1: <Sprint name>
 *   - [ ] feature-id: <Feature title> [p0]
 *         <description>
 *         Acceptance:
 *           - <acceptance criterion 1>
 *           - <acceptance criterion 2>
 *
 *   ## Sprint 2: <Sprint name>
 *   ...
 *
 * Status mapping:
 *   - [ ]  = todo
 *   - [/]  = in_progress
 *   - [x]  = done
 *   - [!]  = blocked
 */

export type FeatureStatus = "todo" | "in_progress" | "done" | "blocked"
export type Priority = "p0" | "p1" | "p2"

export interface PlanFeature {
  id: string
  title: string
  description: string
  acceptanceCriteria: string[]
  status: FeatureStatus
  priority: Priority
  sprint: number
  /** Optional Praxiom evidence IDs for spec-driven traceability. */
  praxiomEvidenceIds?: string[]
}

export interface Plan {
  title: string
  sprints: Array<{ index: number; name: string; features: PlanFeature[] }>
}

const STATUS_BOX: Record<FeatureStatus, string> = {
  todo: "[ ]",
  in_progress: "[/]",
  done: "[x]",
  blocked: "[!]",
}

const BOX_STATUS: Record<string, FeatureStatus> = {
  "[ ]": "todo",
  "[x]": "done",
  "[X]": "done",
  "[/]": "in_progress",
  "[~]": "in_progress",
  "[!]": "blocked",
}

export function serializePlan(plan: Plan): string {
  const lines: string[] = []
  lines.push(`# ${plan.title}`)
  lines.push("")
  for (const sprint of plan.sprints) {
    lines.push(`## Sprint ${sprint.index}: ${sprint.name}`)
    lines.push("")
    for (const f of sprint.features) {
      const box = STATUS_BOX[f.status]
      lines.push(`- ${box} ${f.id}: ${f.title} [${f.priority}]`)
      if (f.description.trim().length > 0) {
        lines.push(`      ${f.description.trim()}`)
      }
      if (f.acceptanceCriteria.length > 0) {
        lines.push("      Acceptance:")
        for (const c of f.acceptanceCriteria) {
          lines.push(`        - ${c}`)
        }
      }
      lines.push("")
    }
  }
  return lines.join("\n").trimEnd() + "\n"
}

// Accept any single char inside [ ] — falls back to "todo" on unknown.
const FEATURE_RE =
  /^[-*]\s+(\[[^\]]\])\s+([a-z0-9][a-z0-9-]{1,40}):\s*(.+?)(?:\s+\[(p[012])\])?\s*$/

export function parsePlan(md: string): Plan {
  const lines = md.replace(/\r\n/g, "\n").split("\n")
  let title = "Untitled plan"
  const sprints: Plan["sprints"] = []
  let currentSprint: Plan["sprints"][number] | null = null
  let currentFeature: PlanFeature | null = null
  let inAcceptance = false

  const flushFeature = () => {
    if (currentFeature && currentSprint) {
      currentSprint.features.push(currentFeature)
    }
    currentFeature = null
    inAcceptance = false
  }
  const flushSprint = () => {
    flushFeature()
    if (currentSprint) sprints.push(currentSprint)
    currentSprint = null
  }

  for (const raw of lines) {
    const line = raw

    // Title.
    const titleMatch = /^#\s+(.+?)\s*$/.exec(line)
    if (titleMatch && sprints.length === 0 && !currentSprint) {
      title = titleMatch[1]
      continue
    }

    // Sprint header.
    const sprintMatch = /^##\s+Sprint\s+(\d+):\s*(.+?)\s*$/i.exec(line)
    if (sprintMatch) {
      flushSprint()
      currentSprint = {
        index: parseInt(sprintMatch[1], 10),
        name: sprintMatch[2],
        features: [],
      }
      continue
    }

    // Feature row.
    const m = FEATURE_RE.exec(line)
    if (m && currentSprint) {
      flushFeature()
      const [, box, id, titleField, prio] = m
      currentFeature = {
        id,
        title: titleField.trim(),
        description: "",
        acceptanceCriteria: [],
        status: BOX_STATUS[box] ?? "todo",
        priority: (prio as Priority | undefined) ?? "p1",
        sprint: currentSprint.index,
      }
      continue
    }

    if (currentFeature) {
      const acceptanceHeader = /^\s+Acceptance:\s*$/.exec(line)
      if (acceptanceHeader) {
        inAcceptance = true
        continue
      }
      const bulletMatch = /^\s+-\s+(.+?)\s*$/.exec(line)
      if (bulletMatch && inAcceptance) {
        currentFeature.acceptanceCriteria.push(bulletMatch[1])
        continue
      }
      // Indented description line.
      if (line.startsWith("    ") && line.trim().length > 0 && !inAcceptance) {
        currentFeature.description = currentFeature.description
          ? currentFeature.description + " " + line.trim()
          : line.trim()
      }
    }
  }
  flushSprint()

  return { title, sprints }
}

/** Helper: flatten all features in sprint order. */
export function allFeatures(plan: Plan): PlanFeature[] {
  return plan.sprints.flatMap((s) => s.features)
}

/** Helper: feature by id. */
export function findFeature(plan: Plan, id: string): PlanFeature | null {
  for (const s of plan.sprints) {
    const f = s.features.find((x) => x.id === id)
    if (f) return f
  }
  return null
}

/** Helper: progress as `done / total`. */
export function planProgress(plan: Plan): { done: number; total: number } {
  const all = allFeatures(plan)
  return { done: all.filter((f) => f.status === "done").length, total: all.length }
}
