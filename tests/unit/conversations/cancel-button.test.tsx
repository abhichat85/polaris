/**
 * Tests for CancelButton. Authority: Sub-Plan 04 §6.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CancelButton } from "@/features/conversations/components/cancel-button"

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  // @ts-expect-error - assign global fetch for test
  global.fetch = fetchMock
})

describe("CancelButton", () => {
  it("renders disabled when no messageId", () => {
    render(<CancelButton messageId={null} />)
    expect(screen.getByRole("button", { name: /cancel|stop/i })).toBeDisabled()
  })

  it("posts to /api/agent/cancel with messageId on click", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))
    const user = userEvent.setup()
    render(<CancelButton messageId="msg_42" />)
    await user.click(screen.getByRole("button", { name: /cancel|stop/i }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/agent/cancel")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body)).toEqual({ messageId: "msg_42" })
  })

  it("optimistically marks itself cancelling after click", async () => {
    let resolve: (value: Response) => void = () => {}
    fetchMock.mockReturnValue(
      new Promise<Response>((r) => {
        resolve = r
      }),
    )
    const user = userEvent.setup()
    render(<CancelButton messageId="msg_42" />)
    const btn = screen.getByRole("button", { name: /cancel|stop/i })
    await user.click(btn)
    expect(btn).toHaveAttribute("data-cancelling", "true")
    resolve(new Response("{}", { status: 200 }))
  })

  it("invokes onCancelled after successful response", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))
    const onCancelled = vi.fn()
    const user = userEvent.setup()
    render(<CancelButton messageId="msg_42" onCancelled={onCancelled} />)
    await user.click(screen.getByRole("button", { name: /cancel|stop/i }))
    expect(onCancelled).toHaveBeenCalled()
  })
})
