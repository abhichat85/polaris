/**
 * Polaris project → GitHub repo push. Authority: sub-plan 06 Task 10.
 *
 * 1. Run secret scanner. If any finding, throw with `secret_leak` cause.
 * 2. Octokit: create blobs → tree → commit → update ref.
 * 3. Returns the new commit sha + repo HTML url.
 *
 * Push is single-commit only (all files squashed). No history rewrites in v1.
 */

import type { Octokit } from "octokit"
import { scanFiles, type ScanResult } from "@/lib/security/secret-scan"

export interface PushFile {
  path: string
  content: string
}

export interface PushOptions {
  owner: string
  repo: string
  branch?: string
  commitMessage?: string
  /** When true, skip the secret scan. NEVER expose this to users. */
  __unsafeSkipSecretScan?: boolean
}

export interface PushResult {
  commitSha: string
  htmlUrl: string
  branch: string
}

export class SecretLeakError extends Error {
  constructor(public readonly scanResult: ScanResult) {
    super("secret_leak")
    this.name = "SecretLeakError"
  }
}

export async function pushRepo(
  octokit: Octokit,
  files: PushFile[],
  opts: PushOptions,
): Promise<PushResult> {
  if (!opts.__unsafeSkipSecretScan) {
    const scan = scanFiles(files)
    if (!scan.clean) {
      throw new SecretLeakError(scan)
    }
  }

  const { owner, repo } = opts
  const branch = opts.branch ?? "main"
  const message = opts.commitMessage ?? "Update from Polaris"

  // Find or create branch ref.
  let parentSha: string | null = null
  try {
    const refData = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    })
    parentSha = refData.data.object.sha
  } catch {
    // Branch doesn't exist — get repo default branch sha as parent.
    const repoData = await octokit.rest.repos.get({ owner, repo })
    const defaultRef = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${repoData.data.default_branch}`,
    })
    parentSha = defaultRef.data.object.sha
  }

  // Create blobs for each file.
  const blobs = await Promise.all(
    files.map(async (f) => {
      const blob = await octokit.rest.git.createBlob({
        owner,
        repo,
        content: Buffer.from(f.content, "utf8").toString("base64"),
        encoding: "base64",
      })
      return { path: f.path, sha: blob.data.sha }
    }),
  )

  // Create tree (no base_tree → full replacement; matches "single squash" UX).
  const tree = await octokit.rest.git.createTree({
    owner,
    repo,
    tree: blobs.map((b) => ({
      path: b.path,
      mode: "100644",
      type: "blob",
      sha: b.sha,
    })),
  })

  // Create commit.
  const commit = await octokit.rest.git.createCommit({
    owner,
    repo,
    message,
    tree: tree.data.sha,
    parents: parentSha ? [parentSha] : [],
  })

  // Update or create ref.
  try {
    await octokit.rest.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: commit.data.sha,
      force: false,
    })
  } catch {
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branch}`,
      sha: commit.data.sha,
    })
  }

  const repoData = await octokit.rest.repos.get({ owner, repo })
  return {
    commitSha: commit.data.sha,
    htmlUrl: `${repoData.data.html_url}/tree/${branch}`,
    branch,
  }
}
