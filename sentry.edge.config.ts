// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { polarisBeforeSend } from "@/lib/observability/sentry-before-send";

Sentry.init({
  dsn:
    process.env.SENTRY_DSN ??
    "https://5a5ad5d9846faece0a4727540f810281@o4510149980258304.ingest.de.sentry.io/4510621155983440",

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,

  sendDefaultPii: false,

  beforeSend: polarisBeforeSend,

  enableLogs: true,
  integrations: [
    Sentry.vercelAIIntegration,
    Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
  ],
});
