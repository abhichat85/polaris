/**
 * Tests for sandbox path utilities.
 * CONSTITUTION §6.2 rule 2 — all sandbox paths are POSIX-style.
 */
import { describe, it, expect } from "vitest"
import { toPosix, toRelative, parentDirs } from "@/lib/sandbox/path-utils"

describe("toPosix", () => {
  it("adds a leading slash when missing", () => {
    expect(toPosix("src/app/page.tsx")).toBe("/src/app/page.tsx")
  })
  it("preserves an existing leading slash", () => {
    expect(toPosix("/src/app/page.tsx")).toBe("/src/app/page.tsx")
  })
  it("converts backslashes to forward slashes", () => {
    expect(toPosix("\\src\\app\\page.tsx")).toBe("/src/app/page.tsx")
  })
  it("collapses repeated slashes", () => {
    expect(toPosix("//src///app//page.tsx")).toBe("/src/app/page.tsx")
  })
  it("returns root for empty input", () => {
    expect(toPosix("")).toBe("/")
  })
})

describe("toRelative", () => {
  it("strips a leading slash", () => {
    expect(toRelative("/a/b.ts")).toBe("a/b.ts")
  })
  it("leaves an already-relative path alone", () => {
    expect(toRelative("a/b.ts")).toBe("a/b.ts")
  })
})

describe("parentDirs", () => {
  it("lists ancestor directories of a nested path", () => {
    expect(parentDirs("src/app/page.tsx")).toEqual(["src", "src/app"])
  })
  it("works with absolute paths", () => {
    expect(parentDirs("/foo/bar/baz/x.ts")).toEqual(["foo", "foo/bar", "foo/bar/baz"])
  })
  it("returns an empty array for top-level files", () => {
    expect(parentDirs("x.ts")).toEqual([])
  })
})
