/**
 * EnrichmentQuestionCard — renders a single clarifying question.
 *
 * Supports three question types:
 *   - radio      : full-width clickable option rows (single selection)
 *   - multiselect: full-width clickable option rows with checkboxes
 *   - freetext   : 3-row textarea
 *
 * The card is intentionally plain so it can sit inside the lighter inner
 * card of PromptEnrichmentPanel without visual conflict.
 */

"use client"

import { cn } from "@/lib/utils"
import type { EnrichmentQuestion } from "@/lib/agent-kit/core/prompt-enrichment"

export interface EnrichmentQuestionCardProps {
  question: EnrichmentQuestion
  value: string
  onChange: (value: string) => void
}

export function EnrichmentQuestionCard({
  question,
  value,
  onChange,
}: EnrichmentQuestionCardProps) {
  // For multiselect, selected values are comma-joined
  const selectedSet = new Set(
    question.type === "multiselect" && value
      ? value.split(",").map((v) => v.trim()).filter(Boolean)
      : [],
  )

  function handleMultiselectToggle(option: string) {
    const next = new Set(selectedSet)
    if (next.has(option)) {
      next.delete(option)
    } else {
      next.add(option)
    }
    onChange(Array.from(next).join(","))
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground leading-snug">
        {question.text}
      </p>

      {question.type === "radio" && question.options && (
        <div className="space-y-1">
          {question.options.map((option) => {
            const isSelected = value === option
            return (
              <button
                key={option}
                type="button"
                onClick={() => onChange(option)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-left",
                  "transition-colors",
                  isSelected
                    ? "bg-primary/10 text-primary border border-primary/30"
                    : "bg-surface-2 text-muted-foreground hover:bg-surface-3 hover:text-foreground border border-transparent",
                )}
              >
                {/* Custom radio indicator */}
                <span
                  className={cn(
                    "flex-none w-3.5 h-3.5 rounded-full border-2 transition-colors",
                    isSelected
                      ? "border-primary bg-primary"
                      : "border-muted-foreground/50",
                  )}
                >
                  {isSelected && (
                    <span className="block w-full h-full rounded-full scale-50 bg-primary-foreground" />
                  )}
                </span>
                {option}
              </button>
            )
          })}
        </div>
      )}

      {question.type === "multiselect" && question.options && (
        <div className="space-y-1">
          {question.options.map((option) => {
            const isChecked = selectedSet.has(option)
            return (
              <button
                key={option}
                type="button"
                onClick={() => handleMultiselectToggle(option)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-left",
                  "transition-colors",
                  isChecked
                    ? "bg-primary/10 text-primary border border-primary/30"
                    : "bg-surface-2 text-muted-foreground hover:bg-surface-3 hover:text-foreground border border-transparent",
                )}
              >
                {/* Custom checkbox indicator */}
                <span
                  className={cn(
                    "flex-none w-3.5 h-3.5 rounded-sm border-2 transition-colors flex items-center justify-center",
                    isChecked
                      ? "border-primary bg-primary"
                      : "border-muted-foreground/50",
                  )}
                >
                  {isChecked && (
                    <svg
                      className="w-2.5 h-2.5 text-primary-foreground"
                      viewBox="0 0 10 10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="1.5,5 4,7.5 8.5,2" />
                    </svg>
                  )}
                </span>
                {option}
              </button>
            )
          })}
        </div>
      )}

      {question.type === "freetext" && (
        <textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type your answer…"
          className={cn(
            "w-full resize-none rounded-md px-3 py-2 text-sm",
            "bg-surface-2 text-foreground placeholder:text-muted-foreground",
            "border border-transparent focus:border-primary/40 focus:outline-none",
            "transition-colors",
          )}
        />
      )}
    </div>
  )
}
