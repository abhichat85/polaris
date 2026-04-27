import ky from "ky";
import { toast } from "sonner";

import { showQuotaBlocked } from "@/components/quota-blocked-toast";
import { useState } from "react";
import {
  CopyIcon,
  HistoryIcon,
  PlusIcon
} from "lucide-react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
  MessageProcessing,
  MessageFileChanges,
  type ToolCall,
  type FileChange,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { ThinkingBlock } from "@/components/ai-elements/thinking-block";

import {
  useConversation,
  useConversations,
  useCreateConversation,
  useMessages,
} from "../hooks/use-conversations";

import { ConversationsDialog } from "./conversations-dialog";

import { Id } from "../../../../convex/_generated/dataModel";
import { DEFAULT_CONVERSATION_TITLE } from "../../../../convex/constants";

interface ConversationSidebarProps {
  projectId: Id<"projects">;
};

export const ConversationSidebar = ({
  projectId,
}: ConversationSidebarProps) => {
  const [input, setInput] = useState("");
  const [
    selectedConversationId,
    setSelectedConversationId,
  ] = useState<Id<"conversations"> | null>(null);
  const [isConversationsDialogOpen, setIsConversationsDialogOpen] = useState(false);

  const createConversation = useCreateConversation();
  const conversations = useConversations(projectId);

  const activeConversationId =
    selectedConversationId ?? conversations?.[0]?._id ?? null;

  const activeConversation = useConversation(activeConversationId);
  const conversationMessages = useMessages(activeConversationId);

  // Check if any message is currently processing
  const isProcessing = conversationMessages?.some(
    (msg) => msg.status === "processing"
  );

  const handleCreateConversation = async () => {
    try {
      const newConversationId = await createConversation({
        projectId,
        title: DEFAULT_CONVERSATION_TITLE,
      });
      setSelectedConversationId(newConversationId);
      return newConversationId;
    } catch {
      toast.error("Unable to create new conversation");
      return null;
    }
  };

  // Get the currently processing message ID for cancellation
  const processingMessage = conversationMessages?.find(
    (msg) => msg.status === "processing"
  );

  const handleCancel = async () => {
    if (!processingMessage) return;

    try {
      await ky.post("/api/messages/cancel", {
        json: {
          messageId: processingMessage._id,
        },
      });
      toast.success("Message cancelled");
    } catch {
      toast.error("Failed to cancel message");
    }
  };

  const handleSubmit = async (message: PromptInputMessage) => {
    // If processing and no new message, this is just a stop function
    if (isProcessing && !message.text) {
      await handleCancel();
      setInput("");
      return;
    }

    let conversationId = activeConversationId;

    if (!conversationId) {
      conversationId = await handleCreateConversation();
      if (!conversationId) {
        return;
      }
    }

    // Trigger Inngest function via API
    try {
      await ky.post("/api/messages", {
        json: {
          conversationId,
          message: message.text,
        },
      });
    } catch (error) {
      // §17 quota gate returns 429 with structured payload; surface the
      // upgrade CTA instead of a generic "failed to send".
      if (
        error &&
        typeof error === "object" &&
        "response" in error &&
        error.response instanceof Response
      ) {
        const status = error.response.status;
        if (status === 429) {
          try {
            const body = await error.response.json();
            if (body?.error === "quota_exceeded") {
              showQuotaBlocked({
                reason: body.reason,
                current: body.current,
                limit: body.limit,
                upgradeUrl: body.upgradeUrl,
              });
              setInput("");
              return;
            }
          } catch {
            /* fall through */
          }
        }
        if (status === 409) {
          toast.error(
            "Already processing a message — cancel it first or wait.",
          );
          return;
        }
      }
      toast.error("Message failed to send");
    }

    setInput("");
  }

  return (
    // Praxiom — agent panel sits on surface-1, header borderless (surface contrast only)
    <div className="flex flex-col h-full bg-surface-1">
      <div className="h-10 flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 shrink-0">
            Agent
          </span>
          <span className="text-surface-4">·</span>
          <div className="text-sm font-medium text-foreground truncate">
            {activeConversation?.title ?? DEFAULT_CONVERSATION_TITLE}
          </div>
        </div>
        <div className="flex items-center px-1 gap-1">
          <Button
            size="icon-xs"
            variant="highlight"
            onClick={() => setIsConversationsDialogOpen(true)}
          >
            <HistoryIcon className="size-3.5" />
          </Button>
          <Button
            size="icon-xs"
            variant="highlight"
            onClick={handleCreateConversation}
          >
            <PlusIcon className="size-3.5" />
          </Button>
        </div>
      </div>
      <Conversation className="flex-1">
        <ConversationContent>
          {conversationMessages?.map((message, messageIndex) => {
            // Convert Convex toolCalls to component format
            const toolCalls: ToolCall[] = (message.toolCalls ?? []).map((tc) => ({
              id: tc.id,
              name: tc.name,
              args: tc.args as Record<string, unknown>,
              result: tc.result,
              status: tc.status,
            }));

            // Convert Convex fileChanges to component format
            const fileChanges: FileChange[] = (message.fileChanges ?? []).map((fc) => ({
              fileId: fc.fileId,
              operation: fc.operation,
            }));

            return (
              <Message
                key={message._id}
                from={message.role}
              >
                <MessageContent>
                  {/* D-024 — extended-thinking block above the message body */}
                  {message.role === "assistant" && message.thinking && (
                    <ThinkingBlock
                      thinking={message.thinking}
                      defaultOpen={message.status === "processing"}
                    />
                  )}
                  {message.status === "processing" ? (
                    <MessageProcessing
                      streamingContent={message.streamingContent}
                      toolCalls={toolCalls}
                    />
                  ) : (
                    <>
                      <MessageResponse>{message.content}</MessageResponse>
                      {/* Show file changes for completed assistant messages */}
                      {message.role === "assistant" && fileChanges.length > 0 && (
                        <MessageFileChanges fileChanges={fileChanges} />
                      )}
                    </>
                  )}
                </MessageContent>
                {message.role === "assistant" &&
                  message.status === "completed" &&
                  messageIndex === (conversationMessages?.length ?? 0) - 1 && (
                    <MessageActions>
                      <MessageAction
                        onClick={() => {
                          navigator.clipboard.writeText(message.content)
                        }}
                        label="Copy"
                      >
                        <CopyIcon className="size-3" />
                      </MessageAction>
                    </MessageActions>
                  )
                }
              </Message>
            );
          })}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="p-3">
        <PromptInput
          onSubmit={handleSubmit}
          className="mt-2"
        >
          <PromptInputBody>
            <PromptInputTextarea
              placeholder="Ask Polaris anything..."
              onChange={(e) => setInput(e.target.value)}
              value={input}
              disabled={isProcessing}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools />
            <PromptInputSubmit
              disabled={isProcessing ? false : !input}
              status={isProcessing ? "streaming" : undefined}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>

      <ConversationsDialog
        projectId={projectId}
        open={isConversationsDialogOpen}
        onOpenChange={setIsConversationsDialogOpen}
        onSelectConversation={setSelectedConversationId}
        selectedConversationId={activeConversationId}
      />
    </div>
  );
};
