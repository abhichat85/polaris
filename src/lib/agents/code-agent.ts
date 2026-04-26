/**
 * Code Agent using Claude Agent SDK
 * Handles code generation, file manipulation, and project understanding
 */

import Anthropic from "@anthropic-ai/sdk";
import { convex } from "@/lib/convex-client";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
    AgentContext,
    AgentResponse,
    FileOperation,
    ConversationMessage,
    ToolCallEvent
} from "./legacy-types";
import { CODE_AGENT_SYSTEM_PROMPT } from "./prompts";

const anthropic = new Anthropic();

/**
 * Tool definitions for Claude
 */
const tools: Anthropic.Tool[] = [
    {
        name: "read_file",
        description: "Read the contents of a file by its path. Returns the file content as a string.",
        input_schema: {
            type: "object" as const,
            properties: {
                path: {
                    type: "string",
                    description: "The file path relative to project root (e.g., 'src/components/Button.tsx')",
                },
            },
            required: ["path"],
        },
    },
    {
        name: "write_file",
        description: "Update the contents of an existing file. The file must already exist.",
        input_schema: {
            type: "object" as const,
            properties: {
                path: {
                    type: "string",
                    description: "The file path relative to project root",
                },
                content: {
                    type: "string",
                    description: "The new content for the file",
                },
            },
            required: ["path", "content"],
        },
    },
    {
        name: "create_file",
        description: "Create a new file with the given content. Creates parent directories if needed.",
        input_schema: {
            type: "object" as const,
            properties: {
                path: {
                    type: "string",
                    description: "The file path relative to project root",
                },
                content: {
                    type: "string",
                    description: "The content for the new file",
                },
            },
            required: ["path", "content"],
        },
    },
    {
        name: "create_folder",
        description: "Create a new folder.",
        input_schema: {
            type: "object" as const,
            properties: {
                path: {
                    type: "string",
                    description: "The folder path relative to project root",
                },
            },
            required: ["path"],
        },
    },
    {
        name: "delete_file",
        description: "Delete a file or folder. If a folder, deletes all contents recursively.",
        input_schema: {
            type: "object" as const,
            properties: {
                path: {
                    type: "string",
                    description: "The file/folder path relative to project root",
                },
            },
            required: ["path"],
        },
    },
    {
        name: "list_directory",
        description: "List the contents of a directory. Returns file names and types.",
        input_schema: {
            type: "object" as const,
            properties: {
                path: {
                    type: "string",
                    description: "The directory path relative to project root. Use empty string for root.",
                },
            },
            required: ["path"],
        },
    },
    {
        name: "search_files",
        description: "Search for text content across all files in the project.",
        input_schema: {
            type: "object" as const,
            properties: {
                query: {
                    type: "string",
                    description: "The text to search for",
                },
            },
            required: ["query"],
        },
    },
];

interface ToolInput {
    path?: string;
    content?: string;
    query?: string;
}

/**
 * Execute a tool call against the Convex backend
 */
async function executeToolCall(
    context: AgentContext,
    toolName: string,
    toolInput: ToolInput,
    internalKey: string
): Promise<{ result: unknown; fileOperation?: FileOperation }> {
    const { projectId } = context;

    switch (toolName) {
        case "read_file": {
            const file = await convex.query(api.system.findFileByPath, {
                internalKey,
                projectId,
                path: toolInput.path!,
            });

            if (!file) {
                return { result: { error: `File not found: ${toolInput.path}` } };
            }

            return {
                result: { content: file.content ?? "(binary file)" },
                fileOperation: { type: "read", path: toolInput.path! }
            };
        }

        case "write_file": {
            const file = await convex.query(api.system.findFileByPath, {
                internalKey,
                projectId,
                path: toolInput.path!,
            });

            if (!file) {
                return { result: { error: `File not found: ${toolInput.path}` } };
            }

            await convex.mutation(api.system.updateFileContent, {
                internalKey,
                fileId: file._id,
                content: toolInput.content!,
            });

            return {
                result: { success: true, message: `Updated ${toolInput.path}` },
                fileOperation: { type: "update", path: toolInput.path!, fileId: file._id, content: toolInput.content }
            };
        }

        case "create_file": {
            // Parse path to get parent folder and filename
            const pathParts = toolInput.path!.split("/").filter(Boolean);
            const fileName = pathParts.pop()!;

            // Find or create parent folders
            let parentId: Id<"files"> | undefined = undefined;

            for (const folderName of pathParts) {
                const existingFolder = await findOrCreateFolder(
                    projectId,
                    parentId,
                    folderName,
                    internalKey
                );
                parentId = existingFolder;
            }

            const fileId = await convex.mutation(api.system.createFileInternal, {
                internalKey,
                projectId,
                parentId,
                name: fileName,
                content: toolInput.content!,
            });

            return {
                result: { success: true, message: `Created ${toolInput.path}` },
                fileOperation: { type: "create", path: toolInput.path!, fileId, content: toolInput.content }
            };
        }

        case "create_folder": {
            const pathParts = toolInput.path!.split("/").filter(Boolean);
            let parentId: Id<"files"> | undefined = undefined;

            for (const folderName of pathParts) {
                parentId = await findOrCreateFolder(projectId, parentId, folderName, internalKey);
            }

            return {
                result: { success: true, message: `Created folder ${toolInput.path}` },
                fileOperation: { type: "create", path: toolInput.path! }
            };
        }

        case "delete_file": {
            const file = await convex.query(api.system.findFileByPath, {
                internalKey,
                projectId,
                path: toolInput.path!,
            });

            if (!file) {
                return { result: { error: `File not found: ${toolInput.path}` } };
            }

            await convex.mutation(api.system.deleteFileInternal, {
                internalKey,
                fileId: file._id,
            });

            return {
                result: { success: true, message: `Deleted ${toolInput.path}` },
                fileOperation: { type: "delete", path: toolInput.path!, fileId: file._id }
            };
        }

        case "list_directory": {
            let parentId: Id<"files"> | undefined = undefined;

            if (toolInput.path && toolInput.path !== "") {
                const folder = await convex.query(api.system.findFileByPath, {
                    internalKey,
                    projectId,
                    path: toolInput.path,
                });

                if (!folder) {
                    return { result: { error: `Directory not found: ${toolInput.path}` } };
                }

                parentId = folder._id;
            }

            const files = await convex.query(api.system.listDirectoryInternal, {
                internalKey,
                projectId,
                parentId,
            });

            return {
                result: {
                    files: files.map((f) => ({
                        name: f.name,
                        type: f.type,
                    })),
                },
            };
        }

        case "search_files": {
            const matches = await convex.query(api.system.searchFilesInternal, {
                internalKey,
                projectId,
                query: toolInput.query!,
            });

            return {
                result: {
                    matches: matches.map((m) => ({
                        file: m.name,
                        snippet: m.snippet,
                    })),
                },
            };
        }

        default:
            return { result: { error: `Unknown tool: ${toolName}` } };
    }
}

