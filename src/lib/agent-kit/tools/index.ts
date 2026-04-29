/**
 * agent-kit/tools — TRANSITION STUB.
 *
 * The tool-layer types (ToolOutput, ToolErrorCode, ToolExecutionContext, etc.)
 * already live in agent-kit/core/tool-types. This shim re-exports the
 * Polaris-specific tool surface (`@/lib/tools/types`) under the agent-kit
 * namespace so downstream code can begin migrating its imports. When the
 * actual tool definitions/executor are extracted into agent-kit, this file
 * becomes the canonical export point and the shim collapses to a direct
 * implementation.
 *
 * @see src/lib/agent-kit/README.md for the package boundary.
 */
export * from "@/lib/tools/types"
