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
