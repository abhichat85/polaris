import { describe, it, expect } from "vitest"
import {
  resolveVerificationPolicy,
  shouldWireVerify,
  shouldWireVerifyBuild,
  inferVerificationLevel,
  RegressionTracker,
  ESCALATION_STRIKES,
} from "@/lib/agents/verification-policy"

describe("resolveVerificationPolicy", () => {
  it("free default: all stages off", () => {
    expect(resolveVerificationPolicy("free", undefined)).toEqual({
      typecheck: false,
      lint: false,
      build: false,
    })
  })

  it("pro default: all stages on", () => {
    expect(resolveVerificationPolicy("pro", undefined)).toEqual({
      typecheck: true,
      lint: true,
      build: true,
    })
  })

  it("team default: all stages on", () => {
    expect(resolveVerificationPolicy("team", undefined)).toEqual({
      typecheck: true,
      lint: true,
      build: true,
    })
  })

  it("free can opt-IN per stage via override=true", () => {
    expect(
      resolveVerificationPolicy("free", { typecheck: true }),
    ).toEqual({ typecheck: true, lint: false, build: false })
  })

  it("pro can opt-OUT per stage via override=false", () => {
    expect(
      resolveVerificationPolicy("pro", { build: false }),
    ).toEqual({ typecheck: true, lint: true, build: false })
  })

  it("undefined override fields fall through to default, not 'unset'", () => {
    // build is explicitly set, lint+typecheck use the team default (true).
    expect(
      resolveVerificationPolicy("team", { build: false }),
    ).toEqual({ typecheck: true, lint: true, build: false })
  })

  it("partial override on free: only enabled fields turn on", () => {
    expect(
      resolveVerificationPolicy("free", { lint: true, build: false }),
    ).toEqual({ typecheck: false, lint: true, build: false })
  })
})

describe("shouldWireVerify / shouldWireVerifyBuild", () => {
  it("verify wires when either typecheck or lint is on", () => {
    expect(shouldWireVerify({ typecheck: true, lint: false, build: false })).toBe(true)
    expect(shouldWireVerify({ typecheck: false, lint: true, build: false })).toBe(true)
    expect(shouldWireVerify({ typecheck: true, lint: true, build: false })).toBe(true)
  })

  it("verify does NOT wire when both stages are off", () => {
    expect(shouldWireVerify({ typecheck: false, lint: false, build: true })).toBe(false)
    expect(shouldWireVerify({ typecheck: false, lint: false, build: false })).toBe(false)
  })

  it("verifyBuild wires iff build flag is true", () => {
    expect(shouldWireVerifyBuild({ typecheck: true, lint: true, build: true })).toBe(true)
    expect(shouldWireVerifyBuild({ typecheck: true, lint: true, build: false })).toBe(false)
  })
})

