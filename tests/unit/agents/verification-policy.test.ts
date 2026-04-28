import { describe, it, expect } from "vitest"
import {
  resolveVerificationPolicy,
  shouldWireVerify,
  shouldWireVerifyBuild,
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
