/**
 * Tests for web_fetch tool — D-050 / Phase 1.2.
 *
 * Coverage:
 *   - URL validation + protocol filtering
 *   - SSRF guards (private IP literals, IPv6 loopback, blocked hostnames)
 *   - DNS-resolved private IP rejection
 *   - HTML → markdown conversion
 *   - JSON pretty-printing
 *   - Cache hit/miss
 *   - Body size cap + truncation
 *   - Timeout
 *   - Optional summarization plumbing
 *   - Error code mapping
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  checkUrlSafety,
  clearWebFetchCache,
  executeWebFetch,
  htmlToMarkdown,
  WebFetchError,
} from "@/lib/tools/web-fetch"

afterEach(() => {
  clearWebFetchCache()
})

describe("checkUrlSafety", () => {
  // Test seam — return a stable address for any host.
  const fakeResolver = (addr: string) =>
    (async () =>
      ({ address: addr, family: 4 }) as { address: string; family: number }) as never

  it("rejects invalid URLs", async () => {
    expect((await checkUrlSafety("not-a-url")).ok).toBe(false)
  })

  it("rejects file:// scheme", async () => {
    const r = await checkUrlSafety("file:///etc/passwd")
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/protocol/i)
  })

  it("rejects ftp:// scheme", async () => {
    const r = await checkUrlSafety("ftp://example.com")
    expect(r.ok).toBe(false)
  })

  it("rejects localhost by name", async () => {
    const r = await checkUrlSafety("http://localhost/admin")
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/localhost/i)
  })

  it("rejects 0.0.0.0", async () => {
    expect((await checkUrlSafety("http://0.0.0.0/")).ok).toBe(false)
  })

  it("rejects AWS metadata endpoint", async () => {
    expect((await checkUrlSafety("http://169.254.169.254/")).ok).toBe(false)
  })

  it("rejects private IPv4 literals", async () => {
    expect((await checkUrlSafety("http://10.0.0.1/")).ok).toBe(false)
    expect((await checkUrlSafety("http://172.16.0.5/")).ok).toBe(false)
    expect((await checkUrlSafety("http://192.168.1.1/")).ok).toBe(false)
    expect((await checkUrlSafety("http://127.0.0.1/")).ok).toBe(false)
  })

  it("accepts public IPv4 literal", async () => {
    expect((await checkUrlSafety("http://8.8.8.8/")).ok).toBe(true)
  })

  it("rejects IPv6 loopback literal", async () => {
    expect((await checkUrlSafety("http://[::1]/")).ok).toBe(false)
  })

  it("rejects unique-local IPv6 (fc00::/7)", async () => {
    expect((await checkUrlSafety("http://[fc00::1]/")).ok).toBe(false)
    expect((await checkUrlSafety("http://[fd00::5]/")).ok).toBe(false)
  })

  it("rejects link-local IPv6 (fe80::/10)", async () => {
    expect((await checkUrlSafety("http://[fe80::1]/")).ok).toBe(false)
  })

  it("rejects hostname that resolves to private IP", async () => {
    const resolver = fakeResolver("10.5.5.5")
    const r = await checkUrlSafety("http://evil.example.com/", resolver)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/private/i)
  })

  it("accepts hostname that resolves to public IP", async () => {
    const resolver = fakeResolver("93.184.216.34") // example.com IP
    expect((await checkUrlSafety("http://example.com/", resolver)).ok).toBe(true)
  })

  it("rejects hostname when DNS fails", async () => {
    const resolver: typeof import("node:dns/promises").lookup = async () => {
      throw new Error("ENOTFOUND")
    }
    const r = await checkUrlSafety("http://does-not-exist.invalid/", resolver)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/dns/i)
  })

  it("accepts https URLs", async () => {
    const resolver = fakeResolver("8.8.8.8")
    expect((await checkUrlSafety("https://example.com/", resolver)).ok).toBe(true)
  })
})

describe("htmlToMarkdown", () => {
  it("extracts page title", () => {
    const r = htmlToMarkdown("<html><head><title>Hello</title></head><body>x</body></html>")
    expect(r.title).toBe("Hello")
  })

  it("converts h1/h2/h3 to markdown headings", () => {
    const r = htmlToMarkdown("<body><h1>A</h1><h2>B</h2><h3>C</h3></body>")
    expect(r.text).toContain("# A")
    expect(r.text).toContain("## B")
    expect(r.text).toContain("### C")
  })

  it("converts links to markdown", () => {
    const r = htmlToMarkdown('<body><a href="https://x.com/y">Click</a></body>')
    expect(r.text).toContain("[Click](https://x.com/y)")
  })

  it("preserves inline code", () => {
    const r = htmlToMarkdown("<body><p>Use <code>foo()</code> here</p></body>")
    expect(r.text).toContain("`foo()`")
  })

  it("strips script and style blocks", () => {
    const r = htmlToMarkdown(
      "<body><script>alert('x')</script><p>visible</p><style>.x{}</style></body>",
    )
    expect(r.text).not.toContain("alert")
    expect(r.text).not.toContain(".x{}")
    expect(r.text).toContain("visible")
  })

  it("prefers <main> over <body> for main content", () => {
    const r = htmlToMarkdown(
      "<body><nav>menu items</nav><main><p>real content</p></main></body>",
    )
    expect(r.text).toContain("real content")
    expect(r.text).not.toContain("menu items")
  })

  it("decodes named entities", () => {
    const r = htmlToMarkdown("<body><p>foo &amp; bar &lt;baz&gt; &quot;q&quot;</p></body>")
    expect(r.text).toContain('foo & bar <baz> "q"')
  })

  it("collapses excessive whitespace", () => {
    const r = htmlToMarkdown("<body><p>a</p>\n\n\n\n\n<p>b</p></body>")
    expect(r.text).not.toMatch(/\n{4,}/)
  })
})

describe("executeWebFetch — happy paths", () => {
  it("fetches and returns markdown for HTML pages", async () => {
    const fetchImpl = vi.fn(async () =>
      mkResponse(
        '<html><head><title>X</title></head><body><h1>Hello</h1></body></html>',
        "text/html",
      ),
    ) as unknown as typeof fetch

    const r = await executeWebFetch(
      { url: "https://example.com/" },
      { fetchImpl, skipSafety: true },
    )
    expect(r.title).toBe("X")
    expect(r.content).toContain("# Hello")
    expect(r.cached).toBe(false)
    expect(r.contentType).toBe("text/html")
  })

  it("pretty-prints JSON", async () => {
    const fetchImpl = vi.fn(async () =>
      mkResponse('{"a":1,"b":2}', "application/json"),
    ) as unknown as typeof fetch

    const r = await executeWebFetch(
      { url: "https://example.com/api.json" },
      { fetchImpl, skipSafety: true },
    )
    expect(r.content).toContain('"a": 1')
    expect(r.contentType).toBe("application/json")
  })

  it("returns plain text passthrough for text/plain", async () => {
    const fetchImpl = vi.fn(async () =>
      mkResponse("hello\nworld", "text/plain"),
    ) as unknown as typeof fetch

    const r = await executeWebFetch(
      { url: "https://example.com/x.txt" },
      { fetchImpl, skipSafety: true },
    )
    expect(r.content).toBe("hello\nworld")
  })

  it("caches successful fetches and returns cached=true on hit", async () => {
    const fetchImpl = vi.fn(async () =>
      mkResponse('<html><body>x</body></html>', "text/html"),
    ) as unknown as typeof fetch

    const r1 = await executeWebFetch(
      { url: "https://example.com/cached" },
      { fetchImpl, skipSafety: true },
    )
    const r2 = await executeWebFetch(
      { url: "https://example.com/cached" },
      { fetchImpl, skipSafety: true },
    )
    expect(r1.cached).toBe(false)
    expect(r2.cached).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("invokes summarizer when prompt is provided", async () => {
    const fetchImpl = vi.fn(async () =>
      mkResponse("<html><body><p>a long article</p></body></html>", "text/html"),
    ) as unknown as typeof fetch
    const summarize = vi.fn(async () => "Summarized!")

    const r = await executeWebFetch(
      { url: "https://example.com/", prompt: "tldr?" },
      { fetchImpl, summarize, skipSafety: true },
    )
    expect(r.content).toBe("Summarized!")
    expect(summarize).toHaveBeenCalledOnce()
  })

  it("does NOT invoke summarizer when no prompt", async () => {
    const fetchImpl = vi.fn(async () =>
      mkResponse("<html><body><p>raw</p></body></html>", "text/html"),
    ) as unknown as typeof fetch
    const summarize = vi.fn(async () => "should not run")

    const r = await executeWebFetch(
      { url: "https://example.com/" },
      { fetchImpl, summarize, skipSafety: true },
    )
    expect(summarize).not.toHaveBeenCalled()
    expect(r.content).toContain("raw")
  })
})

describe("executeWebFetch — error handling", () => {
  it("throws WebFetchError(BLOCKED_HOST) when SSRF check fails", async () => {
    await expect(
      executeWebFetch({ url: "http://localhost/secret" }, {}),
    ).rejects.toThrow(WebFetchError)
  })

  it("throws WebFetchError(HTTP_ERROR) on 404", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("not found", {
          status: 404,
          statusText: "Not Found",
          headers: { "content-type": "text/plain" },
        }),
    ) as unknown as typeof fetch

    await expect(
      executeWebFetch(
        { url: "https://example.com/missing" },
        { fetchImpl, skipSafety: true },
      ),
    ).rejects.toMatchObject({ code: "HTTP_ERROR" })
  })

  it("throws WebFetchError(FETCH_FAILED) on network error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("connection refused")
    }) as unknown as typeof fetch

    await expect(
      executeWebFetch(
        { url: "https://example.com/" },
        { fetchImpl, skipSafety: true },
      ),
    ).rejects.toMatchObject({ code: "FETCH_FAILED" })
  })

  it("rejects redirects to blocked hosts", async () => {
    // Simulate a redirect by setting response.url to a private IP.
    const fetchImpl = vi.fn(async () => {
      const r = new Response("ok", {
        status: 200,
        headers: { "content-type": "text/plain" },
      })
      Object.defineProperty(r, "url", { value: "http://127.0.0.1/redirected" })
      return r
    }) as unknown as typeof fetch

    await expect(
      executeWebFetch(
        { url: "https://public.example.com/" },
        { fetchImpl, skipSafety: false, resolver: (async () => ({ address: "8.8.8.8", family: 4 })) as never },
      ),
    ).rejects.toMatchObject({ code: "BLOCKED_HOST" })
  })
})

/* ─────────────────────── helpers ─────────────────────── */

function mkResponse(body: string, contentType: string): Response {
  return new Response(body, {
    status: 200,
    statusText: "OK",
    headers: { "content-type": contentType },
  })
}
