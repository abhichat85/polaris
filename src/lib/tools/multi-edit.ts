/**
 * Pure multi-edit logic — applies an ordered array of search/replace edits to
 * a single file's content atomically. Authority: CONSTITUTION.md §8 (D-035).
 *
 * Atomicity contract: returns either `{ kind: "ok", content: <fully-applied> }`
 * or one error variant referencing the failing edit's `index`. Never returns a
 * partially-applied content. The caller decides what to do with the input file
 * based solely on the returned variant.
 *
 * Per-edit semantics mirror `applyEdit`:
 *   - Default: search must match exactly once in the current (post-prior-edits)
 *     buffer; otherwise `not_found` or `not_unique`.
 *   - `replaceAll: true`: at least one match required; all matches replaced.
 *   - Empty search rejected up front with `empty_search`.
 *   - Literal substring (no regex), no `$1`/`$&` interpretation in replace.
 */

import { applyEdit, countOccurrences } from "./edit-file"

export interface MultiEditEdit {
  search: string
  replace: string
  replaceAll?: boolean
}

export type MultiEditOutcome =
  | { kind: "ok"; content: string }
  | { kind: "not_found"; index: number }
  | { kind: "not_unique"; index: number; occurrences: number }
  | { kind: "empty_search"; index: number }

export function applyMultiEdit(
  content: string,
  edits: MultiEditEdit[],
): MultiEditOutcome {
  let current = content
  for (let i = 0; i < edits.length; i++) {
    const e = edits[i]
    if (!e.search) return { kind: "empty_search", index: i }

    if (e.replaceAll) {
      const occ = countOccurrences(current, e.search)
      if (occ === 0) return { kind: "not_found", index: i }
      // split+join performs literal replacement, avoiding String.replace's
      // $-interpretation in the replacement argument.
      current = current.split(e.search).join(e.replace)
      continue
    }

    // Single-occurrence semantics; reuse applyEdit so the contract stays in
    // exactly one place.
    const outcome = applyEdit(current, e.search, e.replace)
    if (outcome.kind === "not_found") return { kind: "not_found", index: i }
    if (outcome.kind === "not_unique") {
      return { kind: "not_unique", index: i, occurrences: outcome.occurrences }
    }
    current = outcome.content
  }
  return { kind: "ok", content: current }
}
