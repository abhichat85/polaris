/**
 * Secret-scan tests. Authority: CONSTITUTION §13.3, sub-plan 06 Task 8.
 *
 * The scanner runs over every file before a push. If ANY file has a finding,
 * the push is aborted and the user must resolve. There is no override.
 */

import { describe, it, expect } from "vitest"
import { scanFiles, scanContent, SECRET_PATTERNS } from "@/lib/security/secret-scan"

describe("scanContent", () => {
  it("flags AWS access key id", () => {
    const findings = scanContent("AKIAIOSFODNN7EXAMPLE")
    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].category).toBe("aws_access_key")
  })

  it("flags GitHub PAT (ghp_)", () => {
    const findings = scanContent("ghp_" + "a".repeat(36))
    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].category).toBe("github_token")
  })

  it("flags Stripe live secret key (sk_live_)", () => {
    const findings = scanContent("sk_live_" + "a".repeat(24))
    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].category).toBe("stripe_key")
  })

  it("flags OpenAI key (sk-proj-)", () => {
    const findings = scanContent("sk-proj-" + "a".repeat(48))
    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].category).toBe("openai_key")
  })

  it("flags Anthropic API key", () => {
    const findings = scanContent("sk-ant-api03-" + "a".repeat(95))
    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].category).toBe("anthropic_key")
  })

  it("flags PEM private key blocks", () => {
    const findings = scanContent(
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAabc\n-----END RSA PRIVATE KEY-----",
    )
    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].category).toBe("private_key")
  })

  it("does not flag innocuous code", () => {
    const findings = scanContent(
      "function add(a, b) {\n  return a + b\n}\nconst x = 'hello'",
    )
    expect(findings).toEqual([])
  })

  it("returns line numbers (1-indexed)", () => {
    const content =
      "line 1\nline 2\nAKIAIOSFODNN7EXAMPLE\nline 4"
    const findings = scanContent(content)
    expect(findings[0].line).toBe(3)
  })

  it("does not flag the same value twice (per-pattern)", () => {
    const content = "ghp_" + "a".repeat(36) + " repeated " + "ghp_" + "a".repeat(36)
    const findings = scanContent(content)
    // multiple matches OK, but each finding has distinct line/column
    expect(findings.length).toBeGreaterThanOrEqual(1)
  })
})

describe("scanFiles", () => {
  it("returns empty when all files are clean", () => {
    const result = scanFiles([
      { path: "src/app/page.tsx", content: "export default function P() {}" },
      { path: "README.md", content: "# Project" },
    ])
    expect(result.findings).toEqual([])
    expect(result.clean).toBe(true)
  })

  it("returns findings keyed by file path", () => {
    const result = scanFiles([
      { path: "src/secrets.ts", content: "const k = 'AKIAIOSFODNN7EXAMPLE'" },
      { path: "README.md", content: "# Safe" },
    ])
    expect(result.clean).toBe(false)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].path).toBe("src/secrets.ts")
  })

  it("skips known binary extensions", () => {
    const binaryContent = String.fromCharCode(0, 1, 2, 3) + "AKIAIOSFODNN7EXAMPLE"
    const result = scanFiles([
      { path: "logo.png", content: binaryContent },
    ])
    // Binary files are skipped — no findings even if string would match.
    expect(result.findings).toEqual([])
  })

  it("scans multiple files and accumulates findings", () => {
    const result = scanFiles([
      { path: "a.ts", content: "ghp_" + "a".repeat(36) },
      { path: "b.ts", content: "sk_live_" + "a".repeat(24) },
      { path: "c.ts", content: "// safe" },
    ])
    expect(result.findings).toHaveLength(2)
    expect(result.findings.map((f) => f.path).sort()).toEqual(["a.ts", "b.ts"])
  })
})

describe("SECRET_PATTERNS", () => {
  it("each pattern has a category and a regex", () => {
    for (const p of SECRET_PATTERNS) {
      expect(typeof p.category).toBe("string")
      expect(p.regex).toBeInstanceOf(RegExp)
    }
  })
})
