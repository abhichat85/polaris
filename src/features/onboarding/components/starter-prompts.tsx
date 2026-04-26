"use client"

/**
 * StarterPrompts. Authority: sub-plan 10 Task 5.
 *
 * Renders the 3 hand-picked prompts as clickable cards. Clicking one calls
 * `onSelect(prompt)` — the parent decides what to do (typically: create a
 * new project + fire the agent with the chosen prompt).
 */

import { STARTER_PROMPTS, type StarterPrompt } from "../lib/starter-prompt-catalog"

interface Props {
  onSelect: (p: StarterPrompt) => void
  /** Disable cards while a project is being created. */
  busy?: boolean
}

export function StarterPrompts({ onSelect, busy }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {STARTER_PROMPTS.map((p) => (
        <button
          key={p.id}
          type="button"
          disabled={busy}
          onClick={() => onSelect(p)}
          className="group rounded-lg bg-surface-2 p-5 text-left transition-colors hover:bg-surface-3 disabled:opacity-50"
        >
          <div className="text-2xl">{p.icon}</div>
          <h3 className="mt-3 font-heading text-base font-semibold tracking-tight text-foreground">
            {p.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {p.blurb}
          </p>
          <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
            Build this →
          </p>
        </button>
      ))}
    </div>
  )
}
