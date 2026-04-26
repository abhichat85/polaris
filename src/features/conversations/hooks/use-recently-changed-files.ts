/**
 * useRecentlyChangedFiles — returns the set of files updated within a small
 * window (default 3 seconds). Drives FileTreePulse highlight after agent
 * writes.
 *
 * Authority: Sub-Plan 04 §5.
 */

"use client"

import { useEffect, useMemo, useState } from "react"

export interface RecentlyChangedFile {
  _id: string
  updatedAt: number
}

export function filterRecentlyChanged<T extends RecentlyChangedFile>(
  files: T[],
  now: number,
  windowMs: number,
): T[] {
  const cutoff = now - windowMs
  return files.filter((f) => f.updatedAt >= cutoff)
}

export interface UseRecentlyChangedFilesArgs<T extends RecentlyChangedFile> {
  allFiles: T[] | undefined
  windowMs?: number
  /** Override clock for tests. */
  now?: number
}

export function useRecentlyChangedFiles<T extends RecentlyChangedFile>(
  args: UseRecentlyChangedFilesArgs<T>,
): T[] {
  const { allFiles, windowMs = 3000, now } = args
  const [tick, setTick] = useState(0)

  // Re-render every windowMs / 3 to expire the highlight.
  useEffect(() => {
    if (now !== undefined) return // tests own the clock
    const id = setInterval(() => setTick((t) => t + 1), Math.max(500, windowMs / 3))
    return () => clearInterval(id)
  }, [windowMs, now])

  return useMemo(() => {
    if (!allFiles) return []
    const t = now ?? Date.now()
    void tick
    return filterRecentlyChanged(allFiles, t, windowMs)
  }, [allFiles, now, windowMs, tick])
}
