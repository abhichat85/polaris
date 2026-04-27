"use client";

import { Button } from "@/components/ui/button";
import {
  ButtonGroup,
  ButtonGroupText,
} from "@/components/ui/button-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { FileUIPart, UIMessage } from "./types";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PaperclipIcon,
  XIcon,
} from "lucide-react";
import type { ComponentProps, HTMLAttributes, ReactElement } from "react";
import { createContext, memo, useContext, useEffect, useState } from "react";
import { Streamdown } from "streamdown";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"];
};

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      "group flex w-full max-w-[95%] flex-col gap-2",
      from === "user" ? "is-user ml-auto justify-end" : "is-assistant",
      className
    )}
    {...props}
  />
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageContent = ({
  children,
  className,
  ...props
}: MessageContentProps) => (
  <div
    className={cn(
      "is-user:dark flex w-fit max-w-full min-w-0 flex-col gap-2 overflow-hidden text-sm",
      "group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground",
      "group-[.is-assistant]:text-foreground",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

export type MessageActionsProps = ComponentProps<"div">;

export const MessageActions = ({
  className,
  children,
  ...props
}: MessageActionsProps) => (
  <div className={cn("flex items-center gap-1", className)} {...props}>
    {children}
  </div>
);

export type MessageActionProps = ComponentProps<typeof Button> & {
  tooltip?: string;
  label?: string;
};

export const MessageAction = ({
  tooltip,
  children,
  label,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: MessageActionProps) => {
  const button = (
    <Button size={size} type="button" variant={variant} {...props}>
      {children}
      <span className="sr-only">{label || tooltip}</span>
    </Button>
  );

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
};

type MessageBranchContextType = {
  currentBranch: number;
  totalBranches: number;
  goToPrevious: () => void;
  goToNext: () => void;
  branches: ReactElement[];
  setBranches: (branches: ReactElement[]) => void;
};

const MessageBranchContext = createContext<MessageBranchContextType | null>(
  null
);

const useMessageBranch = () => {
  const context = useContext(MessageBranchContext);

  if (!context) {
    throw new Error(
      "MessageBranch components must be used within MessageBranch"
    );
  }

  return context;
};

export type MessageBranchProps = HTMLAttributes<HTMLDivElement> & {
  defaultBranch?: number;
  onBranchChange?: (branchIndex: number) => void;
};

export const MessageBranch = ({
  defaultBranch = 0,
  onBranchChange,
  className,
  ...props
}: MessageBranchProps) => {
  const [currentBranch, setCurrentBranch] = useState(defaultBranch);
  const [branches, setBranches] = useState<ReactElement[]>([]);

  const handleBranchChange = (newBranch: number) => {
    setCurrentBranch(newBranch);
    onBranchChange?.(newBranch);
  };

  const goToPrevious = () => {
    const newBranch =
      currentBranch > 0 ? currentBranch - 1 : branches.length - 1;
    handleBranchChange(newBranch);
  };

  const goToNext = () => {
    const newBranch =
      currentBranch < branches.length - 1 ? currentBranch + 1 : 0;
    handleBranchChange(newBranch);
  };

  const contextValue: MessageBranchContextType = {
    currentBranch,
    totalBranches: branches.length,
    goToPrevious,
    goToNext,
    branches,
    setBranches,
  };

  return (
    <MessageBranchContext.Provider value={contextValue}>
      <div
        className={cn("grid w-full gap-2 [&>div]:pb-0", className)}
        {...props}
      />
    </MessageBranchContext.Provider>
  );
};

export type MessageBranchContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageBranchContent = ({
  children,
  ...props
}: MessageBranchContentProps) => {
  const { currentBranch, setBranches, branches } = useMessageBranch();
  const childrenArray = Array.isArray(children) ? children : [children];

  // Use useEffect to update branches when they change
  useEffect(() => {
    if (branches.length !== childrenArray.length) {
      setBranches(childrenArray);
    }
  }, [childrenArray, branches, setBranches]);

  return childrenArray.map((branch, index) => (
    <div
      className={cn(
        "grid gap-2 overflow-hidden [&>div]:pb-0",
        index === currentBranch ? "block" : "hidden"
      )}
      key={branch.key}
      {...props}
    >
      {branch}
    </div>
  ));
};

export type MessageBranchSelectorProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"];
};

export const MessageBranchSelector = ({
  className,
  from,
  ...props
}: MessageBranchSelectorProps) => {
  const { totalBranches } = useMessageBranch();

  // Don't render if there's only one branch
  if (totalBranches <= 1) {
    return null;
  }

  return (
    <ButtonGroup
      className="[&>*:not(:first-child)]:rounded-l-md [&>*:not(:last-child)]:rounded-r-md"
      orientation="horizontal"
      {...props}
    />
  );
};

export type MessageBranchPreviousProps = ComponentProps<typeof Button>;

export const MessageBranchPrevious = ({
  children,
  ...props
}: MessageBranchPreviousProps) => {
  const { goToPrevious, totalBranches } = useMessageBranch();

  return (
    <Button
      aria-label="Previous branch"
      disabled={totalBranches <= 1}
      onClick={goToPrevious}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ChevronLeftIcon size={14} />}
    </Button>
  );
};

export type MessageBranchNextProps = ComponentProps<typeof Button>;

export const MessageBranchNext = ({
  children,
  className,
  ...props
}: MessageBranchNextProps) => {
  const { goToNext, totalBranches } = useMessageBranch();

  return (
    <Button
      aria-label="Next branch"
      disabled={totalBranches <= 1}
      onClick={goToNext}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ChevronRightIcon size={14} />}
    </Button>
  );
};

export type MessageBranchPageProps = HTMLAttributes<HTMLSpanElement>;

export const MessageBranchPage = ({
  className,
  ...props
}: MessageBranchPageProps) => {
  const { currentBranch, totalBranches } = useMessageBranch();

  return (
    <ButtonGroupText
      className={cn(
        "border-none bg-transparent text-muted-foreground shadow-none",
        className
      )}
      {...props}
    >
      {currentBranch + 1} of {totalBranches}
    </ButtonGroupText>
  );
};

export type MessageResponseProps = ComponentProps<typeof Streamdown>;

export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <Streamdown
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className
      )}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children
);

