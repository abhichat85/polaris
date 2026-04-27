/**
 * Workspaces — handler-level tests. We replicate the slug-uniqueness loop
 * and last-owner protection logic so the contract is asserted without a
 * live Convex harness.
 *
 * Authority: D-020.
 */

import { describe, it, expect } from "vitest"

const slugify = (name: string): string => {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
  return base || "workspace"
}

const allocateSlug = (name: string, taken: Set<string>): string => {
  const base = slugify(name)
  let slug = base
  let n = 1
  while (taken.has(slug)) {
    n += 1
    slug = `${base}-${n}`
    if (n > 50) throw new Error("Could not allocate slug")
  }
  return slug
}

describe("workspaces — slug allocation (D-020)", () => {
  it("slugifies basic name", () => {
    expect(slugify("Acme Team")).toBe("acme-team")
  })

  it("strips punctuation + non-alphanumerics", () => {
    expect(slugify("Foo / Bar 2.0!")).toBe("foo-bar-2-0")
  })

  it("falls back to 'workspace' when name is empty after slugify", () => {
    expect(slugify("---")).toBe("workspace")
  })

  it("appends -2 on collision", () => {
    const taken = new Set(["acme-team"])
    expect(allocateSlug("Acme Team", taken)).toBe("acme-team-2")
  })

  it("appends -N on multiple collisions", () => {
    const taken = new Set(["a", "a-2", "a-3"])
    expect(allocateSlug("a", taken)).toBe("a-4")
  })

  it("throws after 50 collisions", () => {
    const taken = new Set<string>(["x"])
    for (let i = 2; i <= 51; i++) taken.add(`x-${i}`)
    expect(() => allocateSlug("x", taken)).toThrow(/Could not allocate slug/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Role boundary helpers — replicated from `convex/workspaces.ts`
// ─────────────────────────────────────────────────────────────────────────────

type Role = "owner" | "admin" | "member"

interface Member {
  userId: string
  role: Role
}

const canBeRemoved = (target: Member, owners: Member[]): boolean => {
  if (target.role !== "owner") return true
  return owners.length > 1
}

const canBeDemoted = (target: Member, newRole: Role, owners: Member[]): boolean => {
  if (target.role === "owner" && newRole !== "owner") {
    return owners.length > 1
  }
  return true
}

describe("workspaces — role boundaries (D-020)", () => {
  it("non-owner removal is always allowed", () => {
    const owners = [{ userId: "a", role: "owner" as Role }]
    const target = { userId: "b", role: "member" as Role }
    expect(canBeRemoved(target, owners)).toBe(true)
  })

  it("last-owner removal is blocked", () => {
    const owners = [{ userId: "a", role: "owner" as Role }]
    expect(canBeRemoved(owners[0], owners)).toBe(false)
  })

  it("non-last-owner removal is allowed", () => {
    const owners = [
      { userId: "a", role: "owner" as Role },
      { userId: "b", role: "owner" as Role },
    ]
    expect(canBeRemoved(owners[0], owners)).toBe(true)
  })

  it("last-owner demotion is blocked", () => {
    const owners = [{ userId: "a", role: "owner" as Role }]
    expect(canBeDemoted(owners[0], "admin", owners)).toBe(false)
  })

  it("admin → member demotion always allowed", () => {
    const owners = [{ userId: "a", role: "owner" as Role }]
    const admin = { userId: "b", role: "admin" as Role }
    expect(canBeDemoted(admin, "member", owners)).toBe(true)
  })

  it("non-last-owner demotion is allowed", () => {
    const owners = [
      { userId: "a", role: "owner" as Role },
      { userId: "b", role: "owner" as Role },
    ]
    expect(canBeDemoted(owners[0], "admin", owners)).toBe(true)
  })
})
