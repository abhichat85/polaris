import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

/**
 * Polaris schema. Authority: CONSTITUTION §11.2 (typed validators per D-016).
 *
 * - Existing tables (projects, files, conversations, messages) preserve their
 *   original shape so legacy data stays valid.
 * - New optional fields are additive: `files.path`, `files.updatedBy`,
 *   `messages.errorMessage`, `messages.inputTokens`, `messages.outputTokens`,
 *   `messages.modelKey`, plus new status literals `streaming` and `error`.
 * - New tables: `agent_checkpoints` (Layer 3 of error recovery), `usage`
 *   (billing — sub-plan 08), `specs` (sub-plan 05).
 *
 * Per D-016, nested complex types use typed validators (not JSON-serialized
 * strings). Tool inputs/results carry `v.any()` because their shape is genuinely
 * dynamic — that's the documented escape hatch in Convex.
 */

const messageBlockValidator = v.object({
  type: v.union(
    v.literal("text"),
    v.literal("tool_use"),
    v.literal("tool_result"),
  ),
  // text blocks
  text: v.optional(v.string()),
  // tool_use blocks
  id: v.optional(v.string()),
  name: v.optional(v.string()),
  input: v.optional(v.any()),
  // tool_result blocks
  toolUseId: v.optional(v.string()),
  content: v.optional(v.string()),
  isError: v.optional(v.boolean()),
})

const checkpointMessageValidator = v.object({
  role: v.union(
    v.literal("system"),
    v.literal("user"),
    v.literal("assistant"),
    v.literal("tool"),
  ),
  /** String content — present iff `blocks` is absent (mutually exclusive). */
  contentText: v.optional(v.string()),
  /** Block content — present iff `contentText` is absent. */
  blocks: v.optional(v.array(messageBlockValidator)),
})

export default defineSchema({
  projects: defineTable({
    name: v.string(),
    ownerId: v.string(),
    updatedAt: v.number(),
    importStatus: v.optional(
      v.union(
        v.literal("importing"),
        v.literal("completed"),
        v.literal("failed"),
      ),
    ),
    exportStatus: v.optional(
      v.union(
        v.literal("exporting"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("cancelled"),
      ),
    ),
    exportRepoUrl: v.optional(v.string()),
  }).index("by_owner", ["ownerId"]),

  files: defineTable({
    projectId: v.id("projects"),
    parentId: v.optional(v.id("files")),
    name: v.string(),
    type: v.union(v.literal("file"), v.literal("folder")),
    content: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    updatedAt: v.number(),

    // ── Additions for sub-plan 01 (flat-path lookups via FileService) ───────
    /** POSIX path relative to project root, e.g. "src/app/page.tsx". */
    path: v.optional(v.string()),
    updatedBy: v.optional(
      v.union(
        v.literal("user"),
        v.literal("agent"),
        v.literal("scaffold"),
        v.literal("import"),
      ),
    ),
  })
    .index("by_project", ["projectId"])
    .index("by_parent", ["parentId"])
    .index("by_project_parent", ["projectId", "parentId"])
    .index("by_project_path", ["projectId", "path"]),

  conversations: defineTable({
    projectId: v.id("projects"),
    title: v.string(),
    updatedAt: v.number(),
  }).index("by_project", ["projectId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    projectId: v.id("projects"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    status: v.optional(
      v.union(
        v.literal("processing"),
        v.literal("streaming"),
        v.literal("completed"),
        v.literal("cancelled"),
        v.literal("error"),
      ),
    ),
    streamingContent: v.optional(v.string()),
    toolCalls: v.optional(
      v.array(
        v.object({
          id: v.string(),
          name: v.string(),
          args: v.any(),
          result: v.optional(v.any()),
          status: v.union(
            v.literal("running"),
            v.literal("completed"),
            v.literal("error"),
          ),
        }),
      ),
    ),
    fileChanges: v.optional(
      v.array(
        v.object({
          fileId: v.id("files"),
          operation: v.union(
            v.literal("created"),
            v.literal("updated"),
            v.literal("deleted"),
          ),
        }),
      ),
    ),

    // ── Additions for sub-plan 01 ───────────────────────────────────────────
    errorMessage: v.optional(v.string()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    modelKey: v.optional(v.string()),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_project_status", ["projectId", "status"]),

  // ── New tables ────────────────────────────────────────────────────────────

  agent_checkpoints: defineTable({
    messageId: v.id("messages"),
    projectId: v.id("projects"),
    /** Typed message history per D-016 (no JSON-string antipattern). */
    messages: v.array(checkpointMessageValidator),
    iterationCount: v.number(),
    totalInputTokens: v.number(),
    totalOutputTokens: v.number(),
    lastToolCallName: v.optional(v.string()),
    savedAt: v.number(),
  }).index("by_message", ["messageId"]),

  usage: defineTable({
    ownerId: v.string(),
    /** "YYYY-MM" of the usage row (UTC). */
    yearMonth: v.string(),
    anthropicTokens: v.number(),
    e2bSeconds: v.number(),
    deployments: v.number(),
    updatedAt: v.number(),
  }).index("by_owner_month", ["ownerId", "yearMonth"]),

  // ── Sandbox lifecycle (sub-plan 02) ──────────────────────────────────────
  // One row per project. Tracks the cached E2B sandbox so the lifecycle can
  // decide reuse-vs-reprovision on every project open. Authority: sub-plan 02
  // §7 (adapted: separate table keeps `projects` clean for the editor query).
  sandboxes: defineTable({
    projectId: v.id("projects"),
    /** Provider-issued sandbox id (e.g. E2B sandboxId, mock id). */
    sandboxId: v.string(),
    /** Last positive `isAlive` timestamp; also used as a TTL probe. */
    alive: v.boolean(),
    createdAt: v.number(),
    /** Provider-side hard expiry (createdAt + timeoutMs). */
    expiresAt: v.number(),
    /** Set true when a sandbox-side write fails — lifecycle re-syncs on next open. */
    needsResync: v.optional(v.boolean()),
    /** Mutated by `touch` mutations on every successful sandbox interaction. */
    lastAlive: v.optional(v.number()),
  })
    .index("by_project", ["projectId"])
    .index("by_sandbox_id", ["sandboxId"]),

  specs: defineTable({
    projectId: v.id("projects"),
    features: v.array(
      v.object({
        /** ULID — sortable timestamp prefix, see CONSTITUTION §11.2. */
        id: v.string(),
        title: v.string(),
        description: v.string(),
        acceptanceCriteria: v.array(v.string()),
        status: v.union(
          v.literal("todo"),
          v.literal("in_progress"),
          v.literal("done"),
          v.literal("blocked"),
        ),
        priority: v.union(v.literal("p0"), v.literal("p1"), v.literal("p2")),
        praxiomEvidenceIds: v.optional(v.array(v.string())),
      }),
    ),
    updatedAt: v.number(),
    updatedBy: v.union(
      v.literal("user"),
      v.literal("agent"),
      v.literal("praxiom"),
    ),
    praxiomDocumentId: v.optional(v.string()),
  }).index("by_project", ["projectId"]),
})
