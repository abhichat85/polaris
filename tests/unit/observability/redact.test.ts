/**
 * Redaction tests. Authority: CONSTITUTION §15.2, sub-plan 09 Task 3.
 * Every log line and Sentry event passes through redact(). Anything that
 * could be a secret, an email, or a user-facing prompt body MUST be replaced.
 */

import { describe, it, expect } from "vitest"
import { redact } from "@/lib/observability/redact"

describe("redact", () => {
  it("strips email addresses", () => {
    const out = redact({ msg: "user is hello@world.com signed up" })
    expect(JSON.stringify(out)).not.toContain("hello@world.com")
    expect(JSON.stringify(out)).toContain("[REDACTED_EMAIL]")
  })

  it("strips Anthropic api keys", () => {
    const k = "sk-ant-api03-" + "a".repeat(95)
    const out = redact({ note: `key=${k}` })
    expect(JSON.stringify(out)).not.toContain(k)
  })

  it("strips bearer tokens in Authorization headers", () => {
    const out = redact({
      headers: { Authorization: "Bearer ghp_" + "a".repeat(36) },
    })
    expect(JSON.stringify(out)).toContain("[REDACTED]")
    expect(JSON.stringify(out)).not.toContain("ghp_")
  })

  it("redacts known secret-bearing keys regardless of value", () => {
    const out = redact({
      apiKey: "anything-here",
      password: "hunter2",
      access_token: "abc",
      stripeSecret: "sk_live_x",
      authorization: "ghp_x",
    })
    const s = JSON.stringify(out)
    expect(s).not.toContain("anything-here")
    expect(s).not.toContain("hunter2")
    expect(s).not.toContain("hunter2")
    expect(s).not.toContain("sk_live_x")
  })

  it("redacts the agent's prompt body field", () => {
    const out = redact({
      role: "user",
      content: "How do I build a SaaS",
    })
    expect(JSON.stringify(out)).toContain("[REDACTED_PROMPT]")
  })

  it("preserves non-sensitive numeric/boolean fields", () => {
    const out = redact({ count: 5, ok: true, status: "completed" })
    expect(out).toEqual({ count: 5, ok: true, status: "completed" })
  })

  it("handles deeply nested objects", () => {
    const out = redact({
      a: { b: { c: { password: "secret" } } },
    }) as { a: { b: { c: { password: string } } } }
    expect(out.a.b.c.password).toBe("[REDACTED]")
  })

  it("handles arrays", () => {
    const out = redact({ list: [{ password: "x" }, { ok: true }] }) as {
      list: { password?: string; ok?: boolean }[]
    }
    expect(out.list[0].password).toBe("[REDACTED]")
    expect(out.list[1].ok).toBe(true)
  })

  it("does not loop on cycles", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj: any = { a: 1 }
    obj.self = obj
    expect(() => redact(obj)).not.toThrow()
  })
})
