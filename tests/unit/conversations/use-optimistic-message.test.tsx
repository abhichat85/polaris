/**
 * Tests for the optimistic-message helper. Sub-Plan 04 §7.
 *
 * The user's outgoing message is rendered immediately and reconciled
 * when the Convex live query returns the matching insert.
 */

import { describe, it, expect } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useOptimisticMessages } from "@/features/conversations/hooks/use-optimistic-messages"

interface ServerMsg {
  _id: string
  role: "user" | "assistant"
  content: string
  status?: string
}

describe("useOptimisticMessages", () => {
  it("returns server messages when no optimistic entries exist", () => {
    const server: ServerMsg[] = [
      { _id: "m1", role: "user", content: "hi" },
    ]
    const { result } = renderHook(() => useOptimisticMessages(server))
    expect(result.current.messages.map((m) => m.content)).toEqual(["hi"])
  })

  it("appends an optimistic message ahead of the server reply", () => {
    const { result } = renderHook(() =>
      useOptimisticMessages<ServerMsg>([]),
    )
    act(() => {
      result.current.addOptimistic({ content: "typed by user" })
    })
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].content).toBe("typed by user")
    expect(result.current.messages[0].role).toBe("user")
    expect(result.current.messages[0]._id).toMatch(/^optimistic-/)
  })

  it("removes optimistic when matching server message arrives", () => {
    const { result, rerender } = renderHook(
      ({ server }: { server: ServerMsg[] }) =>
        useOptimisticMessages(server),
      { initialProps: { server: [] as ServerMsg[] } },
    )
    act(() => {
      result.current.addOptimistic({ content: "hi" })
    })
    expect(result.current.messages).toHaveLength(1)
    rerender({
      server: [{ _id: "m1", role: "user", content: "hi" }],
    })
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0]._id).toBe("m1")
  })
})
