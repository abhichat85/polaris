export const PATTERN_EMPTY_STATE = `/**
 * Pattern: Empty state (illustration + headline + CTA).
 *
 * When to use: any list/grid/dashboard surface with zero records.
 * Empty states are NOT errors — they should be inviting and tell
 * the user what to do next, not just say "Nothing here yet."
 *
 * Tokens used (Praxiom):
 *   §3 (muted background), §4 (radius), §6 (spacing), §8 (typography)
 *
 * Variants:
 *   - Pass \`icon\` for a 48px lucide-react icon
 *   - Pass \`secondaryAction\` for a "Learn more" link below the CTA
 */
"use client"

import type { ReactNode } from "react"

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  primaryAction?: { label: string; onClick: () => void }
  secondaryAction?: { label: string; href: string }
}

export function EmptyState({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-md border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
      {icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <h3 className="text-base font-medium text-foreground">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {(primaryAction || secondaryAction) && (
        <div className="mt-2 flex items-center gap-3">
          {primaryAction && (
            <button
              onClick={primaryAction.onClick}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {primaryAction.label}
            </button>
          )}
          {secondaryAction && (
            <a
              href={secondaryAction.href}
              className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {secondaryAction.label}
            </a>
          )}
        </div>
      )}
    </div>
  )
}
`
