/**
 * In-memory FileService implementation. Used by unit tests and the
 * MockSandboxProvider local-dev scenario.
 *
 * Storage: Map<projectId, Map<path, FileRecord>>. Path normalization removes
 * leading slashes so "src/x.ts" and "/src/x.ts" map to the same record.
 */

import type {
  FileRecord,
  FileService,
  FileUpdater,
  ListResult,
} from "./types"

function normalize(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path
}

export class InMemoryFileService implements FileService {
  private projects = new Map<string, Map<string, FileRecord>>()

  async readPath(projectId: string, path: string): Promise<FileRecord | null> {
    const proj = this.projects.get(projectId)
    if (!proj) return null
    return proj.get(normalize(path)) ?? null
  }

  async writePath(
    projectId: string,
    path: string,
    content: string,
    updatedBy: FileUpdater,
  ): Promise<void> {
    const p = normalize(path)
    const proj = this.must(projectId)
    if (!proj.has(p)) throw new Error(`File not found: ${p}`)
    proj.set(p, { path: p, content, updatedAt: Date.now(), updatedBy })
  }

  async createPath(
    projectId: string,
    path: string,
    content: string,
    updatedBy: FileUpdater,
  ): Promise<void> {
    const p = normalize(path)
    const proj = this.ensure(projectId)
    if (proj.has(p)) throw new Error(`File already exists: ${p}`)
    proj.set(p, { path: p, content, updatedAt: Date.now(), updatedBy })
  }

  async deletePath(projectId: string, path: string): Promise<void> {
    const p = normalize(path)
    const proj = this.must(projectId)
    if (!proj.delete(p)) throw new Error(`File not found: ${p}`)
  }

  async listPath(projectId: string, directory: string): Promise<ListResult> {
    const proj = this.projects.get(projectId)
    if (!proj) return { files: [], folders: [] }

    const dir = normalize(directory)
    const prefix = dir === "" || dir === "/" ? "" : dir.endsWith("/") ? dir : dir + "/"

    const files: string[] = []
    const folderSet = new Set<string>()

    for (const fullPath of proj.keys()) {
      if (!fullPath.startsWith(prefix)) continue
      const remainder = fullPath.slice(prefix.length)
      if (remainder === "") continue
      const slashIdx = remainder.indexOf("/")
      if (slashIdx === -1) {
        files.push(fullPath)
      } else {
        folderSet.add(prefix + remainder.slice(0, slashIdx))
      }
    }

    return { files, folders: Array.from(folderSet) }
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  private must(projectId: string): Map<string, FileRecord> {
    const proj = this.projects.get(projectId)
    if (!proj) throw new Error(`File not found: project ${projectId} has no files`)
    return proj
  }

  private ensure(projectId: string): Map<string, FileRecord> {
    let proj = this.projects.get(projectId)
    if (!proj) {
      proj = new Map()
      this.projects.set(projectId, proj)
    }
    return proj
  }
}