/**
 * Helper to find or create a folder
 */
async function findOrCreateFolder(
    projectId: Id<"projects">,
    parentId: Id<"files"> | undefined,
    name: string,
    internalKey: string
): Promise<Id<"files">> {
    const files = await convex.query(api.system.listDirectoryInternal, {
        internalKey,
        projectId,
        parentId,
    });

    const existing = files.find((f) => f.name === name && f.type === "folder");
    if (existing) {
        return existing._id;
    }

    return await convex.mutation(api.system.createFolderInternal, {
        internalKey,
        projectId,
        parentId,
        name,
    });
}

interface RunAgentOptions {
    context: AgentContext;
    messages: ConversationMessage[];
    internalKey: string;
    onStreamingUpdate?: (content: string) => Promise<void>;
    onToolCall?: (event: ToolCallEvent) => Promise<void>;
}

/**
 * Run the code agent with the given context and messages
 */
export async function runCodeAgent({
    context,
    messages,
    internalKey,
    onStreamingUpdate,
    onToolCall,
}: RunAgentOptions): Promise<AgentResponse> {
    const fileOperations: FileOperation[] = [];
    let fullContent = "";

    // Get project context for the system prompt
    const project = await convex.query(api.system.getProjectById, {
        internalKey,
        projectId: context.projectId,
    });

    const fileTree = await convex.query(api.system.getProjectFileTree, {
        internalKey,
        projectId: context.projectId,
    });

    // Build enhanced system prompt with project context
    const projectContext = `
## Current Project: ${project?.name ?? "Untitled"}

### File Structure:
\`\`\`
${formatFileTree(fileTree)}
\`\`\`
`;

    const systemPrompt = CODE_AGENT_SYSTEM_PROMPT + "\n\n" + projectContext;

    // Convert messages to Anthropic format
    const anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
    }));

    // Run the agent loop
    let response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        system: systemPrompt,
        tools,
        messages: anthropicMessages,
    });

    // Process response and handle tool calls
    while (response.stop_reason === "tool_use") {
        const toolUseBlocks = response.content.filter(
            (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
        );

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
            // Notify about tool call start
            if (onToolCall) {
                await onToolCall({
                    id: toolUse.id,
                    name: toolUse.name,
                    args: toolUse.input as Record<string, unknown>,
                    status: "running",
                    timestamp: Date.now(),
                });
            }

            // Execute the tool
            const { result, fileOperation } = await executeToolCall(
                context,
                toolUse.name,
                toolUse.input as ToolInput,
                internalKey
            );

            if (fileOperation) {
                fileOperations.push(fileOperation);
            }

            // Notify about tool call completion
            if (onToolCall) {
                await onToolCall({
                    id: toolUse.id,
                    name: toolUse.name,
                    args: toolUse.input as Record<string, unknown>,
                    status: "completed",
                    result,
                    timestamp: Date.now(),
                });
            }

            toolResults.push({
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: JSON.stringify(result),
            });
        }

        // Get text content so far
        const textBlocks = response.content.filter(
            (block): block is Anthropic.TextBlock => block.type === "text"
        );

        for (const block of textBlocks) {
            fullContent += block.text;
        }

        if (onStreamingUpdate && fullContent) {
            await onStreamingUpdate(fullContent);
        }

        // Continue the conversation with tool results
        anthropicMessages.push({
            role: "assistant",
            content: response.content,
        });

        anthropicMessages.push({
            role: "user",
            content: toolResults,
        });

        response = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 8192,
            system: systemPrompt,
            tools,
            messages: anthropicMessages,
        });
    }

    // Extract final text content
    const finalTextBlocks = response.content.filter(
        (block): block is Anthropic.TextBlock => block.type === "text"
    );

    for (const block of finalTextBlocks) {
        fullContent += block.text;
    }

    return {
        content: fullContent,
        fileOperations,
    };
}

/**
 * Format file tree for display in system prompt
 */
function formatFileTree(
    nodes: Array<{ name: string; type: string; path: string; children?: unknown[] }>,
    indent = ""
): string {
    let result = "";

    for (const node of nodes) {
        const icon = node.type === "folder" ? "📁" : "📄";
        result += `${indent}${icon} ${node.name}\n`;

        if (node.children && Array.isArray(node.children)) {
            result += formatFileTree(
                node.children as Array<{ name: string; type: string; path: string; children?: unknown[] }>,
                indent + "  "
            );
        }
    }

    return result;
}
