/**
 * Redaction for logs and Sentry events. Authority: CONSTITUTION §15.2,
 * sub-plan 09 Task 3.
 *
 * Two layers:
 *   1. Key-based: any field whose KEY matches REDACT_KEYS is fully replaced.
 *   2. Value-based: emails, bearer tokens, known API key shapes inside string
 *      values are replaced with `[REDACTED_<kind>]`.
 *
 * Designed to be cycle-safe (uses a WeakSet) and to NEVER throw, since it
 * runs inside `Sentry.beforeSend`.
 */

const REDACT_KEYS = new Set(
  [
    "apikey",
    "api_key",
    "password",
    "passwd",
    "secret",
    "stripesecret",
    "stripe_secret",
    "access_token",
    "accesstoken",
    "refresh_token",
    "refreshtoken",
    "bearer",
    "authorization",
    "auth",
    "encryption_key",
    "polaris_encryption_key",
    "anthropic_api_key",
    "openai_api_key",
    "github_oauth_client_secret",
    "stripe_secret_key",
    "stripe_webhook_secret",
    "vercel_token",
    "supabase_service_role_key",
    "e2b_api_key",
  ].map((k) => k.toLowerCase()),
)

/** Field names that hold user-facing prompt/response bodies. */
const PROMPT_KEYS = new Set(
  ["content", "prompt", "input", "output", "message_text"].map((k) => k.toLowerCase()),
)

const EMAIL_RX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const BEARER_RX = /\b[Bb]earer\s+[A-Za-z0-9._\-+/=]+/g
const ANTHROPIC_RX = /\bsk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_\-]{60,}\b/g
const OPENAI_RX = /\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_\-]{20,}\b/g
const GITHUB_RX = /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g
const STRIPE_RX = /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/g

function redactString(s: string): string {
  return s
    .replace(BEARER_RX, "Bearer [REDACTED]")
    .replace(ANTHROPIC_RX, "[REDACTED_ANTHROPIC_KEY]")
    .replace(OPENAI_RX, "[REDACTED_OPENAI_KEY]")
    .replace(GITHUB_RX, "[REDACTED_GITHUB_TOKEN]")
    .replace(STRIPE_RX, "[REDACTED_STRIPE_KEY]")
    .replace(EMAIL_RX, "[REDACTED_EMAIL]")
}

export function redact<T>(input: T): T {
  const seen = new WeakSet<object>()
  return walk(input, seen) as T
}

function walk(v: unknown, seen: WeakSet<object>): unknown {
  if (v === null || v === undefined) return v
  if (typeof v === "string") return redactString(v)
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") {
    return v
  }
  if (Array.isArray(v)) {
    return v.map((x) => walk(x, seen))
  }
  if (typeof v === "object") {
    if (seen.has(v as object)) return "[CYCLE]"
    seen.add(v as object)
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const lk = k.toLowerCase()
      if (REDACT_KEYS.has(lk)) {
        out[k] = "[REDACTED]"
        continue
      }
      if (PROMPT_KEYS.has(lk) && typeof val === "string") {
        out[k] = "[REDACTED_PROMPT]"
        continue
      }
      out[k] = walk(val, seen)
    }
    return out
  }
  return v
}
