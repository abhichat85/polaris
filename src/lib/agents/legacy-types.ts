/**
 * Core types for JonaAI agent system
 * Used by Claude Agent SDK and Inngest orchestration
 */

import { Id } from "../../../convex/_generated/dataModel";

/**
 * Context passed to agent during execution
 */
export interface AgentContext {
  projectId: Id<"projects">;
  conversationId: Id<"conversations">;
  messageId: Id<"messages">;
  userId: string;
}

/**
 * Represents a file operation performed by the agent
 */
export interface FileOperation {
  type: "create" | "update" | "delete" | "read";
  path: string;
  fileId?: Id<"files">;
  content?: string;
}

/**
 * Response from agent execution
 */
export interface AgentResponse {
  content: string;
  fileOperations: FileOperation[];
  thinking?: string;
  error?: string;
}

/**
 * Tool call event for real-time UI updates
 */
export interface ToolCallEvent {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: "running" | "completed" | "error";
  result?: unknown;
  error?: string;
  timestamp: number;
}

/**
 * File tree node for project context
 */
export interface FileTreeNode {
  id: Id<"files">;
  name: string;
  type: "file" | "folder";
  path: string;
  children?: FileTreeNode[];
}

/**
 * Project context provided to agent
 */
export interface ProjectContext {
  projectId: Id<"projects">;
  projectName: string;
  fileTree: FileTreeNode[];
  relevantFiles: Array<{
    path: string;
    content: string;
  }>;
}

/**
 * Message in conversation history
 */
export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Streaming update event
 */
export interface StreamingEvent {
  type: "text" | "tool_start" | "tool_end" | "error";
  content?: string;
  toolCall?: ToolCallEvent;
}
