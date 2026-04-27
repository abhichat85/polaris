/**
 * File mutation policy. Authority: CONSTITUTION.md Article IX.
 *
 * Whitelist-based: writes are denied unless the path is inside a writable
 * directory AND not in the locked list AND not inside a read-only directory.
 *
 * §9.4: the agent never writes package.json directly — it runs commands
 * (e.g. `npm install`) and the post-command sync picks up lockfile changes.
 */

import { minimatch } from "minimatch"

const LOCKED_FILES: string[] = [
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  // Catch nested .env files (e.g. src/.env) — these are usually accidental.
  "**/.env",
  "**/.env.local",
  "**/.env.production",
  "**/.env.development",
  "tsconfig.json",
  "next.config.ts",
  "next.config.js",
  "tailwind.config.ts",
  ".gitignore",
  ".github/**",
  "vercel.json",
  "supabase/config.toml",
]

const READ_ONLY_DIRS: string[] = [
  "node_modules/",
  ".next/",
  "dist/",
  "build/",
  ".git/",
  ".vercel/",
]

const WRITABLE_DIRS: string[] = [
  "src/",
  "app/",
  "pages/",
  "public/",
  "components/",
  "lib/",
  "supabase/migrations/",
  "styles/",
  // D-026 — plan + spec markdown lives here; agent reads + occasionally edits.
  "docs/",
  // D-027 — agent scratchpad memory. Persists across sessions.
  ".polaris/",
]

function normalize(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path
}

export const FilePermissionPolicy = {
  canWrite(rawPath: string): boolean {
    const path = normalize(rawPath)
    if (LOCKED_FILES.some((pattern) => minimatch(path, pattern, { dot: true }))) return false
    if (READ_ONLY_DIRS.some((dir) => path.startsWith(dir))) return false
    if (WRITABLE_DIRS.some((dir) => path.startsWith(dir))) return true
    return false
  },

  canRead(rawPath: string): boolean {
    const path = normalize(rawPath)
    if (READ_ONLY_DIRS.some((dir) => path.startsWith(dir))) return false
    return true
  },

  /** Exposed for diagnostics (UI explanations of "why was this denied"). */
  describe() {
    return {
      locked: [...LOCKED_FILES],
      readOnlyDirs: [...READ_ONLY_DIRS],
      writableDirs: [...WRITABLE_DIRS],
    }
  },
}
