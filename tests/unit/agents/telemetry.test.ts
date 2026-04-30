/**
 * TelemetryRecord — factory and shape tests.
 */

import { describe, it, expect } from "vitest"
import {
  createTelemetryRecord,
  type TelemetryRecord,
} from "@/lib/agent-kit/core/telemetry"

describe("createTelemetryRecord", () => {
  it("returns a valid TelemetryRecord with correct identifiers", () => {
    const record = createTelemetryRecord("run-1", "proj-1", "user-1")

    expect(record.runId).toBe("run-1")
    expect(record.projectId).toBe("proj-1")
    expect(record.userId).toBe("user-1")
    expect(record.startedAt).toBeGreaterThan(0)
  })

  it("sets preFlight defaults correctly", () => {
    const record = createTelemetryRecord("r", "p", "u")
    const pf = record.preFlight

    expect(pf.taskClass).toBe("standard")
    expect(pf.contractId).toBeNull()
    expect(pf.modelId).toBe("unknown")
    expect(pf.budget).toEqual({
      maxIterations: 0,
      maxTokens: 0,
      maxDurationMs: 0,
    })
    expect(pf.preFlightDurationMs).toBe(0)
  })

  it("sets inFlight defaults correctly", () => {
    const record = createTelemetryRecord("r", "p", "u")
    const inf = record.inFlight

    expect(inf.iterationCount).toBe(0)
    expect(inf.totalInputTokens).toBe(0)
    expect(inf.totalOutputTokens).toBe(0)
    expect(inf.cacheCreationTokens).toBe(0)
    expect(inf.cacheReadTokens).toBe(0)
    expect(inf.toolCallCount).toBe(0)
    expect(inf.toolCallsByName).toEqual({})
    expect(inf.steeringMessagesConsumed).toBe(0)
    expect(inf.compacted).toBe(false)
    expect(inf.streamAlerts).toEqual([])
    expect(inf.inFlightDurationMs).toBe(0)
  })

  it("sets postFlight defaults correctly", () => {
    const record = createTelemetryRecord("r", "p", "u")
    const pf = record.postFlight

    expect(pf.status).toBe("completed")
    expect(pf.autoFixAttempts).toBe(0)
    expect(pf.buildFixAttempts).toBe(0)
    expect(pf.evalVerdict).toBeNull()
    expect(pf.evalScore).toBeNull()
    expect(pf.healingResult).toBeNull()
    expect(pf.totalDurationMs).toBe(0)
    expect(pf.errorMessage).toBeUndefined()
  })

  it("each call produces an independent record", () => {
    const a = createTelemetryRecord("a", "p", "u")
    const b = createTelemetryRecord("b", "p", "u")

    // mutating one should not affect the other
    a.inFlight.toolCallsByName["foo"] = 1
    a.inFlight.streamAlerts.push({
      type: "test",
      message: "test",
      charOffset: 0,
      timestamp: 0,
    })

    expect(b.inFlight.toolCallsByName).toEqual({})
    expect(b.inFlight.streamAlerts).toEqual([])
  })
})
