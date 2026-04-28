/**
 * Unit-level coverage for the slot-comparison branches that don't
 * require pixelmatch/pngjs:
 *  - first-run adoption
 *  - update-baselines mode
 *  - visualGate aggregation
 *
 * The diff branch itself is covered by the live eval harness when
 * pixelmatch is installed; here we only assert the bookkeeping.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, writeFile, readFile, mkdir } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { compareScreenshot, visualGate } from "@/../tests/eval/v2/visual-baseline"

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "visual-baseline-test-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true }).catch(() => undefined)
})

const FAKE_PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

describe("compareScreenshot", () => {
  it("first-run: adopts candidate as baseline + reports first-run", async () => {
    const candidate = join(dir, "candidate.png")
    await writeFile(candidate, FAKE_PNG_BYTES)
    const baselineRoot = join(dir, "baselines")
    const result = await compareScreenshot({
      scenarioId: "01-test",
      slot: "desktop",
      candidatePath: candidate,
      config: { baselineRoot },
    })
    expect(result.outcome).toBe("first-run")
    // Baseline file should now exist
    const baselinePath = join(baselineRoot, "01-test", "desktop.png")
    const baselineContent = await readFile(baselinePath)
    expect(baselineContent.equals(FAKE_PNG_BYTES)).toBe(true)
  })

  it("update-baselines mode: overwrites existing baseline", async () => {
    const candidate = join(dir, "candidate.png")
    const baselineRoot = join(dir, "baselines")
    const baselinePath = join(baselineRoot, "01-test", "desktop.png")
    await mkdir(join(baselineRoot, "01-test"), { recursive: true })
    await writeFile(baselinePath, Buffer.from([0xde, 0xad, 0xbe, 0xef]))
    await writeFile(candidate, FAKE_PNG_BYTES)

    const result = await compareScreenshot({
      scenarioId: "01-test",
      slot: "desktop",
      candidatePath: candidate,
      config: { baselineRoot, updateBaselines: true },
    })
    expect(result.outcome).toBe("match")
    expect(result.reason).toContain("Baseline updated")
    const baselineContent = await readFile(baselinePath)
    expect(baselineContent.equals(FAKE_PNG_BYTES)).toBe(true)
  })
})

describe("visualGate", () => {
  it("passes when all comparisons match", () => {
    const result = visualGate([
      { scenarioId: "x", slot: "a", baselinePath: "", candidatePath: "", diffPercent: 0, outcome: "match" },
      { scenarioId: "x", slot: "b", baselinePath: "", candidatePath: "", diffPercent: 0, outcome: "first-run" },
    ])
    expect(result.pass).toBe(true)
    expect(result.mismatches).toHaveLength(0)
  })

  it("fails when any slot is mismatch", () => {
    const result = visualGate([
      { scenarioId: "x", slot: "a", baselinePath: "", candidatePath: "", diffPercent: 0, outcome: "match" },
      { scenarioId: "x", slot: "b", baselinePath: "", candidatePath: "", diffPercent: 0.2, outcome: "mismatch" },
    ])
    expect(result.pass).toBe(false)
    expect(result.mismatches).toHaveLength(1)
    expect(result.mismatches[0].slot).toBe("b")
  })

  it("treats `skipped` as non-failing (pixelmatch not installed)", () => {
    const result = visualGate([
      { scenarioId: "x", slot: "a", baselinePath: "", candidatePath: "", diffPercent: 0, outcome: "skipped" },
    ])
    expect(result.pass).toBe(true)
  })
})
