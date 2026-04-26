"use client"

import * as React from "react"
import { useQueryState, parseAsStringLiteral } from "nuqs"

import { cn } from "@/lib/utils"

const TABS = ["editor", "preview", "spec"] as const
export type RightPaneTab = (typeof TABS)[number]

const TAB_LABEL: Record<RightPaneTab, string> = {
  editor: "Editor",
  preview: "Preview",
  spec: "Spec",
}

export interface RightPaneTabsProps {
  editor: React.ReactNode
  preview: React.ReactNode
  spec: React.ReactNode
  defaultTab?: RightPaneTab
}

export function RightPaneTabs({
  editor,
  preview,
  spec,
  defaultTab = "editor",
}: RightPaneTabsProps) {
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(TABS).withDefault(defaultTab),
  )

  const panels: Record<RightPaneTab, React.ReactNode> = {
    editor,
    preview,
    spec,
  }

  return (
    <div className="flex h-full flex-col">
      <div role="tablist" className="flex h-9 shrink-0 items-stretch bg-surface-1">
        {TABS.map((t) => {
          const active = tab === t
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={TAB_LABEL[t]}
              onClick={() => setTab(t)}
              className={cn(
                "relative inline-flex items-center px-4 text-sm font-medium transition-colors",
                active
                  ? "bg-surface-4 text-foreground"
                  : "bg-surface-3 text-muted-foreground hover:text-foreground",
              )}
            >
              {active && (
                <span className="absolute inset-x-0 top-0 h-[2px] bg-primary" />
              )}
              {TAB_LABEL[t]}
            </button>
          )
        })}
      </div>
      <div className="relative flex-1">
        {(Object.keys(panels) as RightPaneTab[]).map((k) => (
          <div
            key={k}
            role="tabpanel"
            hidden={tab !== k}
            className={cn("absolute inset-0", tab !== k && "pointer-events-none")}
          >
            {panels[k]}
          </div>
        ))}
      </div>
    </div>
  )
}
