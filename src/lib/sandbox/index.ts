/**
 * Single, lazy-initialized SandboxProvider used everywhere outside the
 * `src/lib/sandbox/` directory itself. Authority: CONSTITUTION §6.3.
 *
 * Selection rules:
 *   - `process.env.SANDBOX_PROVIDER === "mock"`            → MockSandboxProvider
 *   - `process.env.SANDBOX_PROVIDER === "e2b"`             → E2BSandboxProvider
 *   - unset, with `E2B_API_KEY` present                    → E2BSandboxProvider
 *   - unset, no `E2B_API_KEY`                              → MockSandboxProvider
 *
 * The fallback to mock when no key is present keeps `npm run dev` working out
 * of the box for new contributors. Production deploys MUST set `E2B_API_KEY`
 * (the ops checklist in sub-plan 09 verifies this).
 */

import type { SandboxProvider } from "./types"
import { E2BSandboxProvider, SandboxDeadError } from "./e2b-provider"
import { MockSandboxProvider } from "./mock-provider"

let _provider: SandboxProvider | null = null

function selectProvider(): SandboxProvider {
  const explicit = process.env.SANDBOX_PROVIDER
  const apiKey = process.env.E2B_API_KEY

  if (explicit === "mock") return new MockSandboxProvider()
  if (explicit === "e2b") {
    if (!apiKey) {
      throw new Error(
        "SANDBOX_PROVIDER=e2b but E2B_API_KEY is not set. See .env.example.",
      )
    }
    return new E2BSandboxProvider({ apiKey })
  }

  if (apiKey) return new E2BSandboxProvider({ apiKey })

  // Dev/local fallback. Logged once so failures-are-honest (CONSTITUTION §2.6).
  if (process.env.NODE_ENV !== "test") {
    // eslint-disable-next-line no-console
    console.warn(
      "[sandbox] E2B_API_KEY not set — falling back to MockSandboxProvider. " +
        "Files will live in memory only.",
    )
  }
  return new MockSandboxProvider()
}

function getProvider(): SandboxProvider {
  if (!_provider) _provider = selectProvider()
  return _provider
}

/**
 * The single sandbox provider used by the entire codebase.
 * Lazy: only the first read constructs it, so unit tests that don't touch
 * sandbox don't need any env at all.
 */
export const sandboxProvider: SandboxProvider = new Proxy({} as SandboxProvider, {
  get(_t, prop) {
    return Reflect.get(getProvider() as object, prop)
  },
})

export type { SandboxProvider } from "./types"
export { SandboxDeadError }

/** TEST-ONLY: replace the live provider with a mock or null to reset. */
export function __setSandboxProviderForTests(p: SandboxProvider | null): void {
  _provider = p
}
