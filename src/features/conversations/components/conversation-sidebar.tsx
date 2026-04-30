import { polarisKy as ky } from "@/lib/http/polaris-ky";
import { toast } from "sonner";

import { showQuotaBlocked } from "@/components/quota-blocked-toast";
import { useState, useEffect } from "react";
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

import {
  useConversation,
  useConversations,
  useCreateConversation,
  useMessages,
} from "../hooks/use-conversations";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";

import { ConversationsDialog } from "./conversations-dialog";
import { RuntimeErrorChip } from "./runtime-error-chip";

import { Id } from "../../../../convex/_generated/dataModel";
import { DEFAULT_CONVERSATION_TITLE } from "../../../../convex/constants";

// Phase 6 — Prompt Enrichment
import { PromptEnrichmentPanel } from "./prompt-enrichment-panel";
import type { EnrichmentSession } from "@/lib/agent-kit/core/prompt-enrichment";

// D-024 / Phase 2-3 — quality + HITL + telemetry overlays
import { AgentStatusBar, type AgentPhase } from "./agent-status-bar";
import { AgentThinkingBlock } from "./agent-thinking-block";
import { QualityBadge } from "./quality-badge";
import { HealingIterationBadge } from "./healing-iteration-badge";
import { VerifierReasoningPane } from "./verifier-reasoning-pane";
import { SteerComposer } from "./steer-composer";
import { StreamAlertBar } from "./stream-alert-chip";
import { HitlCheckpointCard } from "./hitl-checkpoint-card";
import { HitlPreflightCard } from "./hitl-preflight-card";
import { SteeringAlertBanner } from "./steering-alert-banner";
import { ResponseFeedback } from "./response-feedback";

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

  // ── Phase 6 — Prompt Enrichment ──────────────────────────────────────────
  // `enrichmentSessionId` is set when enrichment is in flight for the
  // current first-message. `pendingMessage` holds the raw user text until
  // enrichment completes and we fire it (possibly enriched) at /api/messages.
  const [enrichmentSessionId, setEnrichmentSessionId] = useState<string | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  // Check whether this project already has a plan. `null` = confirmed no plan.
  // `undefined` = still loading (we don't start enrichment while loading).
  const existingPlan = useQuery(api.specs.getPlan, { projectId });

  // Subscribe to the enrichment session for the active conversation.
  // Only fires when an enrichment session is actively in progress.
  const enrichmentSession = useQuery(
    api.prompt_enrichment.getForConversation,
    activeConversationId && enrichmentSessionId
      ? { conversationId: activeConversationId }
      : "skip",
  );

  // When enrichment reaches a terminal state ("ready" or "skipped"), auto-fire
  // the pending message to /api/messages with the compiled enriched prompt.
  useEffect(() => {
    if (!enrichmentSession || !pendingMessage || !activeConversationId) return;
    if (
      enrichmentSession.status !== "ready" &&
      enrichmentSession.status !== "skipped"
    ) return;

    const enrichedPrompt = enrichmentSession.enrichedPrompt ?? pendingMessage;

    // Clear state BEFORE the async call so a React re-render doesn't re-fire.
    setPendingMessage(null);
    setEnrichmentSessionId(null);

    ky.post("/api/messages", {
      json: { conversationId: activeConversationId, message: enrichedPrompt },
    }).catch(() => toast.error("Failed to start planning after enrichment"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrichmentSession?.status]);

  /** Submit answers for the current enrichment round and trigger rescoring. */
  const handleAnswersSubmitted = async (
    answers: { questionId: string; answer: string }[],
  ) => {
    if (!enrichmentSessionId || !activeConversationId) return;
    await ky.post("/api/enrich/answer", {
      json: {
        sessionId: enrichmentSessionId,
        answers,
        conversationId: activeConversationId,
        projectId,
      },
    });
  };

  /** Skip callback — the skip mutation fires inside the panel; we just need
   * to wait for the useEffect above to detect the "skipped" status. */
  const handleEnrichmentSkip = () => {
    // No-op: the useEffect detects the "skipped" status and auto-fires.
  };

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

    // ── Phase 6 — Prompt Enrichment intercept ────────────────────────────
    // Only fires for the FIRST message of a NEW project (no plan yet).
    // `existingPlan === null` means confirmed no plan (not still loading).
    // Once an enrichment session is active we skip this path to avoid
    // creating duplicate sessions.
    const hasMessages = (conversationMessages?.length ?? 0) > 0;
    const isNewProject = existingPlan === null;

    if (!hasMessages && isNewProject && !enrichmentSessionId && message.text?.trim()) {
      let enrichmentStarted = false;
      try {
        const { sessionId } = await ky
          .post("/api/enrich", {
            json: { conversationId, projectId, prompt: message.text },
          })
          .json<{ sessionId: string }>();
        setPendingMessage(message.text);
        setEnrichmentSessionId(sessionId);
        setInput("");
        enrichmentStarted = true;
      } catch (enrichError) {
        console.warn(
          "[enrichment] Could not start enrichment — sending directly",
          enrichError,
        );
        // Fall through to the normal /api/messages send below.
      }
      if (enrichmentStarted) return;
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
          {/* Phase 6 — Prompt Enrichment panel.
              Shown above message history while an enrichment session is
              active (scoring or collecting). Hides automatically once the
              session reaches a terminal state and the message is sent. */}
          {enrichmentSession &&
            enrichmentSession.status !== "ready" &&
            enrichmentSession.status !== "skipped" &&
            enrichmentSessionId && (
              <PromptEnrichmentPanel
                session={enrichmentSession as EnrichmentSession & { _id: string }}
                onSkip={handleEnrichmentSkip}
                onAnswersSubmitted={handleAnswersSubmitted}
              />
            )}
          {conversationMessages?.map((message, messageIndex) => (
            <MessageRow
              key={message._id}
              message={message}
              isLast={messageIndex === (conversationMessages?.length ?? 0) - 1}
            />
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      {/* D-033 — mid-run steering composer, only visible while a message is processing */}
      {isProcessing && processingMessage && (
        <SteerComposer
          messageId={processingMessage._id}
          isRunning={true}
        />
      )}
      <div className="p-3">
        <PromptInput
          onSubmit={handleSubmit}
        >
          <PromptInputBody>
            <PromptInputTextarea
              placeholder="What are you thinking about?"
              onChange={(e) => setInput(e.target.value)}
              value={input}
              disabled={isProcessing || !!enrichmentSessionId}
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

/**
 * Per-message row. Owns its own Convex queries for contract result,
 * HITL checkpoints, and harness telemetry so each row updates
 * independently without re-rendering the whole conversation list.
 */
type MessageDoc = NonNullable<ReturnType<typeof useMessages>>[number];

interface MessageRowProps {
  message: MessageDoc;
  isLast: boolean;
}

const MessageRow = ({ message, isLast }: MessageRowProps) => {
  const isAssistant = message.role === "assistant";
  const isProcessing = message.status === "processing";
  const isStreaming = message.status === "streaming";
  const isCompleted = message.status === "completed";

  // Convex queries — only fire for assistant messages where they make sense.
  // `"skip"` defers the query so we don't waste round-trips for user msgs.
  const contractResult = useQuery(
    api.contract_results.getByMessage,
    isAssistant ? { messageId: message._id } : "skip",
  );

  const checkpoints = useQuery(
    api.hitl_checkpoints.getForRun,
    isAssistant ? { runId: message._id } : "skip",
  );

  const telemetry = useQuery(
    api.harness_telemetry.getByMessage,
    isAssistant && isCompleted ? { messageId: message._id } : "skip",
  );

  const resolveCheckpoint = useMutation(api.hitl_checkpoints.resolve);

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

  // Pending HITL checkpoints — split into preflight vs mid-task
  const pendingCheckpoints = (checkpoints ?? []).filter(
    (c) => c.status === "PENDING",
  );
  const preflightCheckpoints = pendingCheckpoints.filter(
    (c) => c.triggerType === "preflight",
  );
  const midTaskCheckpoints = pendingCheckpoints.filter(
    (c) => c.triggerType !== "preflight",
  );

  // Stream alerts: prefer the live message field, fall back to telemetry
  const rawAlerts = message.streamAlerts ?? telemetry?.streamAlerts ?? [];
  const streamAlerts = rawAlerts.map((a) => ({
    type: a.type,
    message: a.message,
  }));

  // Phase derivation for AgentStatusBar
  const phase: AgentPhase | null = isProcessing
    ? "in-flight"
    : isStreaming
      ? "in-flight"
      : message.status === "error"
        ? "error"
        : null;

  // Healing badge: show when contract result indicates a fix attempt
  const healingAttempt = contractResult?.attemptIndex ?? 0;
  const showHealingBadge = isAssistant && isCompleted && healingAttempt > 0;

  // Steering banner: show if telemetry shows steers were injected
  const steeringInjected = telemetry?.steeringInjected ?? 0;

  return (
    <Message from={message.role}>
      <MessageContent>
        {/* Pre-flight HITL approval card — blocks the run, shown above content */}
        {isAssistant &&
          preflightCheckpoints.map((cp) => (
            <HitlPreflightCard
              key={cp._id}
              checkpointId={cp._id}
              proposedAction={cp.proposedAction}
              triggerReason={cp.triggerReason}
              toolName={cp.toolName}
              path={cp.path}
              expiresAtMs={cp._creationTime + cp.timeoutMs}
              onApprove={() => {
                resolveCheckpoint({
                  checkpointId: cp._id,
                  resolution: "APPROVED",
                }).catch(() => toast.error("Could not approve checkpoint"));
              }}
              onReject={() => {
                resolveCheckpoint({
                  checkpointId: cp._id,
                  resolution: "REJECTED",
                }).catch(() => toast.error("Could not reject checkpoint"));
              }}
              onModify={(modification) => {
                resolveCheckpoint({
                  checkpointId: cp._id,
                  resolution: "MODIFIED",
                  modification,
                }).catch(() => toast.error("Could not modify checkpoint"));
              }}
            />
          ))}

        {/* Mid-task HITL checkpoints (and resolved history) */}
        {isAssistant &&
          midTaskCheckpoints.map((cp) => (
            <HitlCheckpointCard
              key={cp._id}
              checkpointId={cp._id}
              status={cp.status}
              triggerType={cp.triggerType}
              triggerReason={cp.triggerReason}
              proposedAction={cp.proposedAction}
              toolName={cp.toolName}
              path={cp.path}
            />
          ))}

        {/* Agent status bar while in-flight */}
        {isAssistant && phase && (
          <AgentStatusBar
            phase={phase}
            iterations={message.healingAttempts}
            tokens={
              (message.inputTokens ?? 0) + (message.outputTokens ?? 0) ||
              undefined
            }
            model={message.modelKey}
            className="mb-2"
          />
        )}

        {/* Steering banner — show on completed assistant messages that were nudged */}
        {isAssistant && isCompleted && steeringInjected > 0 && (
          <SteeringAlertBanner
            message={`Run was steered ${steeringInjected} time${steeringInjected === 1 ? "" : "s"} by mid-run user input.`}
            count={steeringInjected}
          />
        )}

        {/* Stream alerts during processing */}
        {isAssistant && (isProcessing || isStreaming) && streamAlerts.length > 0 && (
          <StreamAlertBar alerts={streamAlerts} className="px-0 py-1" />
        )}

        {/* D-024 — extended-thinking block above the message body */}
        {isAssistant && message.thinking && (
          <AgentThinkingBlock
            content={message.thinking}
            isStreaming={isProcessing || isStreaming}
            defaultCollapsed={!isProcessing}
            className="mb-2"
          />
        )}

        {isProcessing ? (
          <MessageProcessing
            streamingContent={message.streamingContent}
            toolCalls={toolCalls}
          />
        ) : (
          <>
            <MessageResponse>{message.content}</MessageResponse>

            {/* Quality + healing inline badges */}
            {isAssistant && isCompleted && contractResult && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <QualityBadge
                  score={contractResult.score}
                  verdict={contractResult.passed ? "PASS" : "RETURN-FOR-FIX"}
                />
                {showHealingBadge && (
                  <HealingIterationBadge
                    attempt={healingAttempt}
                    maxAttempts={3}
                    score={contractResult.score}
                  />
                )}
              </div>
            )}

            {/* Verifier reasoning panes (one per failed constraint) */}
            {isAssistant && isCompleted && contractResult && contractResult.issues.length > 0 && (
              <div className="mt-2 flex flex-col gap-1.5">
                <VerifierReasoningPane
                  stage={
                    contractResult.contractType.includes("eslint")
                      ? "eslint"
                      : contractResult.contractType.includes("build")
                        ? "build"
                        : "tsc"
                  }
                  passed={contractResult.passed}
                  errors={contractResult.issues.join("\n")}
                  fixAttempt={
                    healingAttempt > 0 ? `${healingAttempt}/3` : undefined
                  }
                />
              </div>
            )}

            {/* Show file changes for completed assistant messages */}
            {isAssistant && fileChanges.length > 0 && (
              <MessageFileChanges fileChanges={fileChanges} />
            )}
          </>
        )}
      </MessageContent>
      {isAssistant && isCompleted && isLast && (
        <MessageActions>
          <MessageAction
            onClick={() => {
              navigator.clipboard.writeText(message.content);
            }}
            label="Copy"
          >
            <CopyIcon className="size-3" />
          </MessageAction>
          <ResponseFeedback messageId={message._id} />
        </MessageActions>
      )}
    </Message>
  );
};
