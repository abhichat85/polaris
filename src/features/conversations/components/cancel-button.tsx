/**
 * CancelButton — wires to POST /api/agent/cancel with optimistic UI.
 *
 * Authority: Sub-Plan 04 §6.
 */

"use client"

import { useState } from "react"
import { Square } from "lucide-react"

import { Button } from "@/components/ui/button"

export interface CancelButtonProps {
  messageId: string | null
  onCancelled?: () => void
}

export function CancelButton({ messageId, onCancelled }: CancelButtonProps) {
  const [cancelling, setCancelling] = useState(false)

  const handleClick = async () => {
    if (!messageId || cancelling) return
    setCancelling(true)
    try {
      await fetch("/api/agent/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messageId }),
      })
      onCancelled?.()
    } finally {
      setCancelling(false)
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={!messageId}
      data-cancelling={cancelling ? "true" : "false"}
      onClick={handleClick}
      aria-label="Cancel"
    >
      <Square className="w-3 h-3" aria-hidden="true" />
      {cancelling ? "Cancelling…" : "Stop"}
    </Button>
  )
}
