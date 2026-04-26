/**
 * Trace-ID helpers. Authority: sub-plan 09 Task 2.
 *
 * Each HTTP request is tagged with a ULID-shaped trace id at the edge. Inngest
 * events propagate it via the event payload. Logs and Sentry reference it.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

function encodeTime(ms: number, len: number): string {
  let n = ms
  let out = ""
  for (let i = len - 1; i >= 0; i--) {
    const mod = n % 32
    out = ALPHABET[mod] + out
    n = (n - mod) / 32
  }
  return out
}

function encodeRandom(len: number): string {
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  let out = ""
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % 32]
  return out
}

/** 26-char Crockford-base32 ULID. Strictly increasing (good for log sort). */
export function newTraceId(now: number = Date.now()): string {
  return encodeTime(now, 10) + encodeRandom(16)
}

export const TRACE_HEADER = "x-polaris-trace-id"
