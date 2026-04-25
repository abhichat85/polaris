/**
 * Merges Claude's generated files with the deterministic base template.
 * Authority: sub-plan 03 §6.
 *
 * Merge rules:
 *   - Locked template paths (package.json, tsconfig, etc.): TEMPLATE WINS.
 *     If Claude emits one of these, its content is silently dropped.
 *     This protects us from a model that hallucinates a malicious lockfile.
 *   - All other paths: GENERATED WINS over template. The template ships
 *     placeholders for src/app/page.tsx etc. that the real prompt should replace.
 */

import type { GeneratedFile } from "../types"
import { isScaffoldTemplatePath } from "./scaffold-policy"

export function mergeWithTemplate(
  generated: GeneratedFile[],
  template: GeneratedFile[],
): GeneratedFile[] {
  const byPath = new Map<string, GeneratedFile>()

  // 1. Generated files first (they win unless overridden by a locked template path).
  for (const f of generated) {
    byPath.set(f.path, f)
  }

  // 2. Template files. Locked paths overwrite Claude; non-locked only fill gaps.
  for (const f of template) {
    if (isScaffoldTemplatePath(f.path)) {
      byPath.set(f.path, f) // template wins for locked baselines
    } else if (!byPath.has(f.path)) {
      byPath.set(f.path, f) // fill in template's placeholder if Claude didn't override
    }
  }

  return Array.from(byPath.values())
}
