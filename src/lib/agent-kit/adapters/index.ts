/**
 * agent-kit/adapters — TRANSITION STUB.
 *
 * The model adapters (ClaudeAdapter, GPTAdapter, GeminiAdapter) and the
 * lazy-cached registry currently live under `src/lib/agents/`. The plan
 * (Phase 0 of the agent-kit extraction) is to physically move them into
 * `src/lib/agent-kit/adapters/` once their Polaris-specific dependencies
 * (system-prompt builder, tool-meta) have been split out.
 *
 * For now this file is a no-op re-export shim so that downstream code can
 * already start importing from `@/lib/agent-kit/adapters` and the move,
 * when it lands, will be a one-line change.
 *
 * @see src/lib/agent-kit/README.md for the package boundary.
 */
export * from "@/lib/agents/registry"
export * from "@/lib/agents/claude-adapter"
