/**
 * Verification result types for the agent-kit.
 * The actual verify/verifyBuild implementations stay in Polaris-side code.
 */
export type VerifyStage = "tsc" | "eslint" | "build"

export interface VerifyResult {
  ok: boolean
  errors?: string
  stage?: VerifyStage
}
