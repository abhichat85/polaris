/**
 * Singleton registry of ModelAdapter instances.
 * Authority: CONSTITUTION §6.3 (singleton pattern), Article XX D-003.
 *
 * The registry is lazy: adapters are constructed on first access. This avoids
 * crashing at import time when an env var for an unused adapter is missing
 * (e.g. running unit tests against ClaudeAdapter without OPENAI_API_KEY set).
 */

import { ClaudeAdapter } from "./claude-adapter"
import { GeminiAdapter } from "./gemini-adapter"
import { GPTAdapter } from "./gpt-adapter"
import type { ModelAdapter } from "./types"

export const MODEL_KEYS = ["claude", "gpt", "gemini"] as const
export type ModelKey = (typeof MODEL_KEYS)[number]

const cache: Partial<Record<ModelKey, ModelAdapter>> = {}

function build(key: ModelKey): ModelAdapter {
  switch (key) {
    case "claude": {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set in environment.")
      return new ClaudeAdapter({ apiKey })
    }
    case "gpt": {
      const apiKey = process.env.OPENAI_API_KEY ?? "missing"
      return new GPTAdapter({ apiKey })
    }
    case "gemini": {
      const apiKey = process.env.GOOGLE_API_KEY ?? "missing"
      return new GeminiAdapter({ apiKey })
    }
    default: {
      const exhaustive: never = key
      throw new Error(`Unknown model key: ${exhaustive as string}`)
    }
  }
}

export function getAdapter(key: ModelKey): ModelAdapter {
  if (!MODEL_KEYS.includes(key)) {
    throw new Error(`Unknown model key: ${key}`)
  }
  if (!cache[key]) cache[key] = build(key)
  return cache[key]!
}

/** Test helper. Not exported from a barrel file — production must not call this. */
export function __resetRegistryForTests() {
  for (const k of MODEL_KEYS) delete cache[k]
}
