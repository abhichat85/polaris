/**
 * SteerComposer — inline composer for mid-run steering messages.
 *
 * Authority: D-033 (steering queue). Only visible while the agent is
 * actively processing; submits to `api.steering.enqueue`.
 */

"use client"

import { useState, useCallback } from "react"
import { useMutation } from "convex/react"
import { Send } from "lucide-react"

import { api } from "@/../convex/_generated/api"
import type { Id } from "@/../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface SteerComposerProps {
  /** The messageId of the currently running agent message. */
  messageId: string
  /** Whether the agent is currently running. */
  isRunning: boolean
  className?: string
}

export function SteerComposer({
  messageId,
  isRunning,
  className,
}: SteerComposerProps) {
  const [text, setText] = useState("")
  const [sent, setSent] = useState(false)
  const enqueue = useMutation(api.steering.enqueue)

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const trimmed = text.trim()
      if (!trimmed) return

      try {
        await enqueue({
          messageId: messageId as Id<"messages">,
          text: trimmed,
        })
        setText("")
        setSent(true)
        setTimeout(() => setSent(false), 2000)
      } catch {
        // Best-effort — if steering fails, don't crash the UI
      }
    },
    [text, messageId, enqueue],
  )

  if (!isRunning) return null

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="steer-composer"
      className={cn(
        "flex items-center gap-2 px-4 py-2 border-t border-border bg-surface-2",
        className,
      )}
    >
      <Input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Steer the agent…"
        disabled={sent}
        className="flex-1 h-8 text-sm"
      />
      <Button
        type="submit"
        size="sm"
        variant={sent ? "secondary" : "default"}
        disabled={!text.trim() || sent}
      >
        {sent ? (
          "Sent"
        ) : (
          <>
            <Send className="w-3 h-3" aria-hidden="true" />
            Steer
          </>
        )}
      </Button>
    </form>
  )
}
