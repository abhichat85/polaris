// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { polarisBeforeSend } from "@/lib/observability/sentry-before-send";

Sentry.init({
  dsn:
    process.env.SENTRY_DSN ??
    "https://5a5ad5d9846faece0a4727540f810281@o4510149980258304.ingest.de.sentry.io/4510621155983440",

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,

  // CONSTITUTION §15.2: no plaintext message bodies / tool i-o / emails / keys.
  // Redaction is enforced via beforeSend, not relied on at the call site.
  sendDefaultPii: false,

  beforeSend: polarisBeforeSend,

  enableLogs: true,
  integrations: [
    Sentry.vercelAIIntegration,
    Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
  ],
});
