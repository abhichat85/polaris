/**
 * Polaris Runtime Tap — D-043.
 *
 * Captures runtime events from the preview app and POSTs them to the
 * Polaris ingest proxy. Loaded via `<script src=".../polaris-runtime-tap.js"
 * data-project-id="..." async>` injected by the scaffold templates.
 *
 * Hooks (one-way, never blocks user code):
 *   - window.onerror              → kind:"error"
 *   - unhandledrejection          → kind:"unhandled_rejection"
 *   - console.error monkey-patch  → kind:"console_error"
 *   - fetch monkey-patch (4xx/5xx) + thrown errors → kind:"network_error"
 *   - window event "polaris:react-error" → kind:"react_error_boundary"
 *
 * Defensive: every send is wrapped in try/catch + uses `keepalive`
 * so a slow ingest never stalls the preview tab. If the project-id
 * data attribute is missing, the script no-ops silently.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  var projectId = script && script.getAttribute("data-project-id");
  // Default to same-origin if no explicit ingest URL is set. Most
  // user-app setups serve from a Polaris-managed domain so the proxy
  // sits at /api/runtime-error on the same host. For sandbox preview
  // origins (e.g. *.e2b.dev) the data attribute can override.
  var ingestUrl =
    (script && script.getAttribute("data-ingest-url")) ||
    "/api/runtime-error";

  if (!projectId) return;

  function safeStringify(x) {
    try {
      return JSON.stringify(x);
    } catch (_) {
      return String(x);
    }
  }

  function send(payload) {
    try {
      var body = JSON.stringify({
        projectId: projectId,
        timestamp: Date.now(),
        userAgent:
          typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        ...payload,
      });
      // keepalive lets the request survive page unload (errors during
      // navigation are common). Falls back gracefully when unsupported.
      fetch(ingestUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body,
        keepalive: true,
        // Don't send credentials — the ingest endpoint is project-scoped
        // by the data-project-id payload, not by auth cookies.
        credentials: "omit",
      }).catch(function () {
        /* swallow — best-effort */
      });
    } catch (_) {
      /* swallow */
    }
  }

  // 1. Uncaught errors
  window.addEventListener("error", function (e) {
    send({
      kind: "error",
      message: String((e && e.message) || "Uncaught error"),
      stack: e && e.error && e.error.stack,
      url: e && (e.filename || (e.target && e.target.src)),
    });
  });

  // 2. Unhandled promise rejections
  window.addEventListener("unhandledrejection", function (e) {
    var reason = e && e.reason;
    var message =
      (reason && reason.message) || (reason ? String(reason) : "Unhandled rejection");
    send({
      kind: "unhandled_rejection",
      message: String(message),
      stack: reason && reason.stack,
    });
  });

  // 3. console.error monkey-patch
  var origError = console.error;
  console.error = function () {
    try {
      var parts = [];
      for (var i = 0; i < arguments.length; i++) {
        var a = arguments[i];
        parts.push(typeof a === "string" ? a : safeStringify(a));
      }
      send({ kind: "console_error", message: parts.join(" ") });
    } catch (_) {
      /* swallow */
    }
    return origError.apply(console, arguments);
  };

  // 4. fetch monkey-patch — capture 4xx/5xx + thrown errors
  if (typeof window.fetch === "function") {
    var origFetch = window.fetch;
    window.fetch = function (input, init) {
      var url =
        typeof input === "string"
          ? input
          : input && input.url
            ? input.url
            : String(input);
      return origFetch.apply(this, arguments).then(
        function (res) {
          if (res && !res.ok) {
            send({
              kind: "network_error",
              message: res.status + " " + res.statusText,
              url: url,
            });
          }
          return res;
        },
        function (err) {
          send({
            kind: "network_error",
            message: String((err && err.message) || err),
            url: url,
            stack: err && err.stack,
          });
          throw err;
        },
      );
    };
  }

  // 5. React error boundaries — user code dispatches a CustomEvent
  //    `polaris:react-error` from its boundary's componentDidCatch.
  window.addEventListener("polaris:react-error", function (e) {
    var detail = (e && e.detail) || {};
    send({
      kind: "react_error_boundary",
      message: String(detail.message || detail.error || "React error boundary"),
      stack: detail.stack,
      componentStack: detail.componentStack,
    });
  });
})();
