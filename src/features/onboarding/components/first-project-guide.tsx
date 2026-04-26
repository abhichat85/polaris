"use client"

/**
 * FirstProjectGuide. Authority: sub-plan 10 Task 6.
 *
 * Tooltip tour overlay. Reads `TOUR_STEPS`, advances on click. The tooltip
 * positions itself relative to the targeted element on the underlying screen
 * via getBoundingClientRect().
 *
 * On the final step (or if the user hits Skip), `onComplete` is called and
 * the parent persists `onboardingCompleted=true` to Convex.
 *
 * Implemented without `@floating-ui/react` to keep the dependency surface
 * lean — getBoundingClientRect + a tiny placement helper is enough.
 */

import { useEffect, useState } from "react"
import { useMutation } from "convex/react"
import { TOUR_STEPS, type TourStep } from "../lib/tour-steps"
import { api } from "../../../../convex/_generated/api"

interface Props {
  userId: string
  onComplete: () => void
}

export function FirstProjectGuide({ userId, onComplete }: Props) {
  const [stepIdx, setStepIdx] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const completeOnboarding = useMutation(api.user_profiles.completeOnboarding)

  const step: TourStep | undefined = TOUR_STEPS[stepIdx]

  useEffect(() => {
    if (!step) return
    const el = document.querySelector(step.selector)
    if (!el) {
      setRect(null)
      return
    }
    setRect(el.getBoundingClientRect())
    el.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [step])

  if (!step) return null

  const finish = async () => {
    try {
      await completeOnboarding({ userId })
    } finally {
      onComplete()
    }
  }

  const advance = () => {
    if (stepIdx < TOUR_STEPS.length - 1) {
      setStepIdx((i) => i + 1)
    } else {
      void finish()
    }
  }

  // Position the tooltip — fall back to viewport center if target missing.
  const tooltipStyle: React.CSSProperties = rect
    ? placementStyle(rect, step.placement)
    : { left: "50%", top: "50%", transform: "translate(-50%,-50%)" }

  return (
    <>
      {/* Spotlight cutout — dims the page except over the target. */}
      <div className="pointer-events-none fixed inset-0 z-40 bg-black/55" />
      {rect && (
        <div
          className="pointer-events-none fixed z-40 rounded-md ring-2 ring-primary"
          style={{
            left: rect.left - 4,
            top: rect.top - 4,
            width: rect.width + 8,
            height: rect.height + 8,
          }}
        />
      )}
      <div
        role="dialog"
        aria-label={step.title}
        className="fixed z-50 w-[min(360px,92vw)] rounded-lg bg-surface-3 p-5 shadow-2xl"
        style={tooltipStyle}
      >
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          Step {stepIdx + 1} of {TOUR_STEPS.length}
        </p>
        <h3 className="mt-1 font-heading text-base font-semibold tracking-tight text-foreground">
          {step.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {step.body}
        </p>
        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => void finish()}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Skip tour
          </button>
          <button
            type="button"
            onClick={advance}
            className="rounded-md bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {stepIdx < TOUR_STEPS.length - 1 ? "Next" : "Got it"}
          </button>
        </div>
      </div>
    </>
  )
}

function placementStyle(rect: DOMRect, placement: TourStep["placement"]): React.CSSProperties {
  const GAP = 12
  switch (placement) {
    case "top":
      return { left: rect.left + rect.width / 2, top: rect.top - GAP, transform: "translate(-50%,-100%)" }
    case "bottom":
      return { left: rect.left + rect.width / 2, top: rect.bottom + GAP, transform: "translate(-50%,0)" }
    case "left":
      return { left: rect.left - GAP, top: rect.top + rect.height / 2, transform: "translate(-100%,-50%)" }
    case "right":
    default:
      return { left: rect.right + GAP, top: rect.top + rect.height / 2, transform: "translate(0,-50%)" }
  }
}
