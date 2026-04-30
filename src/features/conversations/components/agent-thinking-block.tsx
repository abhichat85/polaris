"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Brain, ChevronDown, ChevronRight } from "lucide-react"

export interface AgentThinkingBlockProps {
  /** The thinking text content. */
  content: string
  /** Whether the thinking is still streaming. */
  isStreaming?: boolean
  /** Initially collapsed. Default: true. */
  defaultCollapsed?: boolean
  className?: string
}

export function AgentThinkingBlock({
  content,
  isStreaming = false,
  defaultCollapsed = true,
  className,
}: AgentThinkingBlockProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  if (!content && !isStreaming) return null

  const wordCount = content.split(/\s+/).filter(Boolean).length
  const preview = content.slice(0, 120).replace(/\n/g, " ")

  return (
    <div
      data-testid="agent-thinking-block"
      className={cn(
        "rounded-lg bg-surface-2 border border-border/50 overflow-hidden",
        "animate-chat-enter",
        className,
      )}
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full px-3 py-2 text-xs text-muted-foreground hover:bg-surface-3 transition-colors"
        type="button"
      >
        <Brain className="w-3.5 h-3.5 text-purple-500" />
        <span className="font-medium text-foreground">Thinking</span>
        {isStreaming && (
          <span className="text-[10px] text-purple-500 animate-pulse">
            streaming...
          </span>
        )}
        {!isStreaming && (
          <span className="text-[10px] text-muted-foreground">
            {wordCount} words
          </span>
        )}
        <span className="ml-auto">
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </span>
      </button>

      {collapsed && content && (
        <div className="px-3 pb-2 text-[11px] text-muted-foreground/70 truncate">
          {preview}...
        </div>
      )}

      {!collapsed && (
        <div className="px-3 pb-3 text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
          {content}
        </div>
      )}
    </div>
  )
}
