export const PATTERN_SETTINGS_PAGE = `/**
 * Pattern: Settings page (section/group layout).
 *
 * When to use: any /settings, /preferences, /account route. The
 * section/group pattern keeps related controls visually clustered
 * and lets users skim large preference surfaces.
 *
 * Tokens used (Praxiom):
 *   §3 (color), §4 (radius), §6 (spacing), §8 (typography),
 *   §10 (form input states), §14 (destructive actions = red)
 *
 * Variants:
 *   - With sidebar TOC (long settings) — add a left rail of section anchors
 *   - With per-section save vs single bottom save — see \`SettingsGroup\`
 */
"use client"

import type { ReactNode } from "react"

export function SettingsPage({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl space-y-10 px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Customize how Polaris works for you.
        </p>
      </header>
      <div className="space-y-8">{children}</div>
    </main>
  )
}

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="space-y-4 border-b border-border pb-8 last:border-0">
      <div>
        <h2 className="text-base font-medium text-foreground">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

export function SettingsGroup({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[200px,1fr] sm:items-start">
      <div>
        <div className="text-sm font-medium text-foreground">{label}</div>
        {hint && (
          <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
        )}
      </div>
      <div>{children}</div>
    </div>
  )
}
`
