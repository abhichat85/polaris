/**
 * Optimistic-message reconciliation hook. Sub-Plan 04 §7.
 *
 * Renders user-typed messages instantly while the server insert is in flight.
 * When the matching server row arrives via the Convex live query, the
 * optimistic entry is dropped (matched by `content` for the same `role`).
 *
 * The `messages` returned is what the UI binds to. `addOptimistic` is called
 * by the chat input on submit.
 */

import { useCallback, useMemo, useRef, useState } from "react"

interface MinimalMessage {
  _id: string
  role: "user" | "assistant"
  content: string
  status?: string
}

interface OptimisticEntry {
  _id: string
  role: "user" | "assistant"
  content: string
  status: "pending"
  createdAt: number
}

export interface UseOptimisticMessagesResult<T extends MinimalMessage> {
  messages: (T | (OptimisticEntry & Partial<T>))[]
  addOptimistic: (input: { content: string; role?: "user" | "assistant" }) => void
}

let counter = 0

export function useOptimisticMessages<T extends MinimalMessage>(
  serverMessages: T[],
): UseOptimisticMessagesResult<T> {
  const [optimistic, setOptimistic] = useState<OptimisticEntry[]>([])
  const lastReconcileRef = useRef<string>("")

  const addOptimistic = useCallback(
    ({ content, role = "user" }: { content: string; role?: "user" | "assistant" }) => {
      counter += 1
      const entry: OptimisticEntry = {
        _id: `optimistic-${Date.now()}-${counter}`,
        role,
        content,
        status: "pending",
        createdAt: Date.now(),
      }
      setOptimistic((prev) => [...prev, entry])
    },
    [],
  )

  const merged = useMemo(() => {
    if (optimistic.length === 0) return serverMessages
    // Drop optimistic entries whose (role, content) is already on the server.
    const remaining = optimistic.filter(
      (o) =>
        !serverMessages.some(
          (s) => s.role === o.role && s.content === o.content,
        ),
    )
    if (remaining.length !== optimistic.length) {
      // Mark a reconcile so we can clean up state asynchronously without a loop.
      const sig = remaining.map((r) => r._id).join(",")
      if (sig !== lastReconcileRef.current) {
        lastReconcileRef.current = sig
        // Defer the state update to avoid setState-during-render warning.
        queueMicrotask(() => setOptimistic(remaining))
      }
    }
    return [...serverMessages, ...remaining] as (T | (OptimisticEntry & Partial<T>))[]
  }, [serverMessages, optimistic])

  return { messages: merged, addOptimistic }
}
