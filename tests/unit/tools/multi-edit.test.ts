import { describe, it, expect } from "vitest"
import { applyMultiEdit, type MultiEditEdit } from "@/lib/tools/multi-edit"

describe("applyMultiEdit", () => {
  it("returns ok with unchanged content for an empty edits array", () => {
    const result = applyMultiEdit("hello", [])
    expect(result).toEqual({ kind: "ok", content: "hello" })
  })

  it("applies a single edit with a single occurrence", () => {
    const edits: MultiEditEdit[] = [{ search: "foo", replace: "bar" }]
    const result = applyMultiEdit("the foo is here", edits)
    expect(result).toEqual({ kind: "ok", content: "the bar is here" })
  })

  it("applies two sequential edits, both single-occurrence", () => {
    const edits: MultiEditEdit[] = [
      { search: "alpha", replace: "ALPHA" },
      { search: "beta", replace: "BETA" },
    ]
    const result = applyMultiEdit("alpha and beta\n", edits)
    expect(result).toEqual({ kind: "ok", content: "ALPHA and BETA\n" })
  })

  it("applies an edit whose search was created by a preceding edit (intermediate state)", () => {
    // First edit produces "bar"; second edit's search is "bar".
    const edits: MultiEditEdit[] = [
      { search: "foo", replace: "bar" },
      { search: "bar", replace: "baz" },
    ]
    const result = applyMultiEdit("foo here", edits)
    expect(result).toEqual({ kind: "ok", content: "baz here" })
  })

  it("supports replaceAll=true to replace every occurrence", () => {
    const edits: MultiEditEdit[] = [{ search: "foo", replace: "bar", replaceAll: true }]
    const result = applyMultiEdit("foo foo foo", edits)
    expect(result).toEqual({ kind: "ok", content: "bar bar bar" })
  })

  it("returns not_found with the failing index when replaceAll has zero matches", () => {
    const edits: MultiEditEdit[] = [
      { search: "alpha", replace: "ALPHA" },
      { search: "missing", replace: "X", replaceAll: true },
    ]
    const result = applyMultiEdit("alpha here\n", edits)
    expect(result).toEqual({ kind: "not_found", index: 1 })
  })

  it("is atomic: failure on a later edit yields a failure variant with no content (input not mutated)", () => {
    const original = "alpha here\n"
    const edits: MultiEditEdit[] = [
      { search: "alpha", replace: "ALPHA" },
      { search: "missing", replace: "X" },
    ]
    const result = applyMultiEdit(original, edits)
    // Failure variant - no content field on failure.
    expect(result.kind).toBe("not_found")
    if (result.kind === "not_found") {
      expect(result.index).toBe(1)
    }
    // Pure function: original input must not have been mutated.
    expect(original).toBe("alpha here\n")
  })

  it("returns not_unique with the failing index and occurrences when search is ambiguous and replaceAll is not set", () => {
    const edits: MultiEditEdit[] = [
      { search: "x", replace: "y" }, // ambiguous: 3 occurrences
    ]
    const result = applyMultiEdit("x x x", edits)
    expect(result).toEqual({ kind: "not_unique", index: 0, occurrences: 3 })
  })

  it("returns empty_search with the failing index when search string is empty", () => {
    const edits: MultiEditEdit[] = [
      { search: "alpha", replace: "ALPHA" },
      { search: "", replace: "X" },
    ]
    const result = applyMultiEdit("alpha here", edits)
    expect(result).toEqual({ kind: "empty_search", index: 1 })
  })

  it("does not interpret $ or capture groups in replace strings (mirrors applyEdit contract)", () => {
    const edits: MultiEditEdit[] = [
      { search: "TARGET", replace: "$1 literal $&" },
    ]
    const result = applyMultiEdit("before TARGET after", edits)
    expect(result).toEqual({
      kind: "ok",
      content: "before $1 literal $& after",
    })
  })

  it("does not interpret $ or capture groups under replaceAll either", () => {
    const edits: MultiEditEdit[] = [
      { search: "T", replace: "$&", replaceAll: true },
    ]
    const result = applyMultiEdit("T-T-T", edits)
    expect(result).toEqual({ kind: "ok", content: "$&-$&-$&" })
  })

  it("respects edit order — edit 2 finds content created by edit 1's replaceAll", () => {
    const edits: MultiEditEdit[] = [
      { search: "foo", replace: "bar", replaceAll: true },
      { search: "bar bar", replace: "BAR_PAIR" },
    ]
    const result = applyMultiEdit("foo foo baz", edits)
    expect(result).toEqual({ kind: "ok", content: "BAR_PAIR baz" })
  })
})
