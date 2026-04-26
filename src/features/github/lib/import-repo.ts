/**
 * GitHub repo → Polaris project import. Authority: sub-plan 06 Task 9.
 *
 * Walks the default-branch tree via Octokit, fetches each blob, and writes
 * each file into the project's files_by_path. Skips binaries (we don't render
 * them in the editor). Caps total imported size at 10 MB to keep Convex
 * documents reasonable.
 */

import type { Octokit } from "octokit"

export interface ImportFileRecord {
  path: string
  content: string
  encoding: "utf8"
}

export interface ImportProgress {
  total: number
  fetched: number
}

export interface ImportRepoOptions {
  owner: string
  repo: string
  /** Override the default branch lookup (e.g. "main" or "master"). */
  ref?: string
  /** Hard cap on total bytes imported. Default 10 MB. */
  maxTotalBytes?: number
  /** Called after each file fetch for progress UI. */
  onProgress?: (p: ImportProgress) => void
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024

const SKIP_PATHS = new Set([".git", "node_modules", ".next", "dist", "build"])

const BINARY_EXT = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "tiff", "pdf",
  "zip", "tar", "gz", "tgz", "rar", "7z", "wasm",
  "mp4", "mov", "mp3", "wav", "ogg",
  "ttf", "otf", "woff", "woff2", "eot", "exe", "dll", "so", "dylib",
])

function isBinaryPath(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase()
  return ext ? BINARY_EXT.has(ext) : false
}

function isSkippedPath(path: string): boolean {
  return path.split("/").some((seg) => SKIP_PATHS.has(seg))
}

export async function importRepoFiles(
  octokit: Octokit,
  opts: ImportRepoOptions,
): Promise<ImportFileRecord[]> {
  const { owner, repo, onProgress } = opts
  const maxBytes = opts.maxTotalBytes ?? DEFAULT_MAX_BYTES

  // Resolve ref → commit sha → tree sha (recursive).
  const ref =
    opts.ref ??
    (await octokit.rest.repos.get({ owner, repo })).data.default_branch
  const refData = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${ref}`,
  })
  const commitSha = refData.data.object.sha
  const commit = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: commitSha,
  })
  const treeSha = commit.data.tree.sha
  const tree = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: treeSha,
    recursive: "true",
  })

  interface TreeNode {
    type?: string
    path?: string
    sha?: string
  }
  const candidates = ((tree.data.tree ?? []) as TreeNode[]).filter(
    (node: TreeNode) =>
      node.type === "blob" &&
      !!node.path &&
      !isSkippedPath(node.path) &&
      !isBinaryPath(node.path),
  )

  const out: ImportFileRecord[] = []
  let totalBytes = 0
  let fetched = 0
  const total = candidates.length

  for (const node of candidates) {
    if (!node.sha || !node.path) continue
    if (totalBytes >= maxBytes) break
    const blob = await octokit.rest.git.getBlob({
      owner,
      repo,
      file_sha: node.sha,
    })
    if (blob.data.encoding !== "base64") {
      continue
    }
    const buf = Buffer.from(blob.data.content, "base64")
    if (totalBytes + buf.length > maxBytes) continue
    totalBytes += buf.length
    out.push({
      path: node.path,
      content: buf.toString("utf8"),
      encoding: "utf8",
    })
    fetched += 1
    onProgress?.({ total, fetched })
  }
  return out
}