describe("inferVerificationLevel — D-049 per-completion gating", () => {
  const set = (...paths: string[]) => new Set(paths)

  it("returns 'none' for empty change set", () => {
    expect(
      inferVerificationLevel({ taskClass: "standard", changedPaths: set() }),
    ).toBe("none")
  })

  it("returns 'full' for any TS/TSX edit on standard tasks", () => {
    expect(
      inferVerificationLevel({
        taskClass: "standard",
        changedPaths: set("src/app/page.tsx"),
      }),
    ).toBe("full")
  })

  it("returns 'full' when next.config.ts is touched, even on trivial tasks", () => {
    expect(
      inferVerificationLevel({
        taskClass: "trivial",
        changedPaths: set("next.config.ts"),
      }),
    ).toBe("full")
  })

  it("returns 'full' when package.json is touched", () => {
    expect(
      inferVerificationLevel({
        taskClass: "standard",
        changedPaths: set("src/foo.ts", "package.json"),
      }),
    ).toBe("full")
  })

  it("returns 'full' when tsconfig.json is touched", () => {
    expect(
      inferVerificationLevel({
        taskClass: "trivial",
        changedPaths: set("tsconfig.json"),
      }),
    ).toBe("full")
  })

  it("returns 'full' when tailwind.config.ts is touched", () => {
    expect(
      inferVerificationLevel({
        taskClass: "trivial",
        changedPaths: set("tailwind.config.ts"),
      }),
    ).toBe("full")
  })

  it("returns 'full' when .env is touched", () => {
    expect(
      inferVerificationLevel({
        taskClass: "trivial",
        changedPaths: set(".env"),
      }),
    ).toBe("full")
  })

  it("returns 'none' for markdown-only changes", () => {
    expect(
      inferVerificationLevel({
        taskClass: "standard",
        changedPaths: set("README.md", "docs/intro.md"),
      }),
    ).toBe("none")
  })

  it("returns 'none' for asset-only changes", () => {
    expect(
      inferVerificationLevel({
        taskClass: "standard",
        changedPaths: set("public/logo.svg", "public/og.png"),
      }),
    ).toBe("none")
  })

  it("returns 'none' for CSS-only changes", () => {
    expect(
      inferVerificationLevel({
        taskClass: "standard",
        changedPaths: set("src/app/globals.css"),
      }),
    ).toBe("none")
  })

  it("returns 'verify-only' for trivial task with single TS edit", () => {
    // Trivial + small surface area (1 file) → cheap tsc/eslint, skip build
    expect(
      inferVerificationLevel({
        taskClass: "trivial",
        changedPaths: set("src/utils.ts"),
      }),
    ).toBe("verify-only")
  })

  it("returns 'verify-only' for trivial task with two TS edits", () => {
    expect(
      inferVerificationLevel({
        taskClass: "trivial",
        changedPaths: set("src/utils.ts", "src/helpers.ts"),
      }),
    ).toBe("verify-only")
  })

  it("returns 'full' for trivial task that touches more than two code files", () => {
    expect(
      inferVerificationLevel({
        taskClass: "trivial",
        changedPaths: set("src/a.ts", "src/b.ts", "src/c.ts"),
      }),
    ).toBe("full")
  })

  it("does NOT downgrade standard tasks to verify-only", () => {
    // Standard task with single edit still gets full safety net
    expect(
      inferVerificationLevel({
        taskClass: "standard",
        changedPaths: set("src/utils.ts"),
      }),
    ).toBe("full")
  })

  it("returns 'full' when regression strikes hit the escalation threshold", () => {
    // Even a doc-only change escalates after repeated runtime regressions.
    expect(
      inferVerificationLevel({
        taskClass: "standard",
        changedPaths: set("README.md"),
        regressionStrikes: ESCALATION_STRIKES,
      }),
    ).toBe("full")
  })

  it("does not escalate below the strike threshold", () => {
    expect(
      inferVerificationLevel({
        taskClass: "standard",
        changedPaths: set("README.md"),
        regressionStrikes: ESCALATION_STRIKES - 1,
      }),
    ).toBe("none")
  })

  it("treats files in nested dirs the same as top-level", () => {
    expect(
      inferVerificationLevel({
        taskClass: "trivial",
        changedPaths: set("apps/web/next.config.ts"),
      }),
    ).toBe("full")
  })
})

describe("RegressionTracker", () => {
  it("starts with zero strikes", () => {
    const t = new RegressionTracker()
    expect(t.currentStrikes).toBe(0)
  })

  it("accrues strikes when runtime errors follow a non-full level", () => {
    const t = new RegressionTracker()
    t.recordVerificationLevel("none")
    t.recordRuntimeError()
    expect(t.currentStrikes).toBe(1)
    t.recordRuntimeError()
    expect(t.currentStrikes).toBe(2)
  })

  it("does NOT accrue strikes when last level was full", () => {
    const t = new RegressionTracker()
    t.recordVerificationLevel("full")
    t.recordRuntimeError()
    expect(t.currentStrikes).toBe(0)
  })

  it("clears strikes on a clean run", () => {
    const t = new RegressionTracker()
    t.recordVerificationLevel("none")
    t.recordRuntimeError()
    t.recordRuntimeError()
    t.recordCleanRun()
    expect(t.currentStrikes).toBe(0)
  })

  it("ignores errors with no preceding verification level recorded", () => {
    const t = new RegressionTracker()
    t.recordRuntimeError()
    expect(t.currentStrikes).toBe(0)
  })
})
