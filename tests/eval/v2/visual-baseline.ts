/**
 * Visual-diff baseline workflow — D-048 (plan H.3).
 *
 * The first successful run of each scenario captures
 * `eval-baselines/{scenarioId}/{slot}.png` as the reference. Subsequent
 * runs diff the new screenshot against the baseline using `pixelmatch`
 * (loaded lazily so the harness can run without it on dev laptops).
 *
 * If the diff exceeds `criticalDiffPercent` for a slot tagged
 * `critical=true`, the scenario fails. Non-critical slots produce a
 * warning in the report but don't fail the run.
 *
 * `--update-baselines` mode (passed via env or CLI) overwrites every
 * baseline with the run's output. Used when the design system changes
 * intentionally; the resulting diff is reviewed in the PR.
 */

import { existsSync } from "fs"
import { mkdir, copyFile, readFile, writeFile } from "fs/promises"
import { dirname, join } from "path"

export interface BaselineConfig {
  /** Project-relative dir where baselines live. */
  baselineRoot: string
  /** Threshold above which a slot fails (0..1). Default 0.05 (5%). */
  criticalDiffPercent?: number
  /** When true, overwrite all baselines with the run's outputs. */
  updateBaselines?: boolean
}

export interface SlotComparison {
  scenarioId: string
  slot: string
  baselinePath: string
  candidatePath: string
  diffPercent: number
  outcome: "match" | "mismatch" | "first-run" | "missing-baseline" | "skipped"
  reason?: string
}

export const DEFAULT_CRITICAL_DIFF_PERCENT = 0.05

/**
 * Compare a candidate screenshot against its baseline. On first run
 * (no baseline yet) the candidate IS adopted as the baseline.
 *
 * Slot names mirror the assertion's screenshot slot from runner.ts —
 * e.g. `mobile`, `desktop`, `after-fix`.
 */
export async function compareScreenshot(args: {
  scenarioId: string
  slot: string
  candidatePath: string
  config: BaselineConfig
}): Promise<SlotComparison> {
  const { scenarioId, slot, candidatePath, config } = args
  const baselinePath = join(
    config.baselineRoot,
    scenarioId,
    `${slot}.png`,
  )

  // First-run / update-mode: write candidate as baseline.
  if (config.updateBaselines || !existsSync(baselinePath)) {
    await mkdir(dirname(baselinePath), { recursive: true })
    await copyFile(candidatePath, baselinePath)
    return {
      scenarioId,
      slot,
      baselinePath,
      candidatePath,
      diffPercent: 0,
      outcome: config.updateBaselines ? "match" : "first-run",
      reason: config.updateBaselines
        ? "Baseline updated (--update-baselines mode)"
        : "First run for this slot — candidate adopted as baseline",
    }
  }

  // Lazy-load pixelmatch + pngjs via dynamic import. The eval extras
  // are an opt-in dev dependency (pnpm add -D pixelmatch pngjs); when
  // missing, we skip the diff and report `skipped` so the scenario
  // gate doesn't fail just because pixelmatch isn't installed.
  // Typed as `any` because the modules are not in package.json yet.
  let pixelmatch: ((
    a: Uint8Array,
    b: Uint8Array,
    out: Uint8Array,
    w: number,
    h: number,
    opts?: { threshold?: number },
  ) => number) | undefined
  let PngCtor: (new (opts: { width: number; height: number }) => {
    data: Uint8Array
  }) | undefined
  let pngSync: { read: (b: Uint8Array) => { width: number; height: number; data: Uint8Array }; write: (p: { data: Uint8Array; width: number; height: number }) => Uint8Array } | undefined
  try {
    // Dynamic import via runtime-built specifier so TypeScript doesn't
    // try to resolve these optional dev-deps at typecheck time. The
    // eval extras are an opt-in install (pnpm add -D pixelmatch pngjs).
    const dynamicImport = new Function("name", "return import(name)") as (
      name: string,
    ) => Promise<unknown>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pm: any = await dynamicImport("pixelmatch")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pj: any = await dynamicImport("pngjs")
    pixelmatch = pm.default ?? pm
    PngCtor = pj.PNG
    pngSync = pj.PNG.sync
  } catch {
    return {
      scenarioId,
      slot,
      baselinePath,
      candidatePath,
      diffPercent: 0,
      outcome: "skipped",
      reason:
        "pixelmatch + pngjs not installed (run `pnpm add -D pixelmatch pngjs` for visual diff).",
    }
  }
  if (!pixelmatch || !PngCtor || !pngSync) {
    return {
      scenarioId,
      slot,
      baselinePath,
      candidatePath,
      diffPercent: 0,
      outcome: "skipped",
      reason: "pixelmatch / pngjs imports resolved but exports were missing.",
    }
  }

  const baselineBytes = await readFile(baselinePath)
  const candidateBytes = await readFile(candidatePath)
  const baselinePng = pngSync.read(baselineBytes)
  const candidatePng = pngSync.read(candidateBytes)

  // Different dimensions → automatic mismatch (the page reflowed).
  if (
    baselinePng.width !== candidatePng.width ||
    baselinePng.height !== candidatePng.height
  ) {
    return {
      scenarioId,
      slot,
      baselinePath,
      candidatePath,
      diffPercent: 1,
      outcome: "mismatch",
      reason: `Dimension mismatch (baseline ${baselinePng.width}x${baselinePng.height} vs candidate ${candidatePng.width}x${candidatePng.height})`,
    }
  }

  const { width, height } = baselinePng
  const diff = new PngCtor({ width, height })
  const diffPixels = pixelmatch(
    baselinePng.data,
    candidatePng.data,
    diff.data,
    width,
    height,
    { threshold: 0.1 },
  )
  const diffPercent = diffPixels / (width * height)

  // Always write the diff PNG next to the candidate so reviewers can
  // see what changed.
  const diffPath = candidatePath.replace(/\.png$/, ".diff.png")
  await writeFile(diffPath, pngSync.write({ data: diff.data, width, height }))

  const threshold = config.criticalDiffPercent ?? DEFAULT_CRITICAL_DIFF_PERCENT
  return {
    scenarioId,
    slot,
    baselinePath,
    candidatePath,
    diffPercent,
    outcome: diffPercent <= threshold ? "match" : "mismatch",
    reason:
      diffPercent <= threshold
        ? `${(diffPercent * 100).toFixed(2)}% delta (within ${(threshold * 100).toFixed(1)}% threshold)`
        : `${(diffPercent * 100).toFixed(2)}% delta exceeds ${(threshold * 100).toFixed(1)}% threshold; review ${diffPath}`,
  }
}

/**
 * Aggregate compareScreenshot results across all slots for a single
 * scenario. Returns whether the scenario passes the visual gate.
 */
export function visualGate(comparisons: SlotComparison[]): {
  pass: boolean
  mismatches: SlotComparison[]
} {
  const mismatches = comparisons.filter((c) => c.outcome === "mismatch")
  return { pass: mismatches.length === 0, mismatches }
}
