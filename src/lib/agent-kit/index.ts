/**
 * agent-kit — reusable agent infrastructure primitives.
 *
 * This package contains the core abstractions (types, interfaces, SSE parser,
 * context shape) and runtime (AgentRunner) that are generic across all agents.
 * Polaris-specific implementations (ConvexSink, ClaudeAdapter, tool definitions,
 * system prompts) live outside this package and import from it.
 *
 * Dependency rule: agent-kit/core/ has ZERO imports from Polaris (@/lib/, convex/, etc.)
 */
export * from "./core"
export * from "./runtime"
export * from "./sink"
