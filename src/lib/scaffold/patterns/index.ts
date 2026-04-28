/**
 * Worked-pattern library — D-042, plan E.3.
 *
 * Canonical implementations of the 6 most common UI patterns Polaris
 * agents need to build. The scaffold step copies these as `.tsx` files
 * into `/.polaris/patterns/<name>.tsx` in every new project. The
 * agent's AGENTS.md tells the model to read the relevant pattern
 * before generating its own version — this is what gives a project
 * polished, consistent UI on the first prompt.
 *
 * Each pattern is intentionally small (~50–80 lines) and self-contained.
 * They reference Praxiom Design System tokens (§1–§14) but otherwise
 * have no dependencies beyond React, Tailwind, and the project's
 * standard libs (Clerk, Convex). Each pattern's header comment
 * documents:
 *   - When to use this pattern
 *   - Tokens used (Praxiom §)
 *   - Common variants
 *
 * Authoring discipline: edit these patterns when the project's design
 * system evolves; new patterns require a Constitutional amendment
 * (Article XXI) since they shape the feel of every Polaris-built app.
 */

import { PATTERN_AUTH_FORM } from "./auth-form"
import { PATTERN_DATA_TABLE } from "./data-table"
import { PATTERN_DASHBOARD_CARDS } from "./dashboard-cards"
import { PATTERN_SETTINGS_PAGE } from "./settings-page"
import { PATTERN_EMPTY_STATE } from "./empty-state"
import { PATTERN_DATA_FETCH_PAGE } from "./data-fetch-page"

export interface ScaffoldPattern {
  /** Filename inside /.polaris/patterns/ — no leading slash. */
  filename: string
  /** Human-readable label, used in AGENTS.md. */
  label: string
  /** Full file contents as a string (TSX source). */
  content: string
}

export const PATTERNS: ScaffoldPattern[] = [
  { filename: "auth-form.tsx", label: "Auth form (Clerk sign-in/sign-up)", content: PATTERN_AUTH_FORM },
  { filename: "data-table.tsx", label: "Data table (sortable, paginated, empty state)", content: PATTERN_DATA_TABLE },
  { filename: "dashboard-cards.tsx", label: "Dashboard KPI card grid", content: PATTERN_DASHBOARD_CARDS },
  { filename: "settings-page.tsx", label: "Settings page (section/group layout)", content: PATTERN_SETTINGS_PAGE },
  { filename: "empty-state.tsx", label: "Empty state (illustration + CTA)", content: PATTERN_EMPTY_STATE },
  { filename: "data-fetch-page.tsx", label: "Data-fetching page (Convex useQuery, loading/empty/error)", content: PATTERN_DATA_FETCH_PAGE },
]

/**
 * AGENTS.md fragment listing the patterns. agents-md-template.ts can
 * append this so the agent learns to consult /.polaris/patterns/<name>
 * before inventing its own structure.
 */
export const PATTERNS_AGENTS_MD_FRAGMENT = `## UI patterns

When you need to build any of these common surfaces, read the matching
reference at \`/.polaris/patterns/<name>.tsx\` first and compose from
it. Don't invent your own structure for solved problems:

${PATTERNS.map((p) => `- \`/.polaris/patterns/${p.filename}\` — ${p.label}`).join("\n")}

These patterns embed Praxiom Design System tokens (§1–§14). If you
need a surface not listed here, check the design system before
deriving from scratch.
`
