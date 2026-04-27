import { Inngest } from "inngest";
import { sentryMiddleware } from "@inngest/middleware-sentry";

/**
 * Inngest client.
 *
 * Dev-vs-prod routing matters here. Inngest SDK 3.x auto-detects mode:
 *   - If INNGEST_EVENT_KEY is set in the env, it routes events to the
 *     cloud API (https://inn.gs/...).
 *   - Otherwise it tries the local dev server (http://localhost:8288).
 *
 * Polaris .env.local has INNGEST_EVENT_KEY pasted from production
 * (so the prod build picks it up) which causes local `pnpm dev` to
 * try cloud → 401 Event key not found because the prod key isn't
 * valid for this dev environment. Fix: explicitly pass `isDev: true`
 * when NODE_ENV !== "production". This overrides env-var auto-detection
 * and forces routing to the local dev server, regardless of which
 * keys are present in .env.local.
 *
 * IMPORTANT — local dev requires the Inngest dev server running:
 *
 *   npx inngest-cli@latest dev
 *
 * (added as `pnpm inngest:dev` in package.json). Without it, sends
 * fail with ECONNREFUSED on http://localhost:8288. Run that command
 * in a third terminal alongside `pnpm dev` and `pnpm convex:dev`.
 */

const isDev = process.env.NODE_ENV !== "production";

export const inngest = new Inngest({
  id: "polaris",
  // `isDev: true` overrides INNGEST_EVENT_KEY auto-detection. In prod
  // (NODE_ENV=production) we leave this undefined so the SDK reads the
  // event key from env as normal.
  ...(isDev ? { isDev: true } : {}),
  middleware: [sentryMiddleware()],
});
