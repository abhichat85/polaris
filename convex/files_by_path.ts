/**
 * Flat-path file CRUD. Authority: CONSTITUTION §10 (Convex source of truth),
 * sub-plan 01 Task 12.
 *
 * Backs the production ConvexFileService. Falls back to walking the legacy tree
 * structure (`parentId` + `name`) when a file lacks the new `path` column —
 * keeps existing rows readable during the flat-path migration.
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"

function normalize(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path
}

async function findByPath(
  ctx: { db: { query: (...a: unknown[]) => unknown } },
  projectId: Id<"projects">,
  path: string,
): Promise<Doc<"files"> | null> {
  const p = normalize(path)
  // Indexed lookup first.
  const indexed = (await (ctx.db as never as ReturnType<typeof getDb>)
    .query("files")
    .withIndex("by_project_path", (q) => q.eq("projectId", projectId).eq("path", p))
    .first()) as Doc<"files"> | null
  if (indexed) return indexed

  // Fallback: walk tree by name segments. Only used until backfill completes.
  return walkTree(ctx as never, projectId, p)
}

// Convex's TS types make ctx.db hard to type without _generated. The casts below
// are isolated to this helper module — production callers see a clean API.
type DbHandle = ReturnType<typeof getDb>
function getDb(ctx: { db: unknown }) {
  return ctx.db as never as {
    query: (table: string) => {
      withIndex: (
        idx: string,
        cb: (q: { eq: (k: string, v: unknown) => unknown }) => unknown,
      ) => { first: () => Promise<unknown>; collect: () => Promise<unknown[]> }
    }
    insert: (table: string, data: Record<string, unknown>) => Promise<Id<"files">>
    patch: (id: Id<"files">, data: Record<string, unknown>) => Promise<void>
    delete: (id: Id<"files">) => Promise<void>
  }
}

async function walkTree(
  ctx: { db: unknown },
  projectId: Id<"projects">,
  path: string,
): Promise<Doc<"files"> | null> {
  const segments = path.split("/").filter(Boolean)
  if (segments.length === 0) return null
  let parentId: Id<"files"> | undefined = undefined
  let cur: Doc<"files"> | null = null
  const db = getDb(ctx)
  for (const seg of segments) {
    const matches = (await db
      .query("files")
      .withIndex("by_project_parent", (q) => q.eq("projectId", projectId).eq("parentId", parentId))
      .collect()) as Doc<"files">[]
    cur = matches.find((m) => m.name === seg) ?? null
    if (!cur) return null
    parentId = cur._id
  }
  return cur
}

// ── Public Convex functions ──────────────────────────────────────────────────

export const readPath = query({
  args: { projectId: v.id("projects"), path: v.string() },
  handler: async (ctx, args) => {
    const file = await findByPath(ctx, args.projectId, args.path)
    if (!file || file.type !== "file") return null
    return {
      path: file.path ?? args.path,
      content: file.content ?? "",
      updatedAt: file.updatedAt,
      updatedBy: file.updatedBy ?? "user",
    }
  },
})

export const writePath = mutation({
  args: {
    projectId: v.id("projects"),
    path: v.string(),
    content: v.string(),
    updatedBy: v.union(
      v.literal("user"),
      v.literal("agent"),
      v.literal("scaffold"),
      v.literal("import"),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await findByPath(ctx, args.projectId, args.path)
    if (!existing || existing.type !== "file") {
      throw new Error(`File not found: ${args.path}`)
    }
    const db = getDb(ctx)
    await db.patch(existing._id, {
      content: args.content,
      path: normalize(args.path),
      updatedAt: Date.now(),
      updatedBy: args.updatedBy,
    })
  },
})

export const createPath = mutation({
  args: {
    projectId: v.id("projects"),
    path: v.string(),
    content: v.string(),
    updatedBy: v.union(
      v.literal("user"),
      v.literal("agent"),
      v.literal("scaffold"),
      v.literal("import"),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await findByPath(ctx, args.projectId, args.path)
    if (existing) throw new Error(`File already exists: ${args.path}`)

    const path = normalize(args.path)
    const segments = path.split("/")
    const name = segments[segments.length - 1] ?? path

    const db = getDb(ctx)
    return await db.insert("files", {
      projectId: args.projectId,
      name,
      type: "file",
      content: args.content,
      path,
      updatedAt: Date.now(),
      updatedBy: args.updatedBy,
    })
  },
})

export const deletePath = mutation({
  args: { projectId: v.id("projects"), path: v.string() },
  handler: async (ctx, args) => {
    const existing = await findByPath(ctx, args.projectId, args.path)
    if (!existing) throw new Error(`File not found: ${args.path}`)
    const db = getDb(ctx)
    await db.delete(existing._id)
  },
})

/**
 * Bulk write — used by the scaffolder to land 30+ files in one mutation.
 * Authority: sub-plan 03 §10. Existing rows for the same paths are overwritten.
 */
export const writeMany = mutation({
  args: {
    projectId: v.id("projects"),
    files: v.array(
      v.object({
        path: v.string(),
        content: v.string(),
      }),
    ),
    updatedBy: v.union(
      v.literal("user"),
      v.literal("agent"),
      v.literal("scaffold"),
      v.literal("import"),
    ),
  },
  handler: async (ctx, args) => {
    const db = getDb(ctx)
    const now = Date.now()
    let created = 0
    let updated = 0
    for (const f of args.files) {
      const existing = await findByPath(ctx, args.projectId, f.path)
      const path = normalize(f.path)
      const segments = path.split("/")
      const name = segments[segments.length - 1] ?? path
      if (existing && existing.type === "file") {
        await db.patch(existing._id, {
          content: f.content,
          path,
          updatedAt: now,
          updatedBy: args.updatedBy,
        })
        updated++
      } else if (!existing) {
        await db.insert("files", {
          projectId: args.projectId,
          name,
          type: "file",
          content: f.content,
          path,
          updatedAt: now,
          updatedBy: args.updatedBy,
        })
        created++
      }
    }
    return { created, updated, total: args.files.length }
  },
})

export const listPath = query({
  args: { projectId: v.id("projects"), directory: v.string() },
  handler: async (ctx, args) => {
    const db = getDb(ctx)
    const all = (await db
      .query("files")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect()) as Doc<"files">[]

    const dir = normalize(args.directory)
    const prefix = dir === "" || dir === "/" ? "" : dir.endsWith("/") ? dir : dir + "/"

    const files: string[] = []
    const folders = new Set<string>()
    for (const f of all) {
      const path = f.path
      if (!path) continue
      if (!path.startsWith(prefix)) continue
      const rest = path.slice(prefix.length)
      if (!rest) continue
      const slash = rest.indexOf("/")
      if (slash === -1) {
        if (f.type === "file") files.push(path)
        else folders.add(path)
      } else {
        folders.add(prefix + rest.slice(0, slash))
      }
    }
    return { files, folders: Array.from(folders) }
  },
})
