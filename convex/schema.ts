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
    /**
     * Workspace this project belongs to. OPTIONAL during the multi-tenancy
     * migration (D-020) — legacy projects have it unset until the
     * `migrations/2026-04-create-personal-workspaces:run` mutation backfills.
     * Will become required in a follow-up commit once backfill is verified.
     */
    workspaceId: v.optional(v.id("workspaces")),
  })
    .index("by_owner", ["ownerId"])
    .index("by_workspace", ["workspaceId"]),

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
    /**
     * D-024 — accumulated extended-thinking text from the LLM. Rendered
     * by the chat UI inside a collapsible "Thinking" block above the
     * assistant message body.
     */
    thinking: v.optional(v.string()),
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
          // D-018 — per-line stdout/stderr emitted by `run_command` and
          // surfaced in the chat <ToolOutputStream /> component. Bounded
          // at 4 KB total per call (enforced in `appendToolStream`).
          stream: v.optional(
            v.array(
              v.object({
                kind: v.union(v.literal("stdout"), v.literal("stderr")),
                line: v.string(),
                at: v.number(),
              }),
            ),
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
    // D-023 — Anthropic prompt-cache accounting. Cache reads bill at ~10%
    // of base input rate; we track them separately so cost reports are
    // accurate. Both default to 0 for back-compat with rows written before
    // caching landed.
    cacheCreationTokens: v.optional(v.number()),
    cacheReadTokens: v.optional(v.number()),
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

  // ── Billing — sub-plan 08 (additive) ───────────────────────────────────────
  customers: defineTable({
    /** Clerk userId — unique per user. */
    userId: v.string(),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    plan: v.union(v.literal("free"), v.literal("pro"), v.literal("team")),
    /** Mirrors Stripe `subscription.status` plus our internal `none`. */
    subscriptionStatus: v.union(
      v.literal("none"),
      v.literal("trialing"),
      v.literal("active"),
      v.literal("past_due"),
      v.literal("canceled"),
      v.literal("incomplete"),
      v.literal("incomplete_expired"),
      v.literal("unpaid"),
      v.literal("paused"),
    ),
    /** ms-since-epoch; 0 when no subscription. */
    currentPeriodEnd: v.number(),
    /** Seats granted by the plan (1 for free/pro, ≥1 for team). */
    seatsAllowed: v.number(),
    cancelAtPeriodEnd: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_stripe_customer", ["stripeCustomerId"]),

  /**
   * Idempotency log for Stripe webhooks. We insert a row keyed by Stripe's
   * event ID before processing; a second delivery sees the row and short-
   * circuits. See CONSTITUTION §13.1 (replay-attack threat).
   */
  webhook_events: defineTable({
    /** Stripe event id (`evt_*`). Unique. */
    eventId: v.string(),
    type: v.string(),
    processedAt: v.number(),
  }).index("by_event_id", ["eventId"]),

  /**
   * Per-day usage roll-up for the daily-cost-ceiling kill switch
   * (CONSTITUTION §17.4). Written by the same path that increments
   * the monthly `usage` table.
   */
  usage_daily: defineTable({
    ownerId: v.string(),
    /** "YYYY-MM-DD" UTC. */
    day: v.string(),
    anthropicInputTokens: v.number(),
    anthropicOutputTokens: v.number(),
    e2bSeconds: v.number(),
    deployments: v.number(),
    updatedAt: v.number(),
  }).index("by_owner_day", ["ownerId", "day"]),

  specs: defineTable({
    projectId: v.id("projects"),
    /**
     * D-026 — plan title surfaced in the IDE plan pane.
     * Optional for back-compat with rows written before plan mode landed.
     */
    title: v.optional(v.string()),
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
        // D-026 — sprint index for plan-mode grouping. Optional for legacy.
        sprint: v.optional(v.number()),
        praxiomEvidenceIds: v.optional(v.array(v.string())),
      }),
    ),
    /**
     * D-026 — markdown form of the plan. Agent + UI both read/write this.
     * `serializePlan(parsePlan(md))` is the round-trip contract.
     */
    planMarkdown: v.optional(v.string()),
    updatedAt: v.number(),
    updatedBy: v.union(
      v.literal("user"),
      v.literal("agent"),
      v.literal("praxiom"),
    ),
    praxiomDocumentId: v.optional(v.string()),
  }).index("by_project", ["projectId"]),

  // ── Sub-plan 06 (GitHub integration) ─────────────────────────────────────
  /**
   * Per-user OAuth tokens encrypted at rest. Authority: CONSTITUTION §11.2,
   * §13.2, §13.3, sub-plan 06 Task 3. Tokens are AES-256-GCM-packed strings
   * stored in `*Enc` fields — they are never logged, never returned to the
   * client, only decrypted server-side just-in-time.
   */
  integrations: defineTable({
    /** Clerk userId. One row per (user, provider). */
    userId: v.string(),
    provider: v.literal("github"),
    /** GitHub login (e.g. "octocat"); shown in UI. */
    accountLogin: v.string(),
    /** GitHub numeric account id (stable across renames). */
    accountId: v.string(),
    /** Encrypted access token. Format: iv:tag:ct (base64 segments). */
    accessTokenEnc: v.string(),
    /** Optional encrypted refresh token (PAT GitHub doesn't issue these). */
    refreshTokenEnc: v.optional(v.string()),
    /** Granted scopes — for UX ("re-connect to push private repos"). */
    scopes: v.array(v.string()),
    /** ms-since-epoch; 0 if non-expiring. */
    expiresAt: v.number(),
    connectedAt: v.number(),
    /** Last time we used this token successfully (for stale-token UI). */
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_user_provider", ["userId", "provider"])
    .index("by_account", ["provider", "accountId"]),

  /**
   * Waitlist for non-allowlisted Clerk signups (sub-plan 10 Task 1/3).
   */
  waitlist: defineTable({
    email: v.string(),
    referrer: v.optional(v.string()),
    requestedAt: v.number(),
    /** "pending" | "invited" | "rejected". */
    status: v.union(v.literal("pending"), v.literal("invited"), v.literal("rejected")),
    invitedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
  }).index("by_email", ["email"]).index("by_status", ["status"]),

  /**
   * Onboarding state per user (sub-plan 10 Task 1).
   */
  user_profiles: defineTable({
    userId: v.string(),
    onboardingCompleted: v.boolean(),
    /** Step the user is on. Steps: "welcome", "starter", "tour", "done". */
    onboardingStep: v.string(),
    /** Marketing opt-in collected at signup. */
    marketingOptIn: v.optional(v.boolean()),
    /** Cookie consent flags. */
    cookieConsent: v.optional(
      v.object({
        analytics: v.boolean(),
        marketing: v.boolean(),
        timestamp: v.number(),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // ── Clerk user cache (D-020) ─────────────────────────────────────────────
  /**
   * Lightweight projection of Clerk user fields, populated by the Clerk
   * webhook on user.created / user.updated. Lets us render member email +
   * name in the workspace UI without an HTTP roundtrip per row.
   */
  clerk_user_cache: defineTable({
    userId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_email", ["email"]),

  // ── Plans (D-019) — quota source-of-truth ────────────────────────────────
  /**
   * Plan tier definitions. One row per tier. Seeded by
   * `plans:seedDefaults` (idempotent) — never auto-seeded on schema deploy
   * because seed numbers are a product decision, not a migration concern.
   * Authority: CONSTITUTION §17.2.
   */
  plans: defineTable({
    /** "free" | "pro" | "team" — must match customers.plan literals. */
    id: v.union(v.literal("free"), v.literal("pro"), v.literal("team")),
    monthlyTokenLimit: v.number(),
    /** Daily $ ceiling in integer cents (avoids float drift). */
    dailyCostCeilingCents: v.number(),
    projectsAllowed: v.number(),
    deploysAllowedPerMonth: v.number(),
    seats: v.number(),
    updatedAt: v.number(),
  }).index("by_plan_id", ["id"]),

  // ── Workspaces (D-020) — multi-tenancy ───────────────────────────────────
  /**
   * Top-level container for projects + members. Personal workspaces are
   * created by the migration mutation for legacy users; new users get one
   * automatically on Clerk `user.created` webhook
   * (`workspaces.createPersonal`). `projects.create` also inline-bootstraps
   * a personal workspace for the caller if they somehow lack one — see
   * `convex/projects.ts`. Authority: CONSTITUTION §11.2, D-020.
   */
  workspaces: defineTable({
    name: v.string(),
    /** URL-safe identifier; unique per row. */
    slug: v.string(),
    ownerId: v.string(),
    plan: v.union(v.literal("free"), v.literal("pro"), v.literal("team")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_slug", ["slug"]),

  /**
   * Membership rows. (workspaceId, userId) is unique by convention enforced
   * in the `invite` mutation (no compound unique constraint in Convex).
   */
  workspace_members: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    role: v.union(
      v.literal("owner"),
      v.literal("admin"),
      v.literal("member"),
    ),
    joinedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_user", ["userId"])
    .index("by_user_workspace", ["userId", "workspaceId"]),

  // ── Sub-plan 07 (deploy pipeline) ────────────────────────────────────────
  deployments: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    status: v.union(
      v.literal("provisioning_db"),
      v.literal("running_migrations"),
      v.literal("env_capture"),
      v.literal("deploying"),
      v.literal("succeeded"),
      v.literal("failed"),
    ),
    /** Human-readable name of the current step (e.g. "Wait for Supabase"). */
    currentStep: v.string(),
    vercelDeploymentId: v.optional(v.string()),
    supabaseProjectRef: v.optional(v.string()),
    liveUrl: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index("by_project", ["projectId"]),
})
