/**
 * D-031 — starter lints for the Next.js template.
 *
 * Each lint surfaces a concrete remediation that gets injected verbatim
 * into the next agent turn when the Evaluator returns RETURN-FOR-FIX.
 */

import type { FileForLint, Lint, LintResult } from "./types"

const isPageOrRoute = (p: string) =>
  /^src\/app\/.*\/(?:page|route)\.tsx?$/.test(p)
const isComponent = (p: string) => /^src\/components\/.*\.tsx?$/.test(p)
const isApiRoute = (p: string) => /^src\/app\/api\/.*\/route\.ts$/.test(p)
const isUiFile = (p: string) =>
  /^src\/(?:app|components)\/.*\.tsx?$/.test(p) &&
  !p.endsWith(".test.tsx") &&
  !p.endsWith(".test.ts")

const fail = (
  path: string,
  lintId: string,
  message: string,
  remediation: string,
  severity: "error" | "warning" = "error",
): LintResult => ({ severity, path, lintId, message, remediation })

export const nextJsLints: Lint[] = [
  {
    id: "forbid-direct-fetch-in-page",
    description:
      "Page components shouldn't fetch data directly with raw fetch(); use a route handler or server action.",
    appliesTo: isPageOrRoute,
    check(file: FileForLint): LintResult | null {
      // Match a top-level fetch() call in a page (very crude; good enough for v1).
      if (
        /\n\s*const\s+\w+\s*=\s*await\s+fetch\(/.test(file.content) ||
        /^\s*await\s+fetch\(/m.test(file.content)
      ) {
        return fail(
          file.path,
          "forbid-direct-fetch-in-page",
          "Direct fetch() call inside a page/route component.",
          "Move the fetch into a server action or a /src/app/api/<resource>/route.ts handler. Pages should call your typed API surface, not raw external endpoints.",
        )
      }
      return null
    },
  },
  {
    id: "require-zod-at-api-boundary",
    description:
      "API routes must validate request bodies with Zod (or another runtime validator).",
    appliesTo: isApiRoute,
    check(file: FileForLint): LintResult | null {
      const usesZod =
        /\bz\.\w+\(/.test(file.content) ||
        /from\s+["']zod["']/.test(file.content)
      const acceptsBody = /\.json\(\)|\.formData\(\)|request\.body/.test(
        file.content,
      )
      if (acceptsBody && !usesZod) {
        return fail(
          file.path,
          "require-zod-at-api-boundary",
          "API route reads request body without runtime validation.",
          "Define a `const Body = z.object({ ... })` schema and call `Body.parse(await request.json())` before using the data. Reject malformed requests with a 400 + machine-readable JSON.",
        )
      }
      return null
    },
  },
  {
    id: "forbid-console-log",
    description: "Use a logger; console.log noise in production builds.",
    appliesTo: (p) => isUiFile(p) || isApiRoute(p),
    check(file: FileForLint): LintResult | null {
      if (/\bconsole\.log\(/.test(file.content)) {
        return fail(
          file.path,
          "forbid-console-log",
          "console.log() left in code.",
          "Replace with the project's logger (or remove). Production builds shouldn't print to stdout.",
          "warning",
        )
      }
      return null
    },
  },
  {
    id: "enforce-praxiom-tokens",
    description: "Use Praxiom design tokens; raw hex colors are forbidden.",
    appliesTo: isUiFile,
    check(file: FileForLint): LintResult | null {
      // Allow hex inside string literals only when documented (#fff in a comment is fine).
      const hex = /#[0-9a-fA-F]{3,8}\b/.exec(file.content)
      if (hex) {
        return fail(
          file.path,
          "enforce-praxiom-tokens",
          `Raw hex color literal found: ${hex[0]}`,
          "Replace with a Praxiom design token (e.g. bg-surface-2 / text-foreground / text-muted-foreground / border-border). See docs/DESIGN-SYSTEM.md.",
          "warning",
        )
      }
      return null
    },
  },
  {
    id: "forbid-cross-domain-imports",
    description:
      "Components shouldn't import directly from app routes (cross-layer leak).",
    appliesTo: isComponent,
    check(file: FileForLint): LintResult | null {
      if (/from\s+["']@\/app\//.test(file.content)) {
        return fail(
          file.path,
          "forbid-cross-domain-imports",
          "Component imports from @/app — a cross-layer leak.",
          "Components must not depend on app routes. Lift the shared logic into @/lib or @/features and import from there. Routes import components, not the other way around.",
        )
      }
      return null
    },
  },
]
