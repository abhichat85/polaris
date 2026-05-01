/**
 * Verification policy resolution — D-038.
 *
 * Resolves a project's per-project verification settings (sparse override)
 * against its tier-default policy to produce the final flags handed to
 * the AgentRunner. The runner itself is policy-agnostic; agent-loop.ts
 * calls `resolveVerificationPolicy` and only wires the verify/verifyBuild
 * deps that the policy enables.
 *
 * Defaults by tier:
 *   - free: typecheck=false, lint=false, build=false (no extra cost)
 *   - pro:  typecheck=true,  lint=true,  build=true
 *   - team: typecheck=true,  lint=true,  build=true
 *
 * Per-project overrides override per-field. An override of `false` on
 * Pro/Team disables that stage; an override of `true` on Free enables it
 * (the user is opting in to the cost).
 */

import type { Plan } from "./agent-runner"

export interface VerificationFlags {
  typecheck: boolean
  lint: boolean
  build: boolean
}

export interface VerificationOverrides {
  typecheck?: boolean
  lint?: boolean
  build?: boolean
}

const FREE_DEFAULTS: VerificationFlags = {
  typecheck: false,
  lint: false,
  build: false,
}

const PAID_DEFAULTS: VerificationFlags = {
  typecheck: true,
  lint: true,
  build: true,
}

export function resolveVerificationPolicy(
  plan: Plan,
  overrides: VerificationOverrides | undefined,
): VerificationFlags {
  const defaults = plan === "free" ? FREE_DEFAULTS : PAID_DEFAULTS
  return {
    typecheck: overrides?.typecheck ?? defaults.typecheck,
    lint: overrides?.lint ?? defaults.lint,
    build: overrides?.build ?? defaults.build,
  }
}

/**
 * Convenience predicate — "should the runner be wired with `verify`?".
 * The current verifier runs both tsc and eslint together; we wire it
 * if EITHER stage is enabled. The verifier itself decides which stages
 * to actually invoke based on extension filtering.
 *
 * In a future refinement we could split the dep into two separate
 * `verifyTsc` / `verifyEslint` callbacks for surgical control.
 */
export function shouldWireVerify(flags: VerificationFlags): boolean {
  return flags.typecheck || flags.lint
}

export function shouldWireVerifyBuild(flags: VerificationFlags): boolean {
  return flags.build
}

/* ─────────────────────────────────────────────────────────────────────────
 * Per-completion verification gating — D-049 / Phase 1.3.
 *
 * D-038 (above) decides whether the runner is wired with verify/verifyBuild
 * at all (tier-level decision). This block decides whether — given that
 * those deps ARE wired — the next completion claim warrants running them.
 *
 * The motivation is wall-clock + sandbox cost: tsc + eslint + `next build`
 * adds 30–60s and several MB of CPU. For a comment-only patch or a
 * Tailwind class swap, that safety net is overkill. Skipping when safe is
 * a free latency + cost win.
 *
 * Rules (deterministic — no model call):
 *   - Build/config touched (next.config, tsconfig, package.json, …)
 *       → "full" (always — these can break the whole app)
 *   - Only docs / assets / data changed (.md, .css, .png, .json, …)
 *       → "none"  (no JS surface to verify)
 *   - Trivial task class with small code surface (≤ 2 code files)
 *       → "verify-only"  (cheap tsc/eslint pass, skip expensive `next build`)
 *   - Otherwise
 *       → "full"
 *
 * Risk note: false negatives (we skip but the change is broken) are
 * caught by the D-046 runtime-error stream on the next preview load.
 * RegressionTracker (below) lets the runner escalate back to "full"
 * after observed regressions.
 * ───────────────────────────────────────────────────────────────────── */

import type { TaskClass } from "./task-classifier"

export type VerificationLevel =
  /** Skip both verify() and verifyBuild(). Used for doc/asset-only edits. */
  | "none"
  /** Run verify() (tsc+eslint) but skip verifyBuild() (next build). */
  | "verify-only"
  /** Run both verify() and verifyBuild() — current default behaviour. */
  | "full"

/** Files whose edit must always trigger full verification. */
const CONFIG_FILE_RE =
  /(?:^|\/)(?:next\.config\.[jt]s|tsconfig(?:\..+)?\.json|package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|tailwind\.config\.[jt]s|postcss\.config\.[jcm]?[jt]s|eslint\.config\.[jcm]?[jt]s|vite\.config\.[jt]s|webpack\.config\.[jt]s|babel\.config\.[jt]s|\.env(?:\..+)?)$/i

/** Files we treat as "no JS surface" — pure docs/assets/styles/data. */
const DOC_OR_ASSET_RE =
  /\.(md|mdx|txt|markdown|css|scss|sass|less|svg|png|jpe?g|gif|webp|ico|woff2?|ttf|otf|eot|json5?|yaml|yml|toml)$/i

/** Files that contain executable JS/TS we must type-check. */
const CODE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/i

export interface InferLevelInput {
  taskClass: TaskClass
  changedPaths: ReadonlySet<string>
  /**
   * Strikes from runtime errors observed since the last skipped run.
   * When >= ESCALATION_STRIKES, force "full" regardless of other signals.
   */
  regressionStrikes?: number
}

/** Strikes after which we force "full" verification for safety. */
export const ESCALATION_STRIKES = 2

/** Max code-file count for a trivial task to qualify for `verify-only`. */
export const TRIVIAL_CODE_SURFACE_LIMIT = 2

export function inferVerificationLevel(
  input: InferLevelInput,
): VerificationLevel {
  // Empty change set → nothing to verify.
  if (input.changedPaths.size === 0) return "none"

  // Regression escalation: bypass any optimistic skip.
  if ((input.regressionStrikes ?? 0) >= ESCALATION_STRIKES) {
    return "full"
  }

  const paths = Array.from(input.changedPaths)

  // Touching any build/config file → full verification, no shortcuts.
  if (paths.some((p) => CONFIG_FILE_RE.test(p))) {
    return "full"
  }

  // Pure docs / assets / styles → skip everything; nothing to type-check.
  if (paths.every((p) => DOC_OR_ASSET_RE.test(p))) {
    return "none"
  }

  // Trivial task with a small code surface → run tsc+eslint as a cheap
  // safety net but skip the expensive `next build`. The model is most
  // likely correct on small surgical edits; the build catches integration
  // issues (env vars, plugin config) that small edits rarely break.
  if (input.taskClass === "trivial") {
    const codeEdits = paths.filter((p) => CODE_RE.test(p))
    if (codeEdits.length <= TRIVIAL_CODE_SURFACE_LIMIT) return "verify-only"
  }

  return "full"
}

/**
 * Tracks runtime-error regressions following a non-"full" verification.
 * agent-loop.ts wires this into the runner so the next run escalates if
 * the previous skip turned out to be unsafe.
 */
export class RegressionTracker {
  private strikes = 0
  private lastLevel: VerificationLevel | null = null

  recordVerificationLevel(level: VerificationLevel): void {
    this.lastLevel = level
  }

  recordRuntimeError(): void {
    if (this.lastLevel && this.lastLevel !== "full") {
      this.strikes++
    }
  }

  recordCleanRun(): void {
    this.strikes = 0
    this.lastLevel = null
  }

  get currentStrikes(): number {
    return this.strikes
  }
}
