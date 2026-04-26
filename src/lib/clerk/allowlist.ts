/**
 * Clerk allowlist policy. Authority: sub-plan 10 Task 3.
 *
 * Decides whether a newly-signed-up user is admitted to the app or routed to
 * the waitlist. Pure logic — easy to unit-test.
 *
 * Allowlist sources (matched in order):
 *   1. Comma-separated emails in `POLARIS_ALLOWLIST_EMAILS`.
 *   2. Comma-separated domains in `POLARIS_ALLOWLIST_DOMAINS`
 *      (e.g. "praxiomai.xyz" admits everyone @praxiomai.xyz).
 *   3. The literal "*" in either env var = admit everyone (open beta).
 */

export interface AllowlistDecision {
  admit: boolean
  reason: "explicit_email" | "domain_match" | "open_beta" | "not_listed"
}

export interface AllowlistConfig {
  emails: string
  domains: string
}

function split(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
}

export function checkAllowlist(
  email: string,
  cfg: AllowlistConfig,
): AllowlistDecision {
  const lower = email.trim().toLowerCase()
  const emails = split(cfg.emails)
  const domains = split(cfg.domains)

  if (emails.includes("*") || domains.includes("*")) {
    return { admit: true, reason: "open_beta" }
  }
  if (emails.includes(lower)) {
    return { admit: true, reason: "explicit_email" }
  }
  const at = lower.indexOf("@")
  if (at !== -1) {
    const domain = lower.slice(at + 1)
    if (domains.includes(domain)) {
      return { admit: true, reason: "domain_match" }
    }
  }
  return { admit: false, reason: "not_listed" }
}

/** Convenience: read config from process.env. */
export function readAllowlistFromEnv(): AllowlistConfig {
  return {
    emails: process.env.POLARIS_ALLOWLIST_EMAILS ?? "",
    domains: process.env.POLARIS_ALLOWLIST_DOMAINS ?? "",
  }
}
