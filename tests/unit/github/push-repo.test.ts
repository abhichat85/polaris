/**
 * push-repo tests. Authority: sub-plan 06 Task 10.
 *
 * Verifies the secret-scan gate fires; we don't actually hit GitHub here.
 */

import { describe, it, expect } from "vitest"
import { pushRepo, SecretLeakError } from "@/features/github/lib/push-repo"

const fakeOctokit = {} as never

describe("pushRepo", () => {
  it("throws SecretLeakError when files contain a secret", async () => {
    const files = [
      { path: "src/secrets.ts", content: "const k = 'ghp_" + "a".repeat(36) + "'" },
    ]
    await expect(
      pushRepo(fakeOctokit, files, { owner: "o", repo: "r" }),
    ).rejects.toBeInstanceOf(SecretLeakError)
  })

  it("scan result on the error has the offending file", async () => {
    const files = [
      { path: "config.ts", content: "export const k = 'AKIAIOSFODNN7EXAMPLE'" },
    ]
    try {
      await pushRepo(fakeOctokit, files, { owner: "o", repo: "r" })
      throw new Error("expected to throw")
    } catch (e) {
      expect(e).toBeInstanceOf(SecretLeakError)
      const err = e as SecretLeakError
      expect(err.scanResult.findings[0].path).toBe("config.ts")
      expect(err.scanResult.findings[0].category).toBe("aws_access_key")
    }
  })
})
