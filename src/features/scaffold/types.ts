/**
 * Scaffold pipeline types + Zod validation. Authority: sub-plan 03 §1.
 *
 * The schema is the contract for "what Claude is allowed to return."
 * Constraints prevent abuse (oversized payloads), keep us within sandbox
 * write budgets, and stop the model from emitting absolute or escape paths.
 */

import { z } from "zod"

export const MAX_GENERATED_FILES = 60
export const MAX_FILE_SIZE_BYTES = 60_000
export const MAX_TOTAL_BYTES = 800_000
export const SCAFFOLD_TIMEOUT_MS = 90_000

const PATH_PATTERN = /^[a-zA-Z0-9._/-]+$/

const FilePathSchema = z
  .string()
  .min(1, "path must not be empty")
  .max(200, "path too long")
  .refine((p) => !p.startsWith("/"), {
    message: "path must be relative (no leading slash)",
  })
  .refine((p) => !p.includes(".."), {
    message: "path must not contain parent traversal (..)",
  })
  .refine((p) => PATH_PATTERN.test(p), {
    message: "path contains invalid characters",
  })
  .refine((p) => !p.endsWith("/"), {
    message: "path must be a file, not a directory",
  })

export const GeneratedFileSchema = z.object({
  path: FilePathSchema,
  content: z
    .string()
    .max(MAX_FILE_SIZE_BYTES, `file content exceeds ${MAX_FILE_SIZE_BYTES} bytes`),
})

export const ScaffoldSchema = z.object({
  summary: z.string().min(1).max(500),
  files: z
    .array(GeneratedFileSchema)
    .min(1, "must generate at least one file")
    .max(MAX_GENERATED_FILES, `must not generate more than ${MAX_GENERATED_FILES} files`)
    .refine(
      (arr) => arr.reduce((sum, f) => sum + f.content.length, 0) <= MAX_TOTAL_BYTES,
      { message: `total content exceeds ${MAX_TOTAL_BYTES} bytes` },
    )
    .refine((arr) => new Set(arr.map((f) => f.path)).size === arr.length, {
      message: "duplicate file paths are not allowed",
    }),
})

export type GeneratedFile = z.infer<typeof GeneratedFileSchema>
export type ScaffoldResponse = z.infer<typeof ScaffoldSchema>

export interface ScaffoldRequest {
  prompt: string
  userId: string
}

export interface ScaffoldOutcome {
  projectId: string
  fileCount: number
  totalBytes: number
  durationMs: number
}

export const SCAFFOLD_ERROR_CODES = [
  "INVALID_PROMPT",
  "QUOTA_EXCEEDED",
  "CLAUDE_PARSE_ERROR",
  "CLAUDE_SCHEMA_VIOLATION",
  "CLAUDE_OVERSIZED",
  "CLAUDE_TIMEOUT",
  "POLICY_VIOLATION",
  "CONVEX_WRITE_FAILED",
  "INTERNAL_ERROR",
] as const

export type ScaffoldErrorCode = (typeof SCAFFOLD_ERROR_CODES)[number]

export interface ScaffoldError {
  code: ScaffoldErrorCode
  message: string
  detail?: unknown
}
