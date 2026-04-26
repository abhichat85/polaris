/**
 * Circuit breaker. Authority: CONSTITUTION §12.3, sub-plan 09 Task 13.
 *
 * Wrap any external call (Vercel, Supabase, GitHub, Anthropic, E2B). When the
 * dependency is sustained-down, we stop hammering it and surface a fast
 * `CircuitOpenError` to the caller — error-recovery layers higher up
 * (sub-plan 01 §14-18) can show a clean "service degraded" message instead
 * of a barrage of timeouts.
 */

export class CircuitOpenError extends Error {
  constructor() {
    super("circuit_open")
    this.name = "CircuitOpenError"
  }
}

type State = "closed" | "open" | "half-open"

export interface CircuitBreakerConfig {
  /** Consecutive failures that flip the breaker open. */
  failureThreshold: number
  /** Time the breaker stays open before allowing one half-open trial. */
  cooldownMs: number
  /** Optional clock for tests. */
  now?: () => number
}

export class CircuitBreaker {
  private state: State = "closed"
  private failureCount = 0
  private openedAt = 0
  private readonly cfg: Required<CircuitBreakerConfig>

  constructor(cfg: CircuitBreakerConfig) {
    this.cfg = {
      failureThreshold: cfg.failureThreshold,
      cooldownMs: cfg.cooldownMs,
      now: cfg.now ?? Date.now,
    }
  }

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    const now = this.cfg.now()

    if (this.state === "open") {
      if (now - this.openedAt < this.cfg.cooldownMs) {
        throw new CircuitOpenError()
      }
      this.state = "half-open"
    }

    try {
      const result = await fn()
      // Success: clear failure count, transition half-open → closed.
      this.failureCount = 0
      this.state = "closed"
      return result
    } catch (e) {
      this.failureCount += 1
      if (
        this.state === "half-open" ||
        this.failureCount >= this.cfg.failureThreshold
      ) {
        this.state = "open"
        this.openedAt = now
      }
      throw e
    }
  }

  /** Inspect breaker state — used by /api/health diagnostics. */
  inspect(): { state: State; failureCount: number } {
    return { state: this.state, failureCount: this.failureCount }
  }
}
