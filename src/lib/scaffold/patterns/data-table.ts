export const PATTERN_DATA_TABLE = `/**
 * Pattern: Data table with sorting, pagination, and empty/loading states.
 *
 * When to use: any list of >10 records that the user needs to scan or
 * filter. For <10 records, prefer a simple card list (less chrome).
 *
 * Tokens used (Praxiom):
 *   §3 (color), §4 (radius), §6 (spacing), §8 (typography),
 *   §11 (table grid lines), §13 (empty/loading states)
 *
 * Variants:
 *   - Pass \`onRowClick\` for navigable rows
 *   - Pass \`bulkActions\` array for selection-mode (not shown here)
 *
 * Composes with: empty-state.tsx for the zero-records branch.
 */
"use client"

import { useMemo, useState } from "react"

export interface Column<T> {
  key: keyof T & string
  label: string
  sortable?: boolean
  render?: (row: T) => React.ReactNode
}

export interface DataTableProps<T extends { id: string | number }> {
  rows: T[] | undefined        // undefined while loading
  columns: Column<T>[]
  pageSize?: number
  emptyMessage?: string
  onRowClick?: (row: T) => void
}

export function DataTable<T extends { id: string | number }>({
  rows,
  columns,
  pageSize = 25,
  emptyMessage = "Nothing here yet.",
  onRowClick,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<keyof T | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [page, setPage] = useState(0)

  const sorted = useMemo(() => {
    if (!rows || !sortKey) return rows
    return [...rows].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (av < bv) return sortDir === "asc" ? -1 : 1
      if (av > bv) return sortDir === "asc" ? 1 : -1
      return 0
    })
  }, [rows, sortKey, sortDir])

  if (rows === undefined) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  if (sorted!.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-12 text-center">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    )
  }

  const start = page * pageSize
  const visible = sorted!.slice(start, start + pageSize)
  const totalPages = Math.ceil(sorted!.length / pageSize)

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className="px-3 py-2 text-left font-medium text-muted-foreground"
                  onClick={() => {
                    if (!c.sortable) return
                    if (sortKey === c.key)
                      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
                    else { setSortKey(c.key); setSortDir("asc") }
                  }}
                  style={{ cursor: c.sortable ? "pointer" : "default" }}
                >
                  {c.label}{sortKey === c.key && (sortDir === "asc" ? " ↑" : " ↓")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.id}
                className="border-t border-border hover:bg-muted/20"
                onClick={() => onRowClick?.(row)}
                style={{ cursor: onRowClick ? "pointer" : "default" }}
              >
                {columns.map((c) => (
                  <td key={c.key} className="px-3 py-2 text-foreground">
                    {c.render ? c.render(row) : String(row[c.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Page {page + 1} of {totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="rounded border border-border px-2 py-1 disabled:opacity-50">Prev</button>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="rounded border border-border px-2 py-1 disabled:opacity-50">Next</button>
          </div>
        </div>
      )}
    </div>
  )
}
`
