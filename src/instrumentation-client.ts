// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { polarisBeforeSend } from "@/lib/observability/sentry-before-send";

Sentry.init({
  dsn:
    process.env.NEXT_PUBLIC_SENTRY_DSN ??
    "https://5a5ad5d9846faece0a4727540f810281@o4510149980258304.ingest.de.sentry.io/4510621155983440",

  integrations: [
    Sentry.replayIntegration({
      // Mask all text and inputs by default. CONSTITUTION §15.2 — no PII / secrets.
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
  ],

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,
  enableLogs: true,

  replaysSessionSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,

  // No PII; redaction enforced via beforeSend.
  sendDefaultPii: false,
  beforeSend: polarisBeforeSend,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
