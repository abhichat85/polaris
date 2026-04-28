/**
 * D-043 — Runtime tap script-tag injection helper.
 *
 * Returns the snippet to drop into the user project's root layout
 * (e.g. `app/layout.tsx`) so the preview app loads
 * `polaris-runtime-tap.js` and starts capturing runtime errors.
 *
 * The data-project-id is sourced from `NEXT_PUBLIC_POLARIS_PROJECT_ID`
 * which the sandbox provisioner injects into the project's env at
 * boot time. Skipped automatically when the env var is absent (e.g.
 * if the user clones the project to their own laptop).
 */

import type { Plan } from "@/lib/agents/agent-runner"

export interface RuntimeTapConfig {
  /** Where polaris-runtime-tap.js is hosted. */
  scriptOrigin: string
  /** Where the ingest proxy lives. Same-origin works for most setups;
   * sandbox preview pages need an absolute URL pointing at Polaris. */
  ingestUrl: string
}

const DEFAULT_SCRIPT_ORIGIN =
  process.env.NEXT_PUBLIC_POLARIS_ORIGIN ?? "https://build.praxiomai.xyz"

const DEFAULT_INGEST_URL = `${DEFAULT_SCRIPT_ORIGIN}/api/runtime-error`

export function defaultRuntimeTapConfig(): RuntimeTapConfig {
  return {
    scriptOrigin: DEFAULT_SCRIPT_ORIGIN,
    ingestUrl: DEFAULT_INGEST_URL,
  }
}

/**
 * Returns the JSX snippet for Next.js scaffold templates. Only renders
 * when the runtime project-id env var is present so a manual local
 * clone of the project doesn't dial home unintentionally.
 */
export function runtimeTapJsxSnippet(cfg: RuntimeTapConfig = defaultRuntimeTapConfig()): string {
  return `        {process.env.NEXT_PUBLIC_POLARIS_PROJECT_ID && (
          <script
            src="${cfg.scriptOrigin}/polaris-runtime-tap.js"
            data-project-id={process.env.NEXT_PUBLIC_POLARIS_PROJECT_ID}
            data-ingest-url="${cfg.ingestUrl}"
            async
          />
        )}`
}

/**
 * Returns a plain HTML <script> snippet for non-React templates
 * (Vite vanilla, Astro, Flask, etc).
 */
export function runtimeTapHtmlSnippet(
  projectId: string,
  cfg: RuntimeTapConfig = defaultRuntimeTapConfig(),
): string {
  return `<script src="${cfg.scriptOrigin}/polaris-runtime-tap.js" data-project-id="${projectId}" data-ingest-url="${cfg.ingestUrl}" async></script>`
}

/**
 * Free-tier projects skip the script injection entirely — the runtime
 * capture costs Convex storage + ingest CPU. Pro/Team get the tap.
 * Caller (scaffold step) decides per-project at provision time.
 */
export function shouldInjectRuntimeTap(plan: Plan): boolean {
  return plan === "pro" || plan === "team"
}
