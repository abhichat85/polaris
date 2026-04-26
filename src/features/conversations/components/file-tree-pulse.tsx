/**
 * FileTreePulse — small pulse-dot indicator next to a recently-changed file.
 *
 * Authority: Sub-Plan 04 §5, DESIGN-SYSTEM §9.2 (`pulse-dot` keyframe).
 */

"use client"

import { cn } from "@/lib/utils"

export interface FileTreePulseProps {
  fileId: string
  recentFileIds: Set<string>
  className?: string
}

export function FileTreePulse({
  fileId,
  recentFileIds,
  className,
}: FileTreePulseProps) {
  if (!recentFileIds.has(fileId)) return null
  return (
    <span
      data-testid="file-tree-pulse"
      aria-hidden="true"
      className={cn(
        "inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot",
        className,
      )}
    />
  )
}
