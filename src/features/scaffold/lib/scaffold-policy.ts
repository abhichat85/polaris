/**
 * Scaffold-time path validation. Authority: sub-plan 03 §7, CONSTITUTION §9.
 *
 * Differs from FilePermissionPolicy.canWrite:
 *   - The base template ships locked files (package.json, tsconfig, etc.).
 *     Those are owned by the template; if Claude emits them, the merge layer
 *     silently overrides Claude's version with the template's.
 *   - All other paths must pass FilePermissionPolicy (i.e. live inside a
 *     writable directory).
 *
 * This module is what protects us from a model that tries to write
 * .github/workflows/exfil.yml into a fresh project.
 */

import { FilePermissionPolicy } from "@/lib/tools/file-permission-policy"
import type { GeneratedFile } from "../types"

export const SCAFFOLD_TEMPLATE_PATHS = [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "next.config.ts",
  "tailwind.config.ts",
  "postcss.config.mjs",
  ".gitignore",
  ".env.example",
  "src/middleware.ts",
  "src/lib/utils.ts",
  "src/lib/supabase/client.ts",
  "src/lib/supabase/server.ts",
  "src/components/ui/button.tsx",
  "src/components/ui/card.tsx",
  "src/components/ui/input.tsx",
  "src/app/globals.css",
  "src/app/layout.tsx",
  "README.md",
] as const

const TEMPLATE_PATH_SET = new Set<string>(SCAFFOLD_TEMPLATE_PATHS)

export function isScaffoldTemplatePath(path: string): boolean {
  return TEMPLATE_PATH_SET.has(path)
}

export interface PolicyViolation {
  path: string
  reason: string
}

export type PolicyResult =
  | { ok: true }
  | { ok: false; violations: PolicyViolation[] }

/**
 * Validates a list of generated files against the scaffold policy.
 * - Template paths are silently allowed (will be overridden by merge layer).
 * - All other paths must pass FilePermissionPolicy.canWrite.
 */
export function validateScaffoldPaths(files: GeneratedFile[]): PolicyResult {
  const violations: PolicyViolation[] = []
  for (const f of files) {
    if (isScaffoldTemplatePath(f.path)) continue
    if (!FilePermissionPolicy.canWrite(f.path)) {
      violations.push({
        path: f.path,
        reason: `Path is locked or outside writable directories.`,
      })
    }
  }
  return violations.length === 0 ? { ok: true } : { ok: false, violations }
}
