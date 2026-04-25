/**
 * Pure edit-file logic — extracted from ToolExecutor so it can be unit-tested
 * without Convex/Sandbox mocks. Authority: CONSTITUTION.md §8.4 edit_file.
 *
 * Match policy: the search string must appear exactly once in the file.
 *   - 0 occurrences → not_found (model should re-read and refine)
 *   - >1 occurrences → not_unique (model must add surrounding context)
 *   - exactly 1 → ok with replacement applied literally (no regex semantics)
 */

export type EditOutcome =
  | { kind: "ok"; content: string }
  | { kind: "not_found" }
  | { kind: "not_unique"; occurrences: number }

/** Count non-overlapping occurrences of `needle` in `haystack`. Empty needle → 0. */
export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let from = 0
  while (true) {
    const idx = haystack.indexOf(needle, from)
    if (idx === -1) return count
    count++
    from = idx + needle.length
  }
}

/**
 * Apply a single literal substring replacement. Does not interpret regex
 * metacharacters in `search`, nor `$1`/`$&`-style backreferences in `replace`.
 */
export function applyEdit(content: string, search: string, replace: string): EditOutcome {
  const occurrences = countOccurrences(content, search)
  if (occurrences === 0) return { kind: "not_found" }
  if (occurrences > 1) return { kind: "not_unique", occurrences }

  const idx = content.indexOf(search)
  // Slice + concat avoids String.prototype.replace's $-interpretation of `replace`.
  const next = content.slice(0, idx) + replace + content.slice(idx + search.length)
  return { kind: "ok", content: next }
}
