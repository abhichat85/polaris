/**
 * POSIX path helpers for the sandbox subsystem.
 * Authority: CONSTITUTION §6.2 rules 2 and 3.
 *
 * Sandbox calls always pass leading-slash POSIX paths to the underlying
 * provider. Convex storage uses relative paths ("src/app/page.tsx"). These
 * helpers translate between the two cleanly so callers never hand-roll string
 * surgery.
 */

/** Normalize an input path to a leading-slash POSIX absolute path. */
export function toPosix(path: string): string {
  if (!path) return "/"
  let p = path.replace(/\\/g, "/")
  if (!p.startsWith("/")) p = "/" + p
  p = p.replace(/\/+/g, "/")
  return p
}

/** Strip the leading slash for storage in Convex `files.path`. */
export function toRelative(path: string): string {
  return toPosix(path).replace(/^\//, "")
}

/** All ancestor directories of `path`, relative form. */
export function parentDirs(path: string): string[] {
  const parts = toRelative(path).split("/")
  parts.pop() // drop filename
  const out: string[] = []
  let cur = ""
  for (const seg of parts) {
    if (!seg) continue
    cur = cur ? `${cur}/${seg}` : seg
    out.push(cur)
  }
  return out
}
