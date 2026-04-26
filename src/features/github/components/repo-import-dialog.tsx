"use client"

/**
 * RepoImportDialog. Authority: sub-plan 06 Task 14.
 *
 * Opens a Radix Dialog with a paginated list of the user's GitHub repos.
 * Search filters client-side. Selecting a repo + clicking Import POSTs
 * `/api/github/import` which fires the Inngest event.
 */

import { useEffect, useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { Loader2, Search, Lock, GitFork, Archive } from "lucide-react"
import type { RepoListItem } from "@/features/github/lib/repo-list"
import type { Id } from "../../../../convex/_generated/dataModel"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: Id<"projects">
  onImportStarted?: () => void
}

export function RepoImportDialog({ open, onOpenChange, projectId, onImportStarted }: Props) {
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<RepoListItem[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState("")
  const [importing, setImporting] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetch(
      `/api/github/repos?page=${page}&perPage=30&excludeArchived=1`,
    )
      .then(async (res) => {
        if (cancelled) return
        if (res.status === 412) {
          setError("github_not_connected")
          return
        }
        if (!res.ok) {
          setError("github_list_failed")
          return
        }
        const data = (await res.json()) as { items: RepoListItem[]; hasMore: boolean }
        setItems(data.items)
        setHasMore(data.hasMore)
      })
      .catch(() => !cancelled && setError("network_error"))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [open, page])

  const filtered = filter
    ? items.filter(
        (r) =>
          r.name.toLowerCase().includes(filter.toLowerCase()) ||
          r.fullName.toLowerCase().includes(filter.toLowerCase()),
      )
    : items

  const startImport = async (repo: RepoListItem) => {
    setImporting(repo.fullName)
    try {
      const [owner, name] = repo.fullName.split("/")
      const res = await fetch("/api/github/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          owner,
          repo: name,
          ref: repo.defaultBranch,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? "import_failed")
      }
      onImportStarted?.()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "import_failed")
    } finally {
      setImporting(null)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-surface-2 p-6 shadow-2xl">
          <Dialog.Title className="font-heading text-lg font-semibold tracking-tight text-foreground">
            Import a GitHub repo
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            Replaces the current project files with the contents of the selected
            repo (default branch).
          </Dialog.Description>

          <div className="mt-5 flex items-center gap-2 rounded-md bg-surface-3 px-3 py-2">
            <Search className="size-4 text-muted-foreground" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter repos…"
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              autoFocus
            />
          </div>

          {error === "github_not_connected" && (
            <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              GitHub is not connected.{" "}
              <a className="underline" href="/api/github/oauth/start">
                Connect now
              </a>
              .
            </p>
          )}
          {error && error !== "github_not_connected" && (
            <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error.replace(/_/g, " ")}
            </p>
          )}

          <div className="mt-4 max-h-80 overflow-y-auto rounded-md bg-surface-3 p-1">
            {loading && (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No repos match.
              </p>
            )}
            {!loading &&
              filtered.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  disabled={importing !== null}
                  onClick={() => startImport(r)}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left transition-colors hover:bg-surface-4 disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {r.fullName}
                      </span>
                      {r.private && <Lock className="size-3 text-muted-foreground" />}
                      {r.fork && <GitFork className="size-3 text-muted-foreground" />}
                      {r.archived && <Archive className="size-3 text-muted-foreground" />}
                    </div>
                    {r.description && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {r.description}
                      </p>
                    )}
                  </div>
                  {importing === r.fullName && (
                    <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                  )}
                </button>
              ))}
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="rounded-md px-2 py-1 hover:bg-surface-3 disabled:opacity-30"
            >
              ← Prev
            </button>
            <span>Page {page}</span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasMore || loading}
              className="rounded-md px-2 py-1 hover:bg-surface-3 disabled:opacity-30"
            >
              Next →
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
