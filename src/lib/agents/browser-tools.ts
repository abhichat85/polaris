/**
 * D-029 — Real browser tool implementations.
 *
 * Strategy: each browser_* tool generates a tiny standalone Node script,
 * writes it to /tmp inside the sandbox, then executes it via
 * `sandbox.exec("node /tmp/<script>.cjs")`. The script connects to the
 * dev-server URL the sandbox already exposes and uses Playwright's
 * Chromium.
 *
 * Pre-condition: the sandbox image must have `playwright + chromium`
 * preinstalled (the operator-side bake — see
 * `docs/runbooks/e2b-image-bake.md`). When absent, Playwright's import
 * fails and we surface a clear error so the agent adapts.
 */

import type { SandboxProvider } from "@/lib/sandbox/types"

export type BrowserViewport = "mobile" | "tablet" | "desktop"

const VIEWPORTS: Record<BrowserViewport, { width: number; height: number }> = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  desktop: { width: 1280, height: 800 },
}

/**
 * Default URL the agent's headless browser navigates to. The sandbox's
 * dev server typically runs on port 3000 — the WebContainer + E2B
 * preview convention is `http://localhost:3000`.
 */
const DEV_SERVER_BASE = "http://localhost:3000"

const TIMEOUT_MS = 30_000

interface BrowserResult {
  ok: boolean
  data?: unknown
  error?: string
}

/**
 * Truncate a long blob to a 4 KB tail. Used for DOM dumps + base64 PNG
 * payloads so we don't blow tool-result token budgets.
 */
function truncateTail(s: string, max = 4096): string {
  if (s.length <= max) return s
  return `…(truncated to last ${max} bytes from ${s.length})…\n${s.slice(-max)}`
}

/**
 * Common Playwright bootstrap — checks the import is available and
 * reports a clean error otherwise.
 */
const BOOTSTRAP = `
let playwright;
try { playwright = require("playwright"); } catch (err) {
  process.stdout.write(JSON.stringify({
    ok: false,
    error: "BROWSER_NOT_AVAILABLE: playwright is not installed in this sandbox. Operator must rebuild the E2B image with 'npm install playwright && npx playwright install chromium'."
  }));
  process.exit(0);
}
const { chromium } = playwright;
`

async function execScript(
  sandbox: SandboxProvider,
  sandboxId: string,
  scriptName: string,
  body: string,
): Promise<BrowserResult> {
  const script = BOOTSTRAP + "\n" + body
  // Write the script via the sandbox file API.
  await sandbox.writeFile(sandboxId, `/tmp/${scriptName}`, script)
  const r = await sandbox.exec(sandboxId, `node /tmp/${scriptName}`, {
    timeoutMs: TIMEOUT_MS,
  })
  if (r.exitCode !== 0) {
    return {
      ok: false,
      error: `BROWSER_SCRIPT_FAILED (exit ${r.exitCode}): ${truncateTail(
        r.stderr || r.stdout || "no output",
      )}`,
    }
  }
  try {
    const parsed = JSON.parse(r.stdout.trim()) as BrowserResult
    return parsed
  } catch (err) {
    return {
      ok: false,
      error: `BROWSER_PARSE_FAILED: ${err instanceof Error ? err.message : "unknown"}\nstdout: ${truncateTail(r.stdout)}`,
    }
  }
}

export async function browserNavigate(
  sandbox: SandboxProvider,
  sandboxId: string,
  path: string,
): Promise<BrowserResult> {
  const url = path.startsWith("http")
    ? path
    : `${DEV_SERVER_BASE}${path.startsWith("/") ? path : "/" + path}`
  const body = `
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(${JSON.stringify(url)}, { waitUntil: "load", timeout: 20000 });
  const finalUrl = page.url();
  const title = await page.title();
  await browser.close();
  process.stdout.write(JSON.stringify({ ok: true, data: { url: finalUrl, title } }));
})().catch((err) => {
  process.stdout.write(JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err) }));
});
`
  return execScript(sandbox, sandboxId, "polaris-browser-navigate.cjs", body)
}

export async function browserScreenshot(
  sandbox: SandboxProvider,
  sandboxId: string,
  viewport: BrowserViewport = "desktop",
): Promise<BrowserResult> {
  const v = VIEWPORTS[viewport]
  const body = `
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: ${v.width}, height: ${v.height} } });
  const page = await ctx.newPage();
  await page.goto(${JSON.stringify(DEV_SERVER_BASE)}, { waitUntil: "networkidle", timeout: 20000 });
  const buf = await page.screenshot({ type: "png", fullPage: false });
  await browser.close();
  process.stdout.write(JSON.stringify({
    ok: true,
    data: { mimeType: "image/png", base64: buf.toString("base64"), viewport: ${JSON.stringify(viewport)} }
  }));
})().catch((err) => {
  process.stdout.write(JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err) }));
});
`
  return execScript(sandbox, sandboxId, "polaris-browser-screenshot.cjs", body)
}

export async function browserClick(
  sandbox: SandboxProvider,
  sandboxId: string,
  selector: string,
): Promise<BrowserResult> {
  const body = `
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(${JSON.stringify(DEV_SERVER_BASE)}, { waitUntil: "load", timeout: 20000 });
  await page.click(${JSON.stringify(selector)}, { timeout: 8000 });
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => null);
  const url = page.url();
  const title = await page.title();
  await browser.close();
  process.stdout.write(JSON.stringify({ ok: true, data: { url, title } }));
})().catch((err) => {
  process.stdout.write(JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err) }));
});
`
  return execScript(sandbox, sandboxId, "polaris-browser-click.cjs", body)
}

export async function browserInspect(
  sandbox: SandboxProvider,
  sandboxId: string,
  selector?: string,
): Promise<BrowserResult> {
  const sel = selector
    ? JSON.stringify(selector)
    : "null"
  const body = `
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(${JSON.stringify(DEV_SERVER_BASE)}, { waitUntil: "load", timeout: 20000 });
  let html;
  if (${sel}) {
    const h = await page.locator(${sel}).first();
    html = await h.innerHTML().catch(() => "");
  } else {
    html = await page.content();
  }
  await browser.close();
  process.stdout.write(JSON.stringify({ ok: true, data: { html } }));
})().catch((err) => {
  process.stdout.write(JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err) }));
});
`
  const r = await execScript(sandbox, sandboxId, "polaris-browser-inspect.cjs", body)
  // Truncate the DOM in the success path so it fits tool-result budget.
  if (r.ok && r.data && typeof (r.data as { html?: string }).html === "string") {
    const data = r.data as { html: string }
    return { ok: true, data: { html: truncateTail(data.html) } }
  }
  return r
}
