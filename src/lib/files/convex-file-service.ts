/**
 * Production FileService backed by Convex via files_by_path functions.
 * Authority: CONSTITUTION §10, sub-plan 01 Task 12.
 *
 * Thin wrapper — all the path/normalize/walk logic lives in convex/files_by_path.ts
 * (must run on the Convex side because the schema is private to that environment).
 */

import { api } from "@/../convex/_generated/api"
import type { Id } from "@/../convex/_generated/dataModel"
import type { ConvexHttpClient } from "convex/browser"
import type {
  FileRecord,
  FileService,
  FileUpdater,
  ListResult,
} from "./types"

export interface ConvexFileServiceDeps {
  convex: ConvexHttpClient
}

export class ConvexFileService implements FileService {
  constructor(private readonly deps: ConvexFileServiceDeps) {}

  async readPath(projectId: string, path: string): Promise<FileRecord | null> {
    const result = await this.deps.convex.query(api.files_by_path.readPath, {
      projectId: projectId as Id<"projects">,
      path,
    })
    if (!result) return null
    return {
      path: result.path,
      content: result.content,
      updatedAt: result.updatedAt,
      updatedBy: result.updatedBy as FileUpdater,
    }
  }

  async writePath(
    projectId: string,
    path: string,
    content: string,
    updatedBy: FileUpdater,
  ): Promise<void> {
    await this.deps.convex.mutation(api.files_by_path.writePath, {
      projectId: projectId as Id<"projects">,
      path,
      content,
      updatedBy,
    })
  }

  async createPath(
    projectId: string,
    path: string,
    content: string,
    updatedBy: FileUpdater,
  ): Promise<void> {
    await this.deps.convex.mutation(api.files_by_path.createPath, {
      projectId: projectId as Id<"projects">,
      path,
      content,
      updatedBy,
    })
  }

  async deletePath(projectId: string, path: string): Promise<void> {
    await this.deps.convex.mutation(api.files_by_path.deletePath, {
      projectId: projectId as Id<"projects">,
      path,
    })
  }

  async listPath(projectId: string, directory: string): Promise<ListResult> {
    return await this.deps.convex.query(api.files_by_path.listPath, {
      projectId: projectId as Id<"projects">,
      directory,
    })
  }
}
