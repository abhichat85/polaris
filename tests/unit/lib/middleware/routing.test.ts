import { describe, it, expect } from "vitest"
import { resolveRouting, isMarketingPath } from "@/lib/middleware/routing"

describe("isMarketingPath", () => {
  it.each([
    ["/", true],
    ["/about", true],
    ["/about/team", true],
    ["/pricing", true],
    ["/pricing/", true],
    ["/legal", true],
    ["/legal/terms", true],
    ["/legal/privacy", true],
    ["/status", true],
    ["/dashboard", false],
    ["/projects", false],
    ["/projects/123", false],
    ["/settings", false],
    ["/sign-in", false],
    ["/sign-up", false],
    ["/api/health", false],
  ])("isMarketingPath(%s) === %s", (pathname, expected) => {
    expect(isMarketingPath(pathname)).toBe(expected)
  })
})

describe("resolveRouting — marketing domain", () => {
  const host = "getpolaris.xyz"

  it("passes through marketing paths", () => {
    expect(resolveRouting(host, "/", "")).toEqual({ action: "passthrough" })
    expect(resolveRouting(host, "/about", "")).toEqual({ action: "passthrough" })
    expect(resolveRouting(host, "/pricing", "")).toEqual({ action: "passthrough" })
    expect(resolveRouting(host, "/legal/terms", "")).toEqual({ action: "passthrough" })
    expect(resolveRouting(host, "/status", "")).toEqual({ action: "passthrough" })
  })

  it("redirects non-marketing paths to app subdomain", () => {
    expect(resolveRouting(host, "/dashboard", "")).toEqual({
      action: "redirect",
      destination: "https://app.getpolaris.xyz/dashboard",
    })
    expect(resolveRouting(host, "/sign-in", "")).toEqual({
      action: "redirect",
      destination: "https://app.getpolaris.xyz/sign-in",
    })
    expect(resolveRouting(host, "/projects/abc", "")).toEqual({
      action: "redirect",
      destination: "https://app.getpolaris.xyz/projects/abc",
    })
  })

  it("preserves query string when redirecting", () => {
    expect(resolveRouting(host, "/sign-in", "?redirect_url=/dashboard")).toEqual({
      action: "redirect",
      destination: "https://app.getpolaris.xyz/sign-in?redirect_url=/dashboard",
    })
  })

  it("also matches www subdomain", () => {
    expect(resolveRouting("www.getpolaris.xyz", "/dashboard", "")).toEqual({
      action: "redirect",
      destination: "https://app.getpolaris.xyz/dashboard",
    })
  })
})

describe("resolveRouting — app subdomain", () => {
  const host = "app.getpolaris.xyz"

  it("redirects root to /dashboard", () => {
    expect(resolveRouting(host, "/", "")).toEqual({
      action: "redirect",
      destination: "https://app.getpolaris.xyz/dashboard",
    })
  })

  it("protects dashboard routes", () => {
    expect(resolveRouting(host, "/dashboard", "")).toEqual({ action: "protect" })
    expect(resolveRouting(host, "/dashboard/overview", "")).toEqual({ action: "protect" })
    expect(resolveRouting(host, "/projects/abc", "")).toEqual({ action: "protect" })
    expect(resolveRouting(host, "/settings", "")).toEqual({ action: "protect" })
    expect(resolveRouting(host, "/settings/billing", "")).toEqual({ action: "protect" })
  })

  it("passes through auth routes without protecting", () => {
    expect(resolveRouting(host, "/sign-in", "")).toEqual({ action: "passthrough" })
    expect(resolveRouting(host, "/sign-up", "")).toEqual({ action: "passthrough" })
  })

  it("passes through API routes", () => {
    expect(resolveRouting(host, "/api/health", "")).toEqual({ action: "passthrough" })
    expect(resolveRouting(host, "/api/inngest", "")).toEqual({ action: "passthrough" })
    expect(resolveRouting(host, "/api/webhooks/clerk", "")).toEqual({ action: "passthrough" })
  })
})

describe("resolveRouting — local dev (localhost)", () => {
  const host = "localhost:3000"

  it("protects app routes on localhost too", () => {
    expect(resolveRouting(host, "/dashboard", "")).toEqual({ action: "protect" })
    expect(resolveRouting(host, "/projects/xyz", "")).toEqual({ action: "protect" })
  })

  it("passes through marketing routes on localhost", () => {
    expect(resolveRouting(host, "/", "")).toEqual({ action: "passthrough" })
    expect(resolveRouting(host, "/about", "")).toEqual({ action: "passthrough" })
    expect(resolveRouting(host, "/pricing", "")).toEqual({ action: "passthrough" })
  })

  it("passes through auth routes on localhost", () => {
    expect(resolveRouting(host, "/sign-in", "")).toEqual({ action: "passthrough" })
  })
})
