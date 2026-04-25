/**
 * promptToScaffold — single-shot scaffolding orchestrator.
 * Authority: sub-plan 03 §3.
 *
 * Pipeline:
 *   1. Validate user prompt is non-empty.
 *   2. Call ModelAdapter (no tools) and accumulate text deltas.
 *   3. Strip markdown code fences if present (Claude often wraps JSON in ```json).
 *   4. Parse → validate against ScaffoldSchema (Zod).
 *   5. Validate paths via scaffold-policy.
 *   6. Merge with NEXTJS_SUPABASE_TEMPLATE.
 *
 * Each error is mapped to a discrete ScaffoldErrorCode so the API route can
 * return a precise, user-actionable status.
 */

import type { ModelAdapter, RunOptions } from "@/lib/agents/types"
import { mergeWithTemplate } from "./merge-template"
import { NEXTJS_SUPABASE_TEMPLATE } from "./nextjs-supabase-template"
import { SCAFFOLD_SYSTEM_PROMPT } from "./scaffold-system-prompt"
import { validateScaffoldPaths } from "./scaffold-policy"
import {
  type GeneratedFile,
  type ScaffoldError,
  ScaffoldSchema,
  SCAFFOLD_TIMEOUT_MS,
} from "../types"

export interface PromptToScaffoldDeps {
  adapter: ModelAdapter
  /** Override default RunOptions in tests. */
  runOptionsOverride?: Partial<RunOptions>
}

export type PromptToScaffoldResult =
  | { ok: true; summary: string; files: GeneratedFile[] }
  | { ok: false; error: ScaffoldError }

export async function promptToScaffold(
  prompt: string,
  deps: PromptToScaffoldDeps,
): Promise<PromptToScaffoldResult> {
  if (!prompt || prompt.trim().length === 0) {
    return error("INVALID_PROMPT", "Prompt must not be empty.")
  }

  const opts: RunOptions = {
    systemPrompt: SCAFFOLD_SYSTEM_PROMPT,
    maxTokens: 16_000,
    timeoutMs: SCAFFOLD_TIMEOUT_MS,
    temperature: 0.2,
    ...deps.runOptionsOverride,
  }

  let raw = ""
  let adapterErrored: string | undefined
  try {
    for await (const step of deps.adapter.runWithTools(
      [{ role: "user", content: prompt.trim() }],
      [],
      opts,
    )) {
      if (step.type === "text_delta") raw += step.delta
      else if (step.type === "done" && step.stopReason === "error") {
        adapterErrored = step.error ?? "Model returned an error."
      }
    }
  } catch (err) {
    return error("INTERNAL_ERROR", err instanceof Error ? err.message : String(err))
  }

  if (adapterErrored) {
    const code = /timeout/i.test(adapterErrored) ? "CLAUDE_TIMEOUT" : "INTERNAL_ERROR"
    return error(code, adapterErrored)
  }

  const stripped = stripMarkdownFences(raw.trim())
  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch (err) {
    return error("CLAUDE_PARSE_ERROR", "Model output is not valid JSON.", {
      raw: stripped.slice(0, 500),
      parseError: err instanceof Error ? err.message : String(err),
    })
  }

  const validated = ScaffoldSchema.safeParse(parsed)
  if (!validated.success) {
    return error("CLAUDE_SCHEMA_VIOLATION", "Model output failed schema validation.", {
      issues: validated.error.issues,
    })
  }

  const policy = validateScaffoldPaths(validated.data.files)
  if (!policy.ok) {
    return error("POLICY_VIOLATION", "Model emitted disallowed file paths.", {
      violations: policy.violations,
    })
  }

  const merged = mergeWithTemplate(validated.data.files, NEXTJS_SUPABASE_TEMPLATE)
  return { ok: true, summary: validated.data.summary, files: merged }
}

function error(
  code: ScaffoldError["code"],
  message: string,
  detail?: unknown,
): { ok: false; error: ScaffoldError } {
  return { ok: false, error: { code, message, detail } }
}

/**
 * Strip leading/trailing ```json ... ``` fences. Claude wraps JSON in fences
 * roughly 30% of the time despite the system prompt; this is cheaper than a
 * retry.
 */
function stripMarkdownFences(text: string): string {
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/
  const match = text.match(fence)
  return match ? match[1].trim() : text
}
