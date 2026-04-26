/**
 * Pipeline step labels — extracted from the Inngest function module so the UI
 * (and its tests) can import them without pulling Inngest, Convex, and the
 * FileService into the bundle.
 *
 * Order MUST match the 9 step.run calls in deploy-pipeline.ts.
 */

export const PIPELINE_STEPS = [
  "Create Supabase project",
  "Wait for Supabase ready",
  "Capture API keys",
  "Run migrations",
  "Read project files",
  "Ensure Vercel project",
  "Create Vercel deployment",
  "Wait for Vercel build",
  "Save live URL",
] as const

export type PipelineStep = (typeof PIPELINE_STEPS)[number]
