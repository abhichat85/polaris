export const PATTERN_DASHBOARD_CARDS = `/**
 * Pattern: Dashboard KPI card grid.
 *
 * When to use: a /dashboard or /home overview page summarizing 3–8
 * top-line metrics. For >8 cards, switch to a multi-section dashboard
 * with category headers.
 *
 * Tokens used (Praxiom):
 *   §3 (color), §4 (radius), §6 (spacing), §8 (typography),
 *   §12 (delta-arrows: green for positive, red for negative)
 *
 * Variants:
 *   - With/without sparklines (pass \`series\` to enable)
 *   - With/without delta vs prior period (pass \`prior\` to enable)
 */
"use client"

export interface KpiCard {
  label: string
  value: string | number
  /** Prior-period value for delta computation. */
  prior?: number
  /** Tiny inline trend; agent should compute from a recent window. */
  series?: number[]
}

export function DashboardCardGrid({ cards }: { cards: KpiCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cards.map((c) => {
        const delta = c.prior !== undefined && typeof c.value === "number"
          ? ((c.value - c.prior) / Math.max(1, c.prior)) * 100
          : null
        const positive = delta !== null && delta >= 0
        return (
          <div
            key={c.label}
            className="rounded-lg border border-border bg-card p-4 shadow-sm"
          >
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {c.label}
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <div className="text-2xl font-semibold tabular-nums text-foreground">
                {c.value}
              </div>
              {delta !== null && (
                <span
                  className={\`text-xs font-medium \${
                    positive ? "text-emerald-600" : "text-rose-600"
                  }\`}
                >
                  {positive ? "↑" : "↓"} {Math.abs(delta).toFixed(1)}%
                </span>
              )}
            </div>
            {c.series && <Sparkline data={c.series} positive={positive} />}
          </div>
        )
      })}
    </div>
  )
}

function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  const max = Math.max(...data, 1), min = Math.min(...data, 0)
  const range = max - min || 1
  const points = data
    .map((v, i) => \`\${(i / (data.length - 1)) * 100},\${100 - ((v - min) / range) * 100}\`)
    .join(" ")
  return (
    <svg className="mt-3 h-8 w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke={positive ? "rgb(16 185 129)" : "rgb(225 29 72)"}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
`
