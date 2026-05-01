/**
 * web_fetch — D-050 / Phase 1.2.
 *
 * Fetches a URL and returns its content as Markdown-ish text. Designed
 * for the agent to read documentation, library READMEs, API specs, blog
 * posts — anything reachable over HTTP(S) — without leaving training data
 * to hallucinate.
 *
 * Safety surface:
 *   - Strict SSRF guards: DNS resolution + private-IP rejection (v4 + v6)
 *   - Hard 30s timeout, 1 MB body cap
 *   - Final-URL re-check after redirects (DNS rebinding mitigation)
 *   - Only http: / https: schemes accepted
 *   - 15-minute LRU cache to avoid hammering the same URL across turns
 *
 * Output:
 *   - HTML pages → tag-stripped + heading-preserving Markdown approximation
 *   - JSON → pretty-printed
 *   - text/* and application/* → returned as-is
 *
 * Optional summarization: when `prompt` is set and a summarizer dep is
 * wired (Haiku), the raw content is replaced with a focused summary.
 * Otherwise the raw text is returned unchanged.
 */

import { lookup } from "node:dns/promises"

/** Private IPv4 patterns we never let the agent reach. */
const PRIVATE_IPV4_PATTERNS = [
  /^10\./,
  /^172\.(?:1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  /^0\./,
  /^255\.255\.255\.255$/,
  /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT
]

/** Hostnames that bypass DNS — block them by string before resolving. */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "0.0.0.0",
  "metadata.google.internal",
  "metadata",
  "instance-data",
  "169.254.169.254", // AWS / Azure metadata
])

/** Hard ceiling on response body — refuses pages larger than this. */
export const MAX_RESPONSE_BYTES = 1_000_000 // 1 MB
/** Total fetch timeout including redirects. */
export const FETCH_TIMEOUT_MS = 30_000
/** Cache TTL — same URL within this window returns the cached fetch. */
export const CACHE_TTL_MS = 15 * 60_000

export interface WebFetchArgs {
  /** Absolute http(s) URL to fetch. */
  url: string
  /**
   * Optional natural-language question. When set AND a summarizer dep
   * is wired, the response is replaced with a focused summary instead
   * of the raw page.
   */
  prompt?: string
}

export interface WebFetchOutput {
  /** Body content — text or markdown-approximation depending on Content-Type. */
  content: string
  /** Final URL after redirects. */
  url: string
  /** Page title if extractable from HTML <title>. */
  title?: string
  /** True when the result came from the in-memory cache. */
  cached: boolean
  /** True when the body exceeded MAX_RESPONSE_BYTES and was cut off. */
  truncated: boolean
  /** Content-Type minus parameters (e.g. "text/html"). */
  contentType: string
}

export type WebFetchErrorCode =
  | "INVALID_URL"
  | "BLOCKED_HOST"
  | "DNS_FAILED"
  | "TIMEOUT"
  | "HTTP_ERROR"
  | "FETCH_FAILED"

export class WebFetchError extends Error {
  constructor(
    readonly code: WebFetchErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "WebFetchError"
  }
}

interface CacheEntry {
  value: WebFetchOutput
  expiresAt: number
}
const memCache = new Map<string, CacheEntry>()

/** Visible for tests. */
export function clearWebFetchCache(): void {
  memCache.clear()
}

/* ─────────────────────────────────────────────────────────────────────────
 * SSRF guard
 * ───────────────────────────────────────────────────────────────────── */

interface SafetyResult {
  ok: boolean
  reason?: string
}

