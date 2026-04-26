/**
 * MessageBubble — left-aligned message renderer for both user and assistant.
 *
 * Authority: Sub-Plan 04 §2, DESIGN-SYSTEM §7.7 (chat panel rules), §3
 * (typography). Streaming cursor follows §7.7's `▊` blink pattern, defined
 * as `animate-blink` in the design tokens.
 */

"use client"

import { Streamdown } from "streamdown"

import { cn } from "@/lib/utils"

export type MessageStatus =
  | "processing"
  | "streaming"
  | "completed"
  | "cancelled"
  | "error"

export interface MessageBubbleProps {
  role: "user" | "assistant"
  content: string
  status: MessageStatus
}

export function MessageBubble({ role, content, status }: MessageBubbleProps) {
  const isStreaming = status === "streaming" || status === "processing"
  const isUser = role === "user"

  return (
    <div
      data-testid="message-bubble"
      data-role={role}
      className={cn(
        "font-body text-sm text-foreground",
        // Left-aligned for both per §7.7 — never `items-end`
        "flex flex-col gap-1.5",
        "animate-chat-enter",
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        {isUser ? "You" : "Polaris"}
      </div>
      <div
        className={cn(
          "rounded-lg px-3 py-2",
          isUser ? "bg-surface-3" : "bg-transparent",
          "leading-relaxed",
        )}
      >
        {isUser ? (
          <span>{content}</span>
        ) : (
          <Streamdown>{content}</Streamdown>
        )}
        {isStreaming && (
          <span
            data-testid="streaming-cursor"
            aria-hidden="true"
            className="inline-block ml-0.5 align-baseline animate-blink text-primary"
          >
            ▊
          </span>
        )}
      </div>
    </div>
  )
}
