/**
 * Structured JSON logger. Authority: CONSTITUTION §15.1, sub-plan 09 Task 4.
 *
 * Every log line is a single JSON object on stdout. Includes:
 *   - level: debug | info | warn | error
 *   - msg: short event name (e.g. "agent.iter")
 *   - ts: ISO-8601 timestamp
 *   - traceId: request-scoped (from middleware) when available
 *   - any extra fields, redacted
 *
 * Usage:
 *   import { log } from "@/lib/observability/logger"
 *   log.info("agent.start", { projectId, model })
 */

import { redact } from "./redact"

export type LogLevel = "debug" | "info" | "warn" | "error"

interface LogFn {
  (msg: string, ctx?: Record<string, unknown>): void
}

interface Logger {
  debug: LogFn
  info: LogFn
  warn: LogFn
  error: LogFn
  withTrace: (traceId: string) => Logger
}

function emit(level: LogLevel, msg: string, ctx: Record<string, unknown> | undefined, traceId?: string) {
  const line = redact({
    level,
    msg,
    ts: new Date().toISOString(),
    ...(traceId ? { traceId } : {}),
    ...(ctx ?? {}),
  })
  // In test, suppress to avoid noise. In production, emit JSON line.
  if (process.env.NODE_ENV === "test") return
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(line))
}

function buildLogger(traceId?: string): Logger {
  return {
    debug: (msg, ctx) => emit("debug", msg, ctx, traceId),
    info: (msg, ctx) => emit("info", msg, ctx, traceId),
    warn: (msg, ctx) => emit("warn", msg, ctx, traceId),
    error: (msg, ctx) => emit("error", msg, ctx, traceId),
    withTrace: (id: string) => buildLogger(id),
  }
}

export const log: Logger = buildLogger()
