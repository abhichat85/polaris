/**
 * Inngest function: long-running GitHub repo import.
 * Authority: sub-plan 06 Task 11.
 *
 * Triggered by `github/import.requested` event:
 *   { userId, projectId, owner, repo, ref? }
 *
 * Sets `projects.importStatus = "importing"`, walks the tree via Octokit,
 * writes each file via `files_by_path.writePath`, then sets status to
 * `"completed"` (or `"failed"` on error).
 */

import { ConvexHttpClient } from "convex/browser"
import { NonRetriableError } from "inngest"
import { inngest } from "@/inngest/client"
import { getOctokitForUser } from "@/lib/github/client"
import { importRepoFiles } from "@/features/github/lib/import-repo"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"

interface ImportPayload {
  userId: string
  projectId: Id<"projects">
  owner: string
  repo: string
  ref?: string
}

export const importRepo = inngest.createFunction(
  {
    id: "github-import-repo",
    name: "GitHub: import repo",
    concurrency: { limit: 5, key: "event.data.userId" },
    retries: 2,
  },
  { event: "github/import.requested" },
  async ({ event, step, attempt }) => {
    const { userId, projectId, owner, repo, ref } = event.data as ImportPayload

    const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    if (!internalKey || !convexUrl) {
      throw new NonRetriableError("convex_env_missing")
    }
    const convex = new ConvexHttpClient(convexUrl)

    if (attempt === 0) {
      await step.run("mark-importing", async () => {
        await convex.mutation(api.projects.setImportStatusInternal, {
          internalKey,
          id: projectId,
          status: "importing",
        })
      })
    }

    try {
      const files = await step.run("fetch-tree", async () => {
        const octokit = await getOctokitForUser(userId)
        return await importRepoFiles(octokit, { owner, repo, ref })
      })

      await step.run("write-to-convex", async () => {
        // Bulk write — chunk to keep individual mutations under Convex limits.
        const CHUNK = 25
        for (let i = 0; i < files.length; i += CHUNK) {
          const slice = files.slice(i, i + CHUNK)
          await convex.mutation(api.files_by_path.writeMany, {
            projectId,
            files: slice.map((f) => ({ path: f.path, content: f.content })),
            updatedBy: "import",
          })
        }
      })

      await step.run("mark-completed", async () => {
        await convex.mutation(api.projects.setImportStatusInternal, {
          internalKey,
          id: projectId,
          status: "completed",
        })
      })

      return { ok: true, fileCount: files.length }
    } catch (e) {
      await step.run("mark-failed", async () => {
        await convex.mutation(api.projects.setImportStatusInternal, {
          internalKey,
          id: projectId,
          status: "failed",
        })
      })
      throw e
    }
  },
)
