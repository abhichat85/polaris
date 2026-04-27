import { inngest } from "@/inngest/client";
import { Id } from "../../../../convex/_generated/dataModel";
import { NonRetriableError } from "inngest";
import { convex } from "@/lib/convex-client";
import { api } from "../../../../convex/_generated/api";
import { runCodeAgent } from "@/lib/agents";
// Legacy types — being replaced by ModelAdapter (sub-plan 01 / Article XIX migration).
import { AgentContext, ConversationMessage, ToolCallEvent } from "@/lib/agents/legacy-types";

interface MessageEvent {
  messageId: Id<"messages">;
  conversationId: Id<"conversations">;
  projectId: Id<"projects">;
}

export const processMessage = inngest.createFunction(
  {
    id: "process-message",
    cancelOn: [
      {
        event: "message/cancel",
        if: "event.data.messageId == async.data.messageId",
      },
    ],
    onFailure: async ({ event, step }) => {
      const { messageId } = event.data.event.data as MessageEvent;
      const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY;

      // Constitution §2.6 — surface honest, contextual failure messages.
      // The Inngest failure envelope wraps the original error on
      // `event.data.error`; pass it through with a name so the user can
      // decide whether to retry or reword.
      const rawError = (event.data as { error?: unknown }).error;
      const errorMessage =
        rawError instanceof Error
          ? rawError.message
          : typeof rawError === "string"
            ? rawError
            : "unknown error";

      if (internalKey) {
        await step.run("update-message-on-failure", async () => {
          await convex.mutation(api.system.updateMessageContent, {
            internalKey,
            messageId,
            content: `Model request failed: ${errorMessage}. Please try again or rephrase the request.`,
          });
        });
      }
    },
  },
  {
    event: "message/sent",
  },
  async ({ event, step }) => {
    const { messageId, conversationId, projectId } = event.data as MessageEvent;

    const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY;

    if (!internalKey) {
      throw new NonRetriableError("POLARIS_CONVEX_INTERNAL_KEY is not configured");
    }

    // Step 1: Get conversation history
    const conversationHistory = await step.run("get-conversation-history", async () => {
      const messages = await convex.query(api.system.getConversationMessages, {
        internalKey,
        conversationId,
      });

      // Convert to agent format, exclude the current processing message
      const history: ConversationMessage[] = messages
        .filter((m) => m._id !== messageId && m.content.trim() !== "")
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      return history;
    });

    // Step 2: Run the AI agent
    const agentResult = await step.run("run-code-agent", async () => {
      const context: AgentContext = {
        projectId,
        conversationId,
        messageId,
        userId: "", // Will be populated from auth in production
      };

      // Track tool calls for UI updates
      const toolCalls: ToolCallEvent[] = [];

      const result = await runCodeAgent({
        context,
        messages: conversationHistory,
        internalKey,
        onStreamingUpdate: async (content) => {
          // Update streaming content in real-time
          await convex.mutation(api.system.updateStreamingContent, {
            internalKey,
            messageId,
            streamingContent: content,
          });
        },
        onToolCall: async (event) => {
          toolCalls.push(event);
          // Could also update tool calls in Convex here for UI
        },
      });

      return {
        content: result.content,
        fileOperations: result.fileOperations,
        toolCalls,
      };
    });

    // Step 3: Finalize the message
    await step.run("finalize-message", async () => {
      await convex.mutation(api.system.updateMessageContent, {
        internalKey,
        messageId,
        content: agentResult.content || "I've completed the task.",
      });
    });

    return {
      success: true,
      messageId,
      fileOperationsCount: agentResult.fileOperations.length,
      toolCallsCount: agentResult.toolCalls.length,
    };
  }
);
