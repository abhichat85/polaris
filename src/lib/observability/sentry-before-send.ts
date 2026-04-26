/**
 * Sentry beforeSend filter. Authority: sub-plan 09 Task 5,
 * CONSTITUTION §15.2 (no plaintext message bodies, tool inputs, tool outputs,
 * emails, or API keys in telemetry).
 *
 * Routes the entire event payload through `redact()` before it leaves the
 * machine. Drops events whose request URL is the GDPR export endpoint
 * (the body could be large and is by definition the user's data).
 */

import type { ErrorEvent, EventHint } from "@sentry/nextjs"
import { redact } from "./redact"

const DROP_URL_SUBSTRINGS = ["/api/gdpr/export"]

export function polarisBeforeSend(
  event: ErrorEvent,
  _hint?: EventHint,
): ErrorEvent | null {
  // Drop sensitive endpoints entirely.
  const url = event.request?.url ?? ""
  if (DROP_URL_SUBSTRINGS.some((s) => url.includes(s))) return null

  // Redact the structured payload in place. We rebuild a few well-known
  // sub-objects to make the redactor's WeakSet cycle-detection effective.
  const redacted = redact({
    breadcrumbs: event.breadcrumbs,
    request: event.request,
    extra: event.extra,
    contexts: event.contexts,
    tags: event.tags,
    user: event.user,
    message: event.message,
  }) as Pick<
    ErrorEvent,
    "breadcrumbs" | "request" | "extra" | "contexts" | "tags" | "user" | "message"
  >

  return { ...event, ...redacted }
}
