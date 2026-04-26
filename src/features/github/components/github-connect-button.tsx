"use client"

/**
 * Connect / Reconnect / Disconnect GitHub. Authority: sub-plan 06 Task 13.
 *
 * Renders one of three states based on the user's `integrations.getConnection`:
 *   - not connected:  "Connect GitHub" (links to /api/github/oauth/start)
 *   - connected:      shows @login + a Disconnect button
 *
 * Uses Convex live query so the moment the OAuth callback writes the row,
 * the UI flips to "connected" without a page refresh.
 */

import { useState } from "react"
import { useQuery } from "convex/react"
import { Github, X, Loader2 } from "lucide-react"
import { api } from "../../../../convex/_generated/api"

interface Props {
  userId: string
}

export function GithubConnectButton({ userId }: Props) {
  const connection = useQuery(api.integrations.getConnection, { userId })
  const [disconnecting, setDisconnecting] = useState(false)

  if (connection === undefined) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md bg-surface-3 px-3.5 py-1.5 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading…
      </div>
    )
  }

  if (!connection) {
    return (
      <a
        href="/api/github/oauth/start"
        className="inline-flex items-center gap-2 rounded-md bg-surface-4 px-3.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-3"
      >
        <Github className="size-4" />
        Connect GitHub
      </a>
    )
  }

  const onDisconnect = async () => {
    if (
      !confirm(
        `Disconnect GitHub account @${connection.accountLogin}? You'll need to re-authorize to import or push.`,
      )
    ) {
      return
    }
    setDisconnecting(true)
    try {
      await fetch("/api/github/disconnect", { method: "POST" })
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="inline-flex items-center gap-3 rounded-md bg-surface-3 px-3.5 py-1.5">
      <Github className="size-4 text-muted-foreground" />
      <span className="text-sm font-medium text-foreground">
        @{connection.accountLogin}
      </span>
      <button
        type="button"
        onClick={onDisconnect}
        disabled={disconnecting}
        aria-label="Disconnect GitHub"
        className="ml-1 inline-flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-surface-4 hover:text-foreground disabled:opacity-50"
      >
        {disconnecting ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <X className="size-3" />
        )}
      </button>
    </div>
  )
}
