import { describe, it, expect } from "vitest"
import { polarisBeforeSend } from "@/lib/observability/sentry-before-send"
import type { ErrorEvent } from "@sentry/nextjs"

function evt(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
  return {
    type: undefined,
    ...overrides,
  } as ErrorEvent
}

describe("polarisBeforeSend", () => {
  it("drops events whose request URL is the GDPR export endpoint", () => {
    const e = evt({ request: { url: "https://app/api/gdpr/export" } })
    expect(polarisBeforeSend(e)).toBeNull()
  })

  it("redacts emails in the message", () => {
    const e = evt({ message: "user hello@world.com signed up" })
    const out = polarisBeforeSend(e)!
    expect(out.message).not.toContain("hello@world.com")
  })

  it("redacts authorization headers in request", () => {
    const e = evt({
      request: {
        url: "https://app/x",
        headers: { Authorization: "Bearer ghp_" + "a".repeat(36) },
      },
    })
    const out = polarisBeforeSend(e)!
    const auth = out.request?.headers as Record<string, string> | undefined
    expect(auth?.Authorization ?? auth?.authorization).toBe("[REDACTED]")
  })

  it("redacts password keys in extra", () => {
    const e = evt({ extra: { password: "hunter2", x: 1 } })
    const out = polarisBeforeSend(e)!
    expect((out.extra as Record<string, unknown>).password).toBe("[REDACTED]")
    expect((out.extra as Record<string, unknown>).x).toBe(1)
  })

  it("returns the event when no redaction is needed", () => {
    const e = evt({ tags: { route: "/api/x" } })
    const out = polarisBeforeSend(e)!
    expect(out.tags?.route).toBe("/api/x")
  })
})
