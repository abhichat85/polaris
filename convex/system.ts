import { v } from "convex/values";

import { mutation, query } from "./_generated/server";

const validateInternalKey = (key: string) => {
  const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY;

  if (!internalKey) {
    throw new Error("POLARIS_CONVEX_INTERNAL_KEY is not configured");
  }

  if (key !== internalKey) {
    throw new Error("Invalid internal key");
  }
};

export const getConversationById = query({
  args: {
    conversationId: v.id("conversations"),
    internalKey: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    return await ctx.db.get(args.conversationId);
  },
});

export const createMessage = mutation({
  args: {
    internalKey: v.string(),
    conversationId: v.id("conversations"),
    projectId: v.id("projects"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    status: v.optional(
      v.union(
        v.literal("processing"),
        v.literal("completed"),
        v.literal("cancelled")
      )
    ),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      projectId: args.projectId,
      role: args.role,
      content: args.content,
      status: args.status,
    });

    // Update conversation's updatedAt
    await ctx.db.patch(args.conversationId, {
      updatedAt: Date.now(),
    });

    return messageId;
  },
});

export const updateMessageContent = mutation({
  args: {
    internalKey: v.string(),
    messageId: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    await ctx.db.patch(args.messageId, {
      content: args.content,
      status: "completed" as const,
    });
  },
});

// ============================================================================
// Streaming & Real-time Updates
// ============================================================================

export const updateStreamingContent = mutation({
  args: {
    internalKey: v.string(),
    messageId: v.id("messages"),
    streamingContent: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    await ctx.db.patch(args.messageId, {
      streamingContent: args.streamingContent,
    });
  },
});

export const cancelMessage = mutation({
  args: {
    internalKey: v.string(),
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    await ctx.db.patch(args.messageId, {
      status: "cancelled" as const,
      content: "Message cancelled by user.",
    });
  },
});

export const getConversationMessages = query({
  args: {
    internalKey: v.string(),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    return await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("asc")
      .collect();
  },
});

// ============================================================================
// File Operations for Agent
// ============================================================================

export const getFileById = query({
  args: {
    internalKey: v.string(),
    fileId: v.id("files"),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    return await ctx.db.get(args.fileId);
  },
});

export const updateFileContent = mutation({
  args: {
    internalKey: v.string(),
    fileId: v.id("files"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const file = await ctx.db.get(args.fileId);
    if (!file) throw new Error("File not found");

    await ctx.db.patch(args.fileId, {
      content: args.content,
      updatedAt: Date.now(),
    });

    await ctx.db.patch(file.projectId, {
      updatedAt: Date.now(),
    });
  },
});

export const generateUploadUrl = mutation({
  args: {
    internalKey: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);
    return await ctx.storage.generateUploadUrl();
  },
});

export const createFileInternal = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    parentId: v.optional(v.id("files")),
    name: v.string(),
    content: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const now = Date.now();

    const fileId = await ctx.db.insert("files", {
      projectId: args.projectId,
      parentId: args.parentId,
      name: args.name,
      content: args.content ?? "",
      storageId: args.storageId,
      type: "file",
      updatedAt: now,
    });

    await ctx.db.patch(args.projectId, { updatedAt: now });

    return fileId;
  },
});

export const createFolderInternal = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    parentId: v.optional(v.id("files")),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const now = Date.now();

    const folderId = await ctx.db.insert("files", {
      projectId: args.projectId,
      parentId: args.parentId,
      name: args.name,
      type: "folder",
      updatedAt: now,
    });

    await ctx.db.patch(args.projectId, { updatedAt: now });

    return folderId;
  },
});

export const deleteFileInternal = mutation({
  args: {
    internalKey: v.string(),
    fileId: v.id("files"),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const file = await ctx.db.get(args.fileId);
    if (!file) throw new Error("File not found");

    // Recursively delete children if folder
    const deleteRecursive = async (fileId: typeof args.fileId) => {
      const item = await ctx.db.get(fileId);
      if (!item) return;

      if (item.type === "folder") {
        const children = await ctx.db
          .query("files")
          .withIndex("by_project_parent", (q) =>
            q.eq("projectId", item.projectId).eq("parentId", fileId)
          )
          .collect();

        for (const child of children) {
          await deleteRecursive(child._id);
        }
      }

      if (item.storageId) {
        await ctx.storage.delete(item.storageId);
      }

      await ctx.db.delete(fileId);
    };

    await deleteRecursive(args.fileId);
    await ctx.db.patch(file.projectId, { updatedAt: Date.now() });
  },
});

