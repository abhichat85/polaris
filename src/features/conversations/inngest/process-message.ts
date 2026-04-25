import { inngest } from "@/inngest/client";
import { Id } from "../../../../convex/_generated/dataModel";
import { NonRetriableError } from "inngest";
import { convex } from "@/lib/convex-client";
import { api } from "../../../../convex/_generated/api";
import { runCodeAgent } from "@/lib/agents";
import { AgentContext, ConversationMessage, ToolCallEvent } from "@/lib/agents/types";

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

      // Update the message with error content
      if (internalKey) {
        await step.run("update-message-on-failure", async () => {
          await convex.mutation(api.system.updateMessageContent, {
            internalKey,
            messageId,
            content:
              "My apologies, I encountered an error while processing your request. Let me know if you need anything else!",
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
