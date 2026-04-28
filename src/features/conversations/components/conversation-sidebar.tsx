import { polarisKy as ky } from "@/lib/http/polaris-ky";
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
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";

import { ConversationsDialog } from "./conversations-dialog";
import { RuntimeErrorChip } from "./runtime-error-chip";

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
  // D-033 — steering hook
  const steerMessage = useMutation(api.steering.enqueue);
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

    // D-033 — mid-run steering. If the agent is processing AND the user
    // has typed a follow-up, enqueue it as a steer instead of starting
    // a new message. AgentRunner picks it up between iterations.
    if (isProcessing && message.text && processingMessage) {
      try {
        await steerMessage({
          messageId: processingMessage._id,
          text: message.text,
        });
        toast.success("Steering queued — agent picks it up next iteration");
      } catch {
        toast.error("Could not queue steer");
      }
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
    const sendMessage = async () =>
      ky.post("/api/messages", {
        json: { conversationId, message: message.text },
      });

    try {
      await sendMessage();
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "response" in error &&
        error.response instanceof Response
      ) {
        const status = error.response.status;

        // §17 quota gate returns 429 with structured payload.
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
          } catch { /* fall through */ }
        }

        // 409 = a previous run crashed and left a message stuck in
        // "processing". Auto-cancel the stale message and retry once so
        // the user never has to manually clear it.
        if (status === 409) {
          try {
            const body = await (error.response as Response).json();
            const stuckId = body?.messageId;
            if (stuckId) {
              await ky.post("/api/messages/cancel", {
                json: { messageId: stuckId },
              });
              // Retry the send now that the slot is free.
              await sendMessage();
              setInput("");
              return;
            }
          } catch {
            /* cancel or retry failed — fall through to generic error */
          }
          toast.error("Previous run is still in progress — please wait a moment and try again.");
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
      {/* Praxiom-quality panel header */}
      <div className="h-10 flex items-center justify-between px-3 shrink-0 border-b border-surface-3/60">
        <div className="flex items-center gap-2 min-w-0">
          {/* Primary dot — signals the panel is the active intelligence surface */}
          <span className="size-1.5 rounded-full bg-primary shrink-0" />
          <span className="font-heading text-sm font-semibold tracking-[-0.02em] text-foreground truncate">
            {activeConversation?.title ?? DEFAULT_CONVERSATION_TITLE}
          </span>
        </div>
        <div className="flex items-center px-1 gap-1">
          <RuntimeErrorChip projectId={projectId} />
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
          {/* Praxiom-quality empty state — shown before first message */}
          {conversationMessages !== undefined && conversationMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center flex-1 py-10 gap-3 text-center px-4">
              <span className="size-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <span className="size-1.5 rounded-full bg-primary" />
              </span>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Agent ready</p>
                <p className="text-xs text-muted-foreground/70 leading-relaxed max-w-[18rem]">
                  Describe what you want to build and the agent will plan, scaffold, and iterate with you.
                </p>
              </div>
            </div>
          )}
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
      <div className="p-3 border-t border-surface-3/60">
        <PromptInput
          onSubmit={handleSubmit}
        >
          <PromptInputBody>
            <PromptInputTextarea
              placeholder="What are you thinking about?"
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
