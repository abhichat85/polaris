export const PATTERN_DATA_FETCH_PAGE = `/**
 * Pattern: Data-fetching page with explicit loading/empty/error branches.
 *
 * When to use: any page or section that reads from Convex via useQuery.
 * The four-branch pattern (loading / error / empty / data) is the
 * single most-skipped piece of UI work — get it right by default.
 *
 * Tokens used (Praxiom):
 *   §3 (color), §6 (spacing), §13 (skeleton + empty + error states)
 *
 * Composes with: empty-state.tsx, data-table.tsx
 *
 * Variants:
 *   - Server-side fetch via fetchQuery (RSC) — simpler but no live updates
 *   - Optimistic mutations — wrap useMutation, see Convex docs §optimistic
 */
"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { EmptyState } from "./empty-state"

export function DataFetchPage() {
  // Replace api.products.list with the actual query for your project.
  const items = useQuery(api.products.list)

  // 1. Loading — undefined (Convex hasn't returned yet).
  if (items === undefined) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 rounded-md bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  // 2. Error — Convex throws, caught by error boundary above. The
  // pattern here covers the "value-shape error" case (e.g. server
  // returned a discriminated 'error' variant). For thrown errors,
  // wrap the page in an <ErrorBoundary>.
  // (No example here — Convex's typed throws bubble naturally.)

  // 3. Empty — zero records.
  if (items.length === 0) {
    return (
      <EmptyState
        title="No products yet"
        description="Get started by adding your first product."
        primaryAction={{ label: "Add product", onClick: () => {} }}
      />
    )
  }

  // 4. Data.
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {items.map((it: { _id: string; name: string; price: number }) => (
        <li key={it._id} className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-medium text-foreground">{it.name}</span>
          <span className="text-sm text-muted-foreground tabular-nums">
            \${it.price.toFixed(2)}
          </span>
        </li>
      ))}
    </ul>
  )
}
`
