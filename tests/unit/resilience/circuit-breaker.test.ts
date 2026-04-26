/**
 * Circuit breaker tests. Authority: CONSTITUTION §12.3, sub-plan 09 Task 13.
 *
 * Three states:
 *   - closed: requests pass through; on N consecutive failures, open.
 *   - open: requests rejected immediately; after `cooldownMs`, half-open.
 *   - half-open: one trial request; success → closed, failure → open.
 */

import { describe, it, expect } from "vitest"
import { CircuitBreaker, CircuitOpenError } from "@/lib/resilience/circuit-breaker"

describe("CircuitBreaker", () => {
  it("forwards successful calls", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 })
    const r = await cb.exec(async () => 42)
    expect(r).toBe(42)
  })

  it("opens after threshold consecutive failures", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 })
    for (let i = 0; i < 3; i++) {
      await expect(cb.exec(async () => { throw new Error("fail") })).rejects.toThrow("fail")
    }
    await expect(cb.exec(async () => 1)).rejects.toBeInstanceOf(CircuitOpenError)
  })

  it("transitions open → half-open after cooldown", async () => {
    let now = 0
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      cooldownMs: 100,
      now: () => now,
    })
    await expect(cb.exec(async () => { throw new Error("x") })).rejects.toThrow("x")
    // Open: rejects immediately.
    await expect(cb.exec(async () => 1)).rejects.toBeInstanceOf(CircuitOpenError)
    now += 150
    // Cooldown elapsed → half-open: trial passes through.
    const r = await cb.exec(async () => 99)
    expect(r).toBe(99)
  })

  it("half-open success closes the circuit", async () => {
    let now = 0
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      cooldownMs: 50,
      now: () => now,
    })
    await expect(cb.exec(async () => { throw new Error("x") })).rejects.toThrow()
    now += 100
    await cb.exec(async () => "ok") // closes
    // Now should accept multiple successes again
    expect(await cb.exec(async () => "ok")).toBe("ok")
    expect(await cb.exec(async () => "ok")).toBe("ok")
  })

  it("half-open failure re-opens the circuit", async () => {
    let now = 0
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      cooldownMs: 50,
      now: () => now,
    })
    await expect(cb.exec(async () => { throw new Error("a") })).rejects.toThrow()
    now += 100
    await expect(cb.exec(async () => { throw new Error("b") })).rejects.toThrow("b")
    // Re-opened: next call rejects immediately.
    await expect(cb.exec(async () => 1)).rejects.toBeInstanceOf(CircuitOpenError)
  })

  it("resets failure count on success while closed", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 })
    await expect(cb.exec(async () => { throw new Error("a") })).rejects.toThrow()
    await expect(cb.exec(async () => { throw new Error("b") })).rejects.toThrow()
    await cb.exec(async () => "ok") // resets counter
    await expect(cb.exec(async () => { throw new Error("c") })).rejects.toThrow()
    await expect(cb.exec(async () => { throw new Error("d") })).rejects.toThrow()
    // Still closed (fail count is 2, not 3)
    await expect(cb.exec(async () => 1)).resolves.toBe(1)
  })
})
