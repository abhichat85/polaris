/**
 * FileService — abstraction over the project's file store.
 * Authority: CONSTITUTION §3.1 (Convex source of truth) + §3.2 (Day-1 abstractions).
 *
 * The ToolExecutor calls FileService methods rather than Convex directly so:
 *   - Unit tests can run against InMemoryFileService without spinning up Convex
 *   - The Convex schema (tree-based vs flat-path) can change without rewriting
 *     the agent loop
 *
 * Concrete implementations:
 *   - InMemoryFileService → tests
 *   - ConvexFileService   → production (wraps `api.files_by_path.*`)
 */

export type FileUpdater = "user" | "agent" | "scaffold" | "import"

export interface FileRecord {
  path: string
  content: string
  updatedAt: number
  updatedBy: FileUpdater
}

export interface ListResult {
  files: string[]
  folders: string[]
}

export interface FileService {
  /** Returns the file record for a path, or null if not found. */
  readPath(projectId: string, path: string): Promise<FileRecord | null>

  /** Overwrites an existing file. Throws if the path does not exist. */
  writePath(
    projectId: string,
    path: string,
    content: string,
    updatedBy: FileUpdater,
  ): Promise<void>

  /** Creates a new file. Throws if the path already exists. */
  createPath(
    projectId: string,
    path: string,
    content: string,
    updatedBy: FileUpdater,
  ): Promise<void>

  /** Deletes a file. Throws if the path does not exist. */
  deletePath(projectId: string, path: string): Promise<void>

  /** Lists immediate children of a directory (files + subfolders). */
  listPath(projectId: string, directory: string): Promise<ListResult>
}
