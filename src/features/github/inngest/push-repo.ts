/**
 * Inngest function: long-running GitHub repo push.
 * Authority: sub-plan 06 Task 11.
 *
 * Triggered by `github/push.requested` event:
 *   { userId, projectId, owner, repo, branch?, commitMessage? }
 *
 * Loads project files from Convex, runs the secret scanner (sub-plan 06 §13.3),
 * and pushes via Octokit. On secret-leak, status -> "failed" and the UI
 * surfaces a SecretLeakWarning modal that lists findings.
 */

import { ConvexHttpClient } from "convex/browser"
import { NonRetriableError } from "inngest"
import { inngest } from "@/inngest/client"
import { getOctokitForUser } from "@/lib/github/client"
import { pushRepo as pushRepoLib, SecretLeakError } from "@/features/github/lib/push-repo"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"

interface PushPayload {
  userId: string
  projectId: Id<"projects">
  owner: string
  repo: string
  branch?: string
  commitMessage?: string
}

export const pushRepo = inngest.createFunction(
  {
    id: "github-push-repo",
    name: "GitHub: push repo",
    concurrency: { limit: 5, key: "event.data.userId" },
    retries: 2,
  },
  { event: "github/push.requested" },
  async ({ event, step, attempt }) => {
    const { userId, projectId, owner, repo, branch, commitMessage } =
      event.data as PushPayload

    const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    if (!internalKey || !convexUrl) {
      throw new NonRetriableError("convex_env_missing")
    }
    const convex = new ConvexHttpClient(convexUrl)

    if (attempt === 0) {
      await step.run("mark-exporting", async () => {
        await convex.mutation(api.projects.setExportStatusInternal, {
          internalKey,
          id: projectId,
          status: "exporting",
        })
      })
    }

    try {
      const files = await step.run("load-files", async () => {
        const all = await convex.query(api.files_by_path.listAllWithContent, {
          projectId,
        })
        return all
      })

      const result = await step.run("push-to-github", async () => {
        const octokit = await getOctokitForUser(userId)
        return await pushRepoLib(
          octokit,
          files.map((f) => ({ path: f.path, content: f.content })),
          { owner, repo, branch, commitMessage },
        )
      })

      await step.run("mark-completed", async () => {
        await convex.mutation(api.projects.setExportStatusInternal, {
          internalKey,
          id: projectId,
          status: "completed",
          exportRepoUrl: result.htmlUrl,
        })
      })

      return { ok: true, ...result }
    } catch (e) {
      const isLeak = e instanceof SecretLeakError
      await step.run("mark-failed", async () => {
        await convex.mutation(api.projects.setExportStatusInternal, {
          internalKey,
          id: projectId,
          status: "failed",
        })
      })
      if (isLeak) {
        // Don't retry — the user must scrub findings.
        throw new NonRetriableError("secret_leak")
      }
      throw e
    }
  },
)
