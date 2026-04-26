/**
 * allowlist tests. Authority: sub-plan 10 Task 3.
 */

import { describe, it, expect } from "vitest"
import { checkAllowlist } from "@/lib/clerk/allowlist"

describe("checkAllowlist", () => {
  it("admits an explicit email match (case-insensitive)", () => {
    const r = checkAllowlist("Founder@Praxiomai.Xyz", {
      emails: "founder@praxiomai.xyz",
      domains: "",
    })
    expect(r).toEqual({ admit: true, reason: "explicit_email" })
  })

  it("admits via domain match", () => {
    const r = checkAllowlist("any@praxiomai.xyz", {
      emails: "",
      domains: "praxiomai.xyz",
    })
    expect(r).toEqual({ admit: true, reason: "domain_match" })
  })

  it("rejects when neither matches", () => {
    const r = checkAllowlist("rando@example.com", {
      emails: "founder@praxiomai.xyz",
      domains: "praxiomai.xyz",
    })
    expect(r).toEqual({ admit: false, reason: "not_listed" })
  })

  it('admits everyone when emails has "*"', () => {
    const r = checkAllowlist("anyone@anywhere.com", { emails: "*", domains: "" })
    expect(r.admit).toBe(true)
    expect(r.reason).toBe("open_beta")
  })

  it('admits everyone when domains has "*"', () => {
    const r = checkAllowlist("anyone@anywhere.com", { emails: "", domains: "*" })
    expect(r.admit).toBe(true)
  })

  it("trims whitespace and is comma-tolerant", () => {
    const r = checkAllowlist("a@b.com", {
      emails: " a@b.com , c@d.com ",
      domains: "",
    })
    expect(r.admit).toBe(true)
  })

  it("rejects emails without @ as not_listed (no crash)", () => {
    const r = checkAllowlist("not-an-email", { emails: "x", domains: "y" })
    expect(r).toEqual({ admit: false, reason: "not_listed" })
  })
})