MessageResponse.displayName = "MessageResponse";

export type MessageAttachmentProps = HTMLAttributes<HTMLDivElement> & {
  data: FileUIPart;
  className?: string;
  onRemove?: () => void;
};

export function MessageAttachment({
  data,
  className,
  onRemove,
  ...props
}: MessageAttachmentProps) {
  const filename = data.filename || "";
  const mediaType =
    data.mediaType?.startsWith("image/") && data.url ? "image" : "file";
  const isImage = mediaType === "image";
  const attachmentLabel = filename || (isImage ? "Image" : "Attachment");

  return (
    <div
      className={cn(
        "group relative size-24 overflow-hidden rounded-lg",
        className
      )}
      {...props}
    >
      {isImage ? (
        <>
          <img
            alt={filename || "attachment"}
            className="size-full object-cover"
            height={100}
            src={data.url}
            width={100}
          />
          {onRemove && (
            <Button
              aria-label="Remove attachment"
              className="absolute top-2 right-2 size-6 rounded-full bg-background/80 p-0 opacity-0 backdrop-blur-sm transition-opacity hover:bg-background group-hover:opacity-100 [&>svg]:size-3"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              type="button"
              variant="ghost"
            >
              <XIcon />
              <span className="sr-only">Remove</span>
            </Button>
          )}
        </>
      ) : (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex size-full shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <PaperclipIcon className="size-4" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{attachmentLabel}</p>
            </TooltipContent>
          </Tooltip>
          {onRemove && (
            <Button
              aria-label="Remove attachment"
              className="size-6 shrink-0 rounded-full p-0 opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100 [&>svg]:size-3"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              type="button"
              variant="ghost"
            >
              <XIcon />
              <span className="sr-only">Remove</span>
            </Button>
          )}
        </>
      )}
    </div>
  );
}

export type MessageAttachmentsProps = ComponentProps<"div">;

