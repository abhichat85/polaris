/**
 * Tests for ToolCallCard. Authority: Sub-Plan 04 §1, DESIGN-SYSTEM §7.4.
 *
 * Covers all 7 tools (read_file, write_file, edit_file, create_file,
 * delete_file, list_files, run_command) and 3 statuses (running/completed/error).
 */

import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { ToolCallCard } from "@/features/conversations/components/tool-call-card"

const baseCall = {
  id: "tc_1",
  name: "read_file",
  args: { path: "src/index.ts" },
  status: "running" as const,
}

describe("ToolCallCard", () => {
  it("renders tool name as a label", () => {
    render(<ToolCallCard toolCall={baseCall} />)
    expect(screen.getByText(/read_file/i)).toBeInTheDocument()
  })

  it("renders the path arg for read_file", () => {
    render(<ToolCallCard toolCall={baseCall} />)
    expect(screen.getByText("src/index.ts")).toBeInTheDocument()
  })

  it("shows running status badge with neutral surface color", () => {
    render(<ToolCallCard toolCall={{ ...baseCall, status: "running" }} />)
    const badge = screen.getByTestId("tool-call-status")
    expect(badge).toHaveTextContent(/running/i)
    expect(badge.className).toMatch(/bg-surface-4|bg-primary\/10/)
  })

  it("shows completed status badge with success color", () => {
    render(
      <ToolCallCard
        toolCall={{
          ...baseCall,
          status: "completed",
          result: { ok: true, data: "file contents" },
        }}
      />,
    )
    const badge = screen.getByTestId("tool-call-status")
    expect(badge).toHaveTextContent(/completed|done/i)
    expect(badge.className).toMatch(/bg-success\/15/)
  })

  it("shows error status badge with destructive color", () => {
    render(
      <ToolCallCard
        toolCall={{
          ...baseCall,
          status: "error",
          result: { ok: false, error: "boom", errorCode: "PATH_NOT_FOUND" },
        }}
      />,
    )
    const badge = screen.getByTestId("tool-call-status")
    expect(badge).toHaveTextContent(/error|failed/i)
    expect(badge.className).toMatch(/bg-destructive\/10/)
  })

  it("uses surface-3 background and rounded-lg radius", () => {
    const { container } = render(<ToolCallCard toolCall={baseCall} />)
    const root = container.firstChild as HTMLElement
    expect(root.className).toContain("bg-surface-3")
    expect(root.className).toContain("rounded-lg")
  })

  it("renders a distinct icon for each of the 7 tools", () => {
    const tools = [
      "read_file",
      "write_file",
      "edit_file",
      "create_file",
      "delete_file",
      "list_files",
      "run_command",
    ] as const
    for (const name of tools) {
      const { unmount } = render(
        <ToolCallCard toolCall={{ ...baseCall, name }} />,
      )
      expect(
        screen.getByTestId(`tool-icon-${name}`),
        `expected icon for ${name}`,
      ).toBeInTheDocument()
      unmount()
    }
  })

  it("renders edit_file diff hint with old_string/new_string args", () => {
    render(
      <ToolCallCard
        toolCall={{
          ...baseCall,
          name: "edit_file",
          args: {
            path: "a.ts",
            old_string: "foo",
            new_string: "bar",
          },
        }}
      />,
    )
    expect(screen.getByText("a.ts")).toBeInTheDocument()
  })

  it("renders run_command stdout/stderr in font-mono when present", () => {
    render(
      <ToolCallCard
        toolCall={{
          id: "tc_2",
          name: "run_command",
          args: { command: "ls -la" },
          status: "completed",
          result: {
            ok: true,
            data: { stdout: "file1\nfile2", stderr: "warn", exitCode: 0 },
          },
        }}
      />,
    )
    expect(screen.getByText(/ls -la/)).toBeInTheDocument()
    const stdout = screen.getByTestId("run-command-stdout")
    expect(stdout).toHaveTextContent("file1")
    expect(stdout.className).toContain("font-mono")
    const stderr = screen.getByTestId("run-command-stderr")
    expect(stderr).toHaveTextContent("warn")
  })

  it("renders the error message when status=error", () => {
    render(
      <ToolCallCard
        toolCall={{
          ...baseCall,
          status: "error",
          result: { ok: false, error: "file missing", errorCode: "PATH_NOT_FOUND" },
        }}
      />,
    )
    expect(screen.getByText(/file missing/)).toBeInTheDocument()
  })
})
