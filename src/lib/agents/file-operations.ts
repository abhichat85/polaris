/**
 * Custom MCP tools for file operations
 * These tools wrap Convex mutations to allow agent file manipulation
 */

import { convex } from "@/lib/convex-client";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { FileTreeNode, AgentContext } from "./types";

/**
 * Read file content by file ID
 */
export async function readFile(
    context: AgentContext,
    fileId: Id<"files">,
    internalKey: string
): Promise<{ success: boolean; content?: string; error?: string }> {
    try {
        const file = await convex.query(api.system.getFileById, {
            internalKey,
            fileId,
        });

        if (!file) {
            return { success: false, error: "File not found" };
        }

        if (file.type === "folder") {
            return { success: false, error: "Cannot read folder content" };
        }

        return { success: true, content: file.content ?? "" };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to read file"
        };
    }
}

/**
 * Write content to an existing file
 */
export async function writeFile(
    context: AgentContext,
    fileId: Id<"files">,
    content: string,
    internalKey: string
): Promise<{ success: boolean; error?: string }> {
    try {
        await convex.mutation(api.system.updateFileContent, {
            internalKey,
            fileId,
            content,
        });

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to write file"
        };
    }
}

/**
 * Create a new file
 */
export async function createFile(
    context: AgentContext,
    name: string,
    content: string,
    parentId: Id<"files"> | undefined,
    internalKey: string
): Promise<{ success: boolean; fileId?: Id<"files">; error?: string }> {
    try {
        const fileId = await convex.mutation(api.system.createFileInternal, {
            internalKey,
            projectId: context.projectId,
            parentId,
            name,
            content,
        });

        return { success: true, fileId };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to create file"
        };
    }
}

/**
 * Create a new folder
 */
export async function createFolder(
    context: AgentContext,
    name: string,
    parentId: Id<"files"> | undefined,
    internalKey: string
): Promise<{ success: boolean; folderId?: Id<"files">; error?: string }> {
    try {
        const folderId = await convex.mutation(api.system.createFolderInternal, {
            internalKey,
            projectId: context.projectId,
            parentId,
            name,
        });

        return { success: true, folderId };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to create folder"
        };
    }
}

/**
 * Delete a file or folder
 */
export async function deleteFile(
    context: AgentContext,
    fileId: Id<"files">,
    internalKey: string
): Promise<{ success: boolean; error?: string }> {
    try {
        await convex.mutation(api.system.deleteFileInternal, {
            internalKey,
            fileId,
        });

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to delete file"
        };
    }
}

/**
 * List directory contents
 */
export async function listDirectory(
    context: AgentContext,
    parentId: Id<"files"> | undefined,
    internalKey: string
): Promise<{ success: boolean; files?: FileTreeNode[]; error?: string }> {
    try {
        const files = await convex.query(api.system.listDirectoryInternal, {
            internalKey,
            projectId: context.projectId,
            parentId,
        });

        const nodes: FileTreeNode[] = files.map((file) => ({
            id: file._id,
            name: file.name,
            type: file.type,
            path: file.name, // Will be resolved with full path
        }));

        return { success: true, files: nodes };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to list directory"
        };
    }
}

/**
 * Search files by content (grep-like)
 */
export async function searchFiles(
    context: AgentContext,
    query: string,
    internalKey: string
): Promise<{
    success: boolean;
    matches?: Array<{ fileId: Id<"files">; name: string; snippet: string }>;
    error?: string
}> {
    try {
        const matches = await convex.query(api.system.searchFilesInternal, {
            internalKey,
            projectId: context.projectId,
            query,
        });

        return { success: true, matches };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to search files"
        };
    }
}

/**
 * Get full project file tree
 */
export async function getProjectFileTree(
    context: AgentContext,
    internalKey: string
): Promise<{ success: boolean; fileTree?: FileTreeNode[]; error?: string }> {
    try {
        const fileTree = await convex.query(api.system.getProjectFileTree, {
            internalKey,
            projectId: context.projectId,
        });

        return { success: true, fileTree: fileTree as FileTreeNode[] };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to get file tree"
        };
    }
}

/**
 * Find file by path (e.g., "src/components/Button.tsx")
 */
export async function findFileByPath(
    context: AgentContext,
    path: string,
    internalKey: string
): Promise<{
    success: boolean;
    fileId?: Id<"files">;
    file?: { name: string; type: "file" | "folder"; content?: string };
    error?: string
}> {
    try {
        const result = await convex.query(api.system.findFileByPath, {
            internalKey,
            projectId: context.projectId,
            path,
        });

        if (!result) {
            return { success: false, error: `File not found: ${path}` };
        }

        return {
            success: true,
            fileId: result._id,
            file: {
                name: result.name,
                type: result.type,
                content: result.content,
            }
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to find file"
        };
    }
}