export const listDirectoryInternal = query({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    parentId: v.optional(v.id("files")),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const files = await ctx.db
      .query("files")
      .withIndex("by_project_parent", (q) =>
        q.eq("projectId", args.projectId).eq("parentId", args.parentId)
      )
      .collect();

    return files.sort((a, b) => {
      if (a.type === "folder" && b.type === "file") return -1;
      if (a.type === "file" && b.type === "folder") return 1;
      return a.name.localeCompare(b.name);
    });
  },
});

export const searchFilesInternal = query({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    query: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const allFiles = await ctx.db
      .query("files")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const matches: Array<{
      fileId: typeof args.projectId extends never ? never : (typeof allFiles)[0]["_id"];
      name: string;
      snippet: string;
    }> = [];

    const searchLower = args.query.toLowerCase();

    for (const file of allFiles) {
      if (file.type !== "file" || !file.content) continue;

      const contentLower = file.content.toLowerCase();
      const index = contentLower.indexOf(searchLower);

      if (index !== -1) {
        const start = Math.max(0, index - 50);
        const end = Math.min(file.content.length, index + args.query.length + 50);
        const snippet = file.content.slice(start, end);

        matches.push({
          fileId: file._id,
          name: file.name,
          snippet: (start > 0 ? "..." : "") + snippet + (end < file.content.length ? "..." : ""),
        });
      }
    }

    return matches.slice(0, 20); // Limit results
  },
});

export const getProjectFileTree = query({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const allFiles = await ctx.db
      .query("files")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    // Build tree structure
    type FileNode = {
      id: string;
      name: string;
      type: "file" | "folder";
      path: string;
      children?: FileNode[];
    };

    const fileMap = new Map<string | undefined, typeof allFiles>();

    for (const file of allFiles) {
      const parentKey = file.parentId ?? undefined;
      if (!fileMap.has(parentKey)) {
        fileMap.set(parentKey, []);
      }
      fileMap.get(parentKey)!.push(file);
    }

    const buildTree = (parentId: string | undefined, basePath: string): FileNode[] => {
      const children = fileMap.get(parentId) ?? [];
      return children
        .sort((a, b) => {
          if (a.type === "folder" && b.type === "file") return -1;
          if (a.type === "file" && b.type === "folder") return 1;
          return a.name.localeCompare(b.name);
        })
        .map((file) => ({
          id: file._id,
          name: file.name,
          type: file.type,
          path: basePath ? `${basePath}/${file.name}` : file.name,
          children: file.type === "folder"
            ? buildTree(file._id, basePath ? `${basePath}/${file.name}` : file.name)
            : undefined,
        }));
    };

    return buildTree(undefined, "");
  },
});

export const findFileByPath = query({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    path: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const pathParts = args.path.split("/").filter(Boolean);

    let currentParentId: string | undefined = undefined;

    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      const isLast = i === pathParts.length - 1;

      const files = await ctx.db
        .query("files")
        .withIndex("by_project_parent", (q) =>
          q.eq("projectId", args.projectId).eq("parentId", currentParentId as any)
        )
        .collect();

      const found = files.find((f) => f.name === part);

      if (!found) {
        return null;
      }

      if (isLast) {
        return found;
      }

      if (found.type !== "folder") {
        return null; // Path continues but hit a file
      }

      currentParentId = found._id;
    }

    return null;
  },
});

export const getProjectById = query({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    return await ctx.db.get(args.projectId);
  },
});

export const updateExportStatus = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    status: v.union(
      v.literal("exporting"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    repoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    await ctx.db.patch(args.projectId, {
      exportStatus: args.status,
      exportRepoUrl: args.repoUrl,
    });
  },
});

export const getProjectFilesInternal = query({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    return await ctx.db
      .query("files")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

/**
 * Client-facing authenticated read. Verifies the caller is signed in via
 * Clerk + owns the project, then returns the file list. No internalKey
 * needed — never expose that secret to the browser.
 */
export const getProjectFiles = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("unauthorized");

    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("project_not_found");
    if (project.ownerId !== identity.subject) throw new Error("forbidden");

    return await ctx.db
      .query("files")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const createProjectInternal = mutation({
  args: {
    internalKey: v.string(),
    name: v.string(),
    ownerId: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const now = Date.now();

    const projectId = await ctx.db.insert("projects", {
      name: args.name,
      ownerId: args.ownerId,
      updatedAt: now,
    });

    return projectId;
  },
});