export function MessageAttachments({
  children,
  className,
  ...props
}: MessageAttachmentsProps) {
  if (!children) {
    return null;
  }

  return (
    <div
      className={cn(
        "ml-auto flex w-fit flex-wrap items-start gap-2",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export type MessageToolbarProps = ComponentProps<"div">;

export const MessageToolbar = ({
  className,
  children,
  ...props
}: MessageToolbarProps) => (
  <div
    className={cn(
      "mt-4 flex w-full items-center justify-between gap-4",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

// ============================================================================
// Tool Call Visualization Components
// ============================================================================

export type ToolCallStatus = "running" | "completed" | "error";

export interface ToolCall {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  result?: unknown;
  status: ToolCallStatus;
}

export interface FileChange {
  fileId: string;
  operation: "created" | "updated" | "deleted";
  fileName?: string;
}

export type MessageToolCallsProps = HTMLAttributes<HTMLDivElement> & {
  toolCalls: ToolCall[];
};

const toolNameIcons: Record<string, string> = {
  read_file: "📖",
  write_file: "✏️",
  create_file: "📄",
  create_folder: "📁",
  delete_file: "🗑️",
  list_directory: "📂",
  search_files: "🔍",
};

const toolNameLabels: Record<string, string> = {
  read_file: "Reading file",
  write_file: "Writing file",
  create_file: "Creating file",
  create_folder: "Creating folder",
  delete_file: "Deleting file",
  list_directory: "Listing directory",
  search_files: "Searching files",
};

export const MessageToolCalls = ({
  toolCalls,
  className,
  ...props
}: MessageToolCallsProps) => {
  if (!toolCalls || toolCalls.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-lg bg-muted/50 p-2 text-xs",
        className
      )}
      {...props}
    >
      {toolCalls.map((tool) => (
        <div
          key={tool.id}
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors",
            tool.status === "running" && "bg-blue-500/10 text-blue-600 dark:text-blue-400",
            tool.status === "completed" && "bg-green-500/10 text-green-600 dark:text-green-400",
            tool.status === "error" && "bg-red-500/10 text-red-600 dark:text-red-400"
          )}
        >
          <span className="shrink-0">
            {toolNameIcons[tool.name] || "🔧"}
          </span>
          <span className="font-medium">
            {toolNameLabels[tool.name] || tool.name}
          </span>
          {typeof tool.args?.path === 'string' && (
            <span className="truncate text-muted-foreground font-mono text-[10px]">
              {tool.args.path}
            </span>
          )}
          {tool.status === "running" && (
            <span className="ml-auto shrink-0 animate-pulse">●</span>
          )}
          {tool.status === "completed" && (
            <span className="ml-auto shrink-0">✓</span>
          )}
          {tool.status === "error" && (
            <span className="ml-auto shrink-0">✗</span>
          )}
        </div>
      ))}
    </div>
  );
};

export type MessageFileChangesProps = HTMLAttributes<HTMLDivElement> & {
  fileChanges: FileChange[];
};

const operationStyles: Record<FileChange["operation"], string> = {
  created: "bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30",
  updated: "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30",
  deleted: "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30",
};

const operationLabels: Record<FileChange["operation"], string> = {
  created: "Created",
  updated: "Modified",
  deleted: "Deleted",
};

export const MessageFileChanges = ({
  fileChanges,
  className,
  ...props
}: MessageFileChangesProps) => {
  if (!fileChanges || fileChanges.length === 0) {
    return null;
  }

  return (
    <div
      className={cn("flex flex-wrap gap-1.5 mt-2", className)}
      {...props}
    >
      {fileChanges.map((change, index) => (
        <span
          key={`${change.fileId}-${index}`}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
            operationStyles[change.operation]
          )}
        >
          <span>{operationLabels[change.operation]}</span>
          {change.fileName && (
            <span className="font-mono truncate max-w-[100px]">
              {change.fileName}
            </span>
          )}
        </span>
      ))}
    </div>
  );
};

export type MessageProcessingProps = HTMLAttributes<HTMLDivElement> & {
  streamingContent?: string;
  toolCalls?: ToolCall[];
};

export const MessageProcessing = ({
  streamingContent,
  toolCalls,
  className,
  ...props
}: MessageProcessingProps) => {
  const hasToolCalls = toolCalls && toolCalls.length > 0;
  const hasContent = streamingContent && streamingContent.trim().length > 0;

  return (
    <div className={cn("flex flex-col gap-2", className)} {...props}>
      {/* Show tool calls if any */}
      {hasToolCalls && <MessageToolCalls toolCalls={toolCalls} />}

      {/* Show streaming content if any */}
      {hasContent ? (
        <MessageResponse>{streamingContent}</MessageResponse>
      ) : !hasToolCalls ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="size-2 rounded-full bg-blue-500 animate-pulse" />
          <span>Thinking...</span>
        </div>
      ) : null}
    </div>
  );
};