export async function checkUrlSafety(
  urlStr: string,
  resolver: typeof lookup = lookup,
): Promise<SafetyResult> {
  let url: URL
  try {
    url = new URL(urlStr)
  } catch {
    return { ok: false, reason: "Invalid URL" }
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `Unsupported protocol: ${url.protocol}` }
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (!hostname) {
    return { ok: false, reason: "Empty hostname" }
  }
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { ok: false, reason: `Blocked hostname: ${hostname}` }
  }

  // IPv4 literal — check ranges directly.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    if (PRIVATE_IPV4_PATTERNS.some((p) => p.test(hostname))) {
      return { ok: false, reason: `Private IP literal: ${hostname}` }
    }
    return { ok: true }
  }

  // IPv6 literal — block loopback / link-local / unique-local.
  if (hostname.includes(":")) {
    if (
      hostname === "::1" ||
      /^fe[89ab][0-9a-f]:/i.test(hostname) ||
      /^fc[0-9a-f]{2}:/i.test(hostname) ||
      /^fd[0-9a-f]{2}:/i.test(hostname)
    ) {
      return { ok: false, reason: `Private IPv6 literal: ${hostname}` }
    }
    return { ok: true }
  }

  // Hostname — resolve and check.
  try {
    const { address } = await resolver(hostname)
    if (PRIVATE_IPV4_PATTERNS.some((p) => p.test(address))) {
      return { ok: false, reason: `Resolved to private IP: ${address}` }
    }
    if (
      address === "::1" ||
      /^fe[89ab][0-9a-f]:/i.test(address) ||
      /^fc[0-9a-f]{2}:/i.test(address) ||
      /^fd[0-9a-f]{2}:/i.test(address)
    ) {
      return { ok: false, reason: `Resolved to non-routable IPv6: ${address}` }
    }
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      reason: `DNS resolution failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * HTML → text/markdown approximation
 *
 * This is intentionally simple — about 60 lines of regex. It handles the
 * common documentation-page patterns (MDN, React docs, GitHub READMEs,
 * blog posts) well enough for the agent. For pixel-perfect conversion
 * a future iteration can plug in turndown/cheerio.
 * ───────────────────────────────────────────────────────────────────── */

export function htmlToMarkdown(html: string): { text: string; title: string } {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : ""

  // Prefer <main> or <article>; fall back to <body>; then full doc.
  const mainMatch =
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) ??
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)
  let body = mainMatch
    ? mainMatch[1]
    : (html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html)

  // Strip non-content elements wholesale.
  body = body.replace(
    /<(script|style|noscript|iframe|svg|nav|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,
    "",
  )

  // Convert structural elements before stripping all tags.
  body = body
    .replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, "\n\n# $1\n")
    .replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, "\n\n## $1\n")
    .replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi, "\n\n### $1\n")
    .replace(/<h4\b[^>]*>([\s\S]*?)<\/h4>/gi, "\n\n#### $1\n")
    .replace(/<h5\b[^>]*>([\s\S]*?)<\/h5>/gi, "\n\n##### $1\n")
    .replace(/<h6\b[^>]*>([\s\S]*?)<\/h6>/gi, "\n\n###### $1\n")
    .replace(/<\/(?:p|div|section|article|li|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, "`$1`")
    .replace(/<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, "**$1**")
    .replace(/<(?:em|i)\b[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, "*$1*")
    .replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, "\n```\n$1\n```\n")

  // Strip remaining HTML tags.
  body = body.replace(/<[^>]+>/g, "")

  // Decode entities and collapse whitespace.
  body = decodeEntities(body)
  body = body
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  return { text: body, title }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
}

/* ─────────────────────────────────────────────────────────────────────────
 * Main entry
 * ───────────────────────────────────────────────────────────────────── */

export interface WebFetchDeps {
  /** Optional summarizer (Haiku). When set + prompt provided, replaces content. */
  summarize?: (content: string, prompt: string, url: string) => Promise<string>
  /** Test seam: replace fetch. */
  fetchImpl?: typeof fetch
  /** Test seam: replace DNS resolver. */
  resolver?: typeof lookup
  /** Test seam: clock for cache. */
  now?: () => number
  /** Test seam: bypass safety checks. */
  skipSafety?: boolean
}

export async function executeWebFetch(
  args: WebFetchArgs,
  deps: WebFetchDeps = {},
): Promise<WebFetchOutput> {
  const now = deps.now ?? (() => Date.now())
  const fetchImpl = deps.fetchImpl ?? fetch

  // Cache lookup — keyed on URL + prompt so summaries don't collide.
  const cacheKey = `${args.url}::${args.prompt ?? ""}`
  const cached = memCache.get(cacheKey)
  if (cached && cached.expiresAt > now()) {
    return { ...cached.value, cached: true }
  }

  // Safety check (initial URL).
  if (!deps.skipSafety) {
    const safety = await checkUrlSafety(args.url, deps.resolver ?? lookup)
    if (!safety.ok) {
      throw new WebFetchError("BLOCKED_HOST", safety.reason ?? "Blocked")
    }
  }

  // Fetch with timeout.
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetchImpl(args.url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Polaris-Agent/1.0 (+https://polaris.app)",
        Accept:
          "text/html,text/plain,text/markdown,application/json,application/xml;q=0.9",
      },
    })
  } catch (err) {
    clearTimeout(timer)
    if ((err as { name?: string })?.name === "AbortError") {
      throw new WebFetchError("TIMEOUT", `Fetch exceeded ${FETCH_TIMEOUT_MS}ms`)
    }
    throw new WebFetchError(
      "FETCH_FAILED",
      err instanceof Error ? err.message : String(err),
    )
  }
  clearTimeout(timer)

  if (!response.ok) {
    throw new WebFetchError(
      "HTTP_ERROR",
      `${response.status} ${response.statusText}`,
    )
  }

  // Re-check final URL after redirects (DNS rebinding mitigation).
  const finalUrl = response.url || args.url
  if (!deps.skipSafety && finalUrl !== args.url) {
    const safety = await checkUrlSafety(finalUrl, deps.resolver ?? lookup)
    if (!safety.ok) {
      throw new WebFetchError(
        "BLOCKED_HOST",
        `Redirect to unsafe target — ${safety.reason}`,
      )
    }
  }

  const contentType = (response.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase()

  // Read body with size cap.
  const body = await readWithCap(response)
  let content = body.text
  let title = ""

  if (contentType.startsWith("text/html") || contentType === "application/xhtml+xml") {
    const md = htmlToMarkdown(body.text)
    content = md.text
    title = md.title
  } else if (contentType === "application/json") {
    try {
      content = JSON.stringify(JSON.parse(body.text), null, 2)
    } catch {
      // keep raw
    }
  }

  // Optional summarization.
  if (args.prompt && deps.summarize) {
    content = await deps.summarize(content, args.prompt, finalUrl)
  }

  const output: WebFetchOutput = {
    content,
    url: finalUrl,
    title: title || undefined,
    cached: false,
    truncated: body.truncated,
    contentType,
  }

  memCache.set(cacheKey, { value: output, expiresAt: now() + CACHE_TTL_MS })
  return output
}

async function readWithCap(
  response: Response,
): Promise<{ text: string; truncated: boolean }> {
  const reader = response.body?.getReader()
  if (!reader) {
    const text = await response.text()
    return { text: text.slice(0, MAX_RESPONSE_BYTES), truncated: text.length > MAX_RESPONSE_BYTES }
  }
  const chunks: Uint8Array[] = []
  let received = 0
  let truncated = false
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      received += value.length
      if (received > MAX_RESPONSE_BYTES) {
        truncated = true
        await reader.cancel()
        break
      }
      chunks.push(value)
    }
  }
  // Concatenate
  const total = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let offset = 0
  for (const c of chunks) {
    total.set(c, offset)
    offset += c.length
  }
  return { text: new TextDecoder("utf-8").decode(total), truncated }
}
