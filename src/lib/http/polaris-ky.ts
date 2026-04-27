/**
 * Centralised ky client with a longer default timeout than ky's 10s.
 *
 * Authority: D-025 — the agent dispatch path is bounded by tier (5min /
 * 30min / 2hr) and a 10-second client timeout was masking real work as
 * a network failure. Symptom in the wild: posting a long prompt like
 * "build me a full ecommerce site" failed with `TimeoutError: Request
 * timed out: POST http://localhost:3000/api/messages` because the
 * /api/messages route does 6 round-trips (auth + 5 Convex calls + 1
 * Inngest dispatch) and on a cold Convex deployment that can run to
 * ~12s.
 *
 * The route itself stays sync — we just give the *client* enough budget
 * to wait for the dispatch to register. The actual agent run is async
 * via Inngest and is not bounded by this timeout.
 */

import ky from "ky"

const DEFAULT_TIMEOUT_MS = 45_000

export const polarisKy = ky.create({
  timeout: DEFAULT_TIMEOUT_MS,
  retry: {
    // Don't auto-retry POSTs — they may have side effects (e.g. message
    // creation). Idempotency is the route's job, not the client's.
    limit: 0,
  },
})

export { ky as kyRaw }
