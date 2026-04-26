"use client"

import { useEffect, useState } from "react"

const STORAGE_KEY = "polaris_consent"

interface ConsentValue {
  analytics: boolean
  marketing: boolean
  timestamp: number
}

function readConsent(): ConsentValue | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as ConsentValue
  } catch {
    return null
  }
}

function writeConsent(v: ConsentValue) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(v))
}

export function CookieConsent() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!readConsent()) setShow(true)
  }, [])

  if (!show) return null

  const accept = (analytics: boolean, marketing: boolean) => {
    writeConsent({ analytics, marketing, timestamp: Date.now() })
    setShow(false)
  }

  return (
    <div
      role="dialog"
      aria-label="Cookie preferences"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-2xl rounded-lg bg-surface-3 p-5 shadow-lg"
    >
      <p className="text-sm text-foreground">
        Polaris uses essential cookies to keep you signed in. We don&apos;t set
        analytics or marketing cookies without your consent.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        See our <a className="text-primary hover:underline" href="/legal/cookies">cookie notice</a> for details.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => accept(false, false)}
          className="rounded-md bg-surface-4 px-3.5 py-1.5 text-sm font-medium text-foreground hover:bg-surface-3"
        >
          Essential only
        </button>
        <button
          type="button"
          onClick={() => accept(true, false)}
          className="rounded-md bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Accept analytics
        </button>
      </div>
    </div>
  )
}
