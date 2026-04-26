/**
 * Tests for MessageBubble. Authority: Sub-Plan 04 §2, DESIGN-SYSTEM §7.7.
 */

import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MessageBubble } from "@/features/conversations/components/message-bubble"

describe("MessageBubble", () => {
  it("renders user message content", () => {
    render(
      <MessageBubble role="user" content="hello there" status="completed" />,
    )
    expect(screen.getByText("hello there")).toBeInTheDocument()
  })

  it("renders assistant message content", () => {
    render(
      <MessageBubble role="assistant" content="hi back" status="completed" />,
    )
    expect(screen.getByText("hi back")).toBeInTheDocument()
  })

  it("uses font-body class on the content wrapper", () => {
    render(
      <MessageBubble role="assistant" content="text" status="completed" />,
    )
    const root = screen.getByTestId("message-bubble")
    expect(root.className).toContain("font-body")
  })

  it("is left-aligned for both user and assistant per §7.7", () => {
    const { rerender } = render(
      <MessageBubble role="user" content="u" status="completed" />,
    )
    expect(screen.getByTestId("message-bubble").className).not.toContain(
      "items-end",
    )
    rerender(
      <MessageBubble role="assistant" content="a" status="completed" />,
    )
    expect(screen.getByTestId("message-bubble").className).not.toContain(
      "items-end",
    )
  })

  it("shows streaming cursor when status=streaming", () => {
    render(
      <MessageBubble role="assistant" content="partial" status="streaming" />,
    )
    expect(screen.getByTestId("streaming-cursor")).toBeInTheDocument()
  })

  it("does not show streaming cursor when status=completed", () => {
    render(
      <MessageBubble role="assistant" content="done" status="completed" />,
    )
    expect(screen.queryByTestId("streaming-cursor")).not.toBeInTheDocument()
  })

  it("labels the role for accessibility", () => {
    render(
      <MessageBubble role="user" content="u" status="completed" />,
    )
    expect(screen.getByTestId("message-bubble")).toHaveAttribute(
      "data-role",
      "user",
    )
  })
})
