import { describe, it, expect } from "vitest"
import { applyEdit, countOccurrences } from "@/lib/tools/edit-file"

describe("countOccurrences", () => {
  it("returns 0 for empty needle", () => {
    expect(countOccurrences("anything", "")).toBe(0)
  })

  it("returns 0 when needle is absent", () => {
    expect(countOccurrences("hello world", "missing")).toBe(0)
  })

  it("returns 1 for a single match", () => {
    expect(countOccurrences("hello world", "world")).toBe(1)
  })

  it("counts non-overlapping occurrences", () => {
    expect(countOccurrences("abcabcabc", "abc")).toBe(3)
  })

  it("does not double-count overlapping matches", () => {
    // "aaaa" has at most 2 non-overlapping "aa" matches, not 3.
    expect(countOccurrences("aaaa", "aa")).toBe(2)
  })

  it("handles multiline search strings", () => {
    const haystack = "line1\nline2\nline3\nline2\n"
    expect(countOccurrences(haystack, "line2\n")).toBe(2)
  })

  it("treats newlines as significant", () => {
    expect(countOccurrences("a\nb", "ab")).toBe(0)
  })
})

describe("applyEdit", () => {
  it("returns NOT_FOUND when search string is absent", () => {
    const result = applyEdit("const x = 1", "missing", "y")
    expect(result).toEqual({ kind: "not_found" })
  })

  it("returns NOT_UNIQUE with the count when search appears multiple times", () => {
    const result = applyEdit("abc abc abc", "abc", "x")
    expect(result).toEqual({ kind: "not_unique", occurrences: 3 })
  })

  it("returns OK with the new content on a unique match", () => {
    const result = applyEdit("const a = 1\nconst b = 2\n", "const a = 1", "const a = 42")
    expect(result).toEqual({
      kind: "ok",
      content: "const a = 42\nconst b = 2\n",
    })
  })

  it("supports empty replacement (deletion)", () => {
    const result = applyEdit("keep\nremove me\nkeep\n", "remove me\n", "")
    expect(result).toEqual({ kind: "ok", content: "keep\nkeep\n" })
  })

  it("does not interpret regex special characters in search", () => {
    const original = "const re = /foo.*bar/g"
    const result = applyEdit(original, "/foo.*bar/g", "/foo|bar/g")
    expect(result).toEqual({ kind: "ok", content: "const re = /foo|bar/g" })
  })

  it("does not interpret $ or capture groups in replacement", () => {
    // Naive String.replace with a string replace argument respects $ — we must NOT.
    const original = "before TARGET after"
    const result = applyEdit(original, "TARGET", "$1 literal $&")
    expect(result).toEqual({ kind: "ok", content: "before $1 literal $& after" })
  })

  it("preserves the rest of the file byte-for-byte", () => {
    const original = "alpha\n  beta {\n    gamma: 1,\n  }\n"
    const result = applyEdit(original, "gamma: 1", "gamma: 999")
    expect(result).toEqual({
      kind: "ok",
      content: "alpha\n  beta {\n    gamma: 999,\n  }\n",
    })
  })

  it("rejects empty search string up front (would otherwise match everywhere)", () => {
    // An empty search would either match everywhere or nowhere depending on impl.
    // We pin it down: empty search → NOT_FOUND (consistent with countOccurrences).
    const result = applyEdit("anything", "", "x")
    expect(result).toEqual({ kind: "not_found" })
  })
})
