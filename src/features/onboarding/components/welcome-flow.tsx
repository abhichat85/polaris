"use client"

/**
 * WelcomeFlow. Authority: sub-plan 10 Task 4.
 *
 * Three-step intro shown to brand-new users on first sign-in:
 *   1. Welcome + brand promise
 *   2. Marketing opt-in (genuine opt-in, not pre-checked)
 *   3. Hand-off to the starter-prompts grid
 *
 * State (which step, marketingOptIn) is persisted to Convex via
 * `user_profiles.upsert`. If the user closes the tab and comes back, they
 * resume on the saved step.
 */

import { useState } from "react"
import { useMutation } from "convex/react"
import { ArrowRight } from "lucide-react"
import { api } from "../../../../convex/_generated/api"

interface Props {
  userId: string
  initialStep?: "welcome" | "preferences" | "starter"
  onComplete: () => void
}

export function WelcomeFlow({ userId, initialStep = "welcome", onComplete }: Props) {
  const [step, setStep] = useState<"welcome" | "preferences" | "starter">(
    initialStep,
  )
  const [marketingOptIn, setMarketingOptIn] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const upsert = useMutation(api.user_profiles.upsert)

  const advance = async (next: "welcome" | "preferences" | "starter") => {
    setSubmitting(true)
    try {
      await upsert({
        userId,
        onboardingStep: next,
        marketingOptIn: next === "starter" ? marketingOptIn : undefined,
      })
      setStep(next)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl rounded-lg bg-surface-2 p-8">
      {step === "welcome" && (
        <>
          <h1 className="font-heading text-3xl font-semibold tracking-[-0.02em] text-foreground">
            Welcome to Polaris.
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            From idea to running app, in one chat. You describe what you want;
            Polaris writes the code, runs it in a sandbox, and ships it to your
            own Vercel + Supabase. No lock-in — your code lives in your GitHub.
          </p>
          <button
            type="button"
            onClick={() => advance("preferences")}
            disabled={submitting}
            className="mt-8 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            Continue <ArrowRight className="size-4" />
          </button>
        </>
      )}

      {step === "preferences" && (
        <>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            One question
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Can we email you the occasional product update — new features,
            launch announcements? No marketing spam, no third-party sharing.
            You can opt out any time.
          </p>
          <label className="mt-6 flex items-start gap-3 rounded-md bg-surface-3 p-4">
            <input
              type="checkbox"
              checked={marketingOptIn}
              onChange={(e) => setMarketingOptIn(e.target.checked)}
              className="mt-0.5 size-4 accent-primary"
            />
            <span className="text-sm text-foreground">
              Yes, send me product updates from Polaris.
            </span>
          </label>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => advance("starter")}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              Continue <ArrowRight className="size-4" />
            </button>
          </div>
        </>
      )}

      {step === "starter" && (
        <>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            Pick a starter — or describe your own
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Three projects we love. Click one and watch Polaris build it, or
            scroll past to write your own prompt.
          </p>
          <button
            type="button"
            onClick={onComplete}
            className="mt-8 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Show me starters <ArrowRight className="size-4" />
          </button>
        </>
      )}
    </div>
  )
}
