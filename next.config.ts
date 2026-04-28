import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Cross-Origin Isolation headers required by WebContainers (StackBlitz).
   * SharedArrayBuffer is only available when a page is cross-origin isolated.
   * Scoped to /projects/* so marketing / auth pages are unaffected.
   *
   * Docs: https://webcontainers.io/guides/browser-support
   *
   * Note: @codemirror/state deduplication is handled via pnpm.overrides in
   * package.json (forces all packages to share the same 6.5.3 instance).
   * This prevents the "Unrecognized extension value … multiple instances of
   * @codemirror/state" runtime error in the code editor.
   */
  async headers() {
    return [
      {
        // Apply cross-origin isolation to the project IDE pages.
        // `credentialless` COEP allows third-party assets without CORP headers
        // (unlike `require-corp`) while still enabling SharedArrayBuffer.
        source: "/projects/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
      {
        // All Next.js static chunks must be cross-origin readable when the
        // project page enforces COEP — otherwise the browser blocks them.
        source: "/_next/:path*",
        headers: [
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        ],
      },
      {
        // API routes called from the cross-origin-isolated project page.
        source: "/api/:path*",
        headers: [
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "john-doe-fb",

  project: "polaris",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  }
});
