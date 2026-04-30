/**
 * ResponseFeedback — thumbs up/down + optional comment for an assistant
 * message. Submits to `api.response_feedback.submit`; reads existing
 * vote from `api.response_feedback.getMine`.
 *
 * Auth-gated via Convex: if the user is unauthenticated, `getMine`
 * returns null (component still renders, optimistic state only).
 */

"use client"

import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { ThumbsUp, ThumbsDown, MessageSquare } from "lucide-react"
import { toast } from "sonner"

import { api } from "@/../convex/_generated/api"
import type { Id } from "@/../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface ResponseFeedbackProps {
  messageId: Id<"messages">
  className?: string
}

export function ResponseFeedback({
  messageId,
  className,
}: ResponseFeedbackProps) {
  const existing = useQuery(api.response_feedback.getMine, { messageId })
  const submit = useMutation(api.response_feedback.submit)

  const [showComment, setShowComment] = useState(false)
  const [comment, setComment] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const currentRating = existing?.rating ?? null

  const handleRate = async (rating: "up" | "down") => {
    if (submitting) return
    setSubmitting(true)
    try {
      await submit({ messageId, rating })
    } catch {
      toast.error("Could not submit feedback")
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmitComment = async () => {
    const trimmed = comment.trim()
    if (!trimmed || !currentRating) return
    setSubmitting(true)
    try {
      await submit({
        messageId,
        rating: currentRating,
        comment: trimmed,
      })
      setComment("")
      setShowComment(false)
      toast.success("Thanks for the feedback")
    } catch {
      toast.error("Could not submit comment")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      data-testid="response-feedback"
      className={cn("flex flex-col gap-1.5", className)}
    >
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label="Thumbs up"
          aria-pressed={currentRating === "up"}
          onClick={() => handleRate("up")}
          disabled={submitting}
          className={cn(
            "size-6",
            currentRating === "up" && "text-success bg-success/10",
          )}
        >
          <ThumbsUp className="size-3" />
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label="Thumbs down"
          aria-pressed={currentRating === "down"}
          onClick={() => handleRate("down")}
          disabled={submitting}
          className={cn(
            "size-6",
            currentRating === "down" && "text-destructive bg-destructive/10",
          )}
        >
          <ThumbsDown className="size-3" />
        </Button>
        {currentRating && (
          <button
            type="button"
            onClick={() => setShowComment((s) => !s)}
            className="ml-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <MessageSquare className="size-3" />
            {showComment ? "Cancel" : "Comment"}
          </button>
        )}
      </div>

      {showComment && currentRating && (
        <div className="flex flex-col gap-1.5">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Tell us what went well or what didn't…"
            rows={3}
            className={cn(
              "rounded-md border border-border bg-surface-1 px-2 py-1.5",
              "text-xs text-foreground placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-1 focus:ring-ring resize-none",
            )}
          />
          <div className="flex items-center justify-end gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 text-[10px]"
              onClick={() => {
                setShowComment(false)
                setComment("")
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="default"
              className="h-6 text-[10px]"
              disabled={!comment.trim() || submitting}
              onClick={handleSubmitComment}
            >
              Submit
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
