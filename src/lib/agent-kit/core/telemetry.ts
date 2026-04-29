/**
 * TelemetryRecord — canonical per-run event shape.
 *
 * Every agent run produces exactly one TelemetryRecord. It rolls up
 * signals from all three stages (pre-flight, in-flight, post-flight)
 * into a single shape for persistence and analysis.
 */

/** Pre-flight signals: classification, contract selection, budget. */
export interface PreFlightTelemetry {
  /** Task classification result. */
  taskClass: "trivial" | "standard" | "hard"
  /** Which contract was selected for this run. null if no contract. */
  contractId: string | null
  /** Model selected for this run. */
  modelId: string
  /** Budget allocated. */
  budget: {
    maxIterations: number
    maxTokens: number
    maxDurationMs: number
  }
  /** Time spent in pre-flight (ms). */
  preFlightDurationMs: number
}

/** In-flight signals: streaming, tools, steering. */
export interface InFlightTelemetry {
  /** Total iterations completed. */
  iterationCount: number
  /** Total input tokens consumed. */
  totalInputTokens: number
  /** Total output tokens consumed. */
  totalOutputTokens: number
  /** Cache creation tokens (Anthropic-specific). */
  cacheCreationTokens: number
  /** Cache read tokens (Anthropic-specific). */
  cacheReadTokens: number
  /** Number of tool calls made. */
  toolCallCount: number
  /** Tool calls grouped by name: { "read_file": 5, "edit_file": 3 }. */
  toolCallsByName: Record<string, number>
  /** Number of steering messages consumed. */
  steeringMessagesConsumed: number
  /** Whether context was compacted during the run. */
  compacted: boolean
  /** StreamMonitor alerts fired during the run. */
  streamAlerts: StreamAlert[]
  /** Wall clock duration of the in-flight phase (ms). */
  inFlightDurationMs: number
}

/** Post-flight signals: verification, evaluation, healing. */
export interface PostFlightTelemetry {
  /** Final run status. */
  status: "completed" | "error" | "cancelled"
  /** Number of auto-fix verification cycles. */
  autoFixAttempts: number
  /** Number of build verification attempts. */
  buildFixAttempts: number
  /** Evaluator verdict (null if evaluator wasn't run). */
  evalVerdict: "PASS" | "RETURN-FOR-FIX" | "FAIL" | null
  /** Normalized eval score (0-1). null if evaluator wasn't run. */
  evalScore: number | null
  /** Healing loop result. null if no healing was needed. */
  healingResult: {
    totalAttempts: number
    finalScore: number
    stopped: boolean
    stopReason?: string
  } | null
  /** Total wall clock duration (ms). */
  totalDurationMs: number
  /** Error message if status is "error". */
  errorMessage?: string
}

/** A single stream alert from the StreamMonitor. */
export interface StreamAlert {
  /** Alert type identifier. */
  type: string
  /** Human-readable message. */
  message: string
  /** Character offset in the stream where the alert fired. */
  charOffset: number
  /** Timestamp when the alert fired. */
  timestamp: number
}

/** Complete telemetry for one agent run. */
export interface TelemetryRecord {
  /** Unique run identifier (messageId). */
  runId: string
  /** Project identifier. */
  projectId: string
  /** User identifier. */
  userId: string
  /** When the run started (epoch ms). */
  startedAt: number
  /** Pre-flight telemetry. */
  preFlight: PreFlightTelemetry
  /** In-flight telemetry. */
  inFlight: InFlightTelemetry
  /** Post-flight telemetry. */
  postFlight: PostFlightTelemetry
}

/** Create an empty TelemetryRecord with default values. */
export function createTelemetryRecord(
  runId: string,
  projectId: string,
  userId: string,
): TelemetryRecord {
  const now = Date.now()
  return {
    runId,
    projectId,
    userId,
    startedAt: now,
    preFlight: {
      taskClass: "standard",
      contractId: null,
      modelId: "unknown",
      budget: { maxIterations: 0, maxTokens: 0, maxDurationMs: 0 },
      preFlightDurationMs: 0,
    },
    inFlight: {
      iterationCount: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      toolCallCount: 0,
      toolCallsByName: {},
      steeringMessagesConsumed: 0,
      compacted: false,
      streamAlerts: [],
      inFlightDurationMs: 0,
    },
    postFlight: {
      status: "completed",
      autoFixAttempts: 0,
      buildFixAttempts: 0,
      evalVerdict: null,
      evalScore: null,
      healingResult: null,
      totalDurationMs: 0,
    },
  }
}
