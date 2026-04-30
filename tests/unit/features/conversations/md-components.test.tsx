/**
 * Tests for inline markdown components rendered inside assistant
 * messages: DiffBlock, TestResultsBlock, CoverageBlock, LintBlock.
 *
 * Covers:
 *   - smoke render with valid props (no throws)
 *   - empty / zero-state behavior (sensible labels, no expand affordance)
 *   - the pure `computeDiff` algorithm correctly identifies added /
 *     removed lines after trimming common prefix and suffix.
 */

import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import {
  DiffBlock,
  computeDiff,
  TestResultsBlock,
  CoverageBlock,
  LintBlock,
} from "@/features/conversations/components/md"

describe("computeDiff", () => {
  it("returns no removed/added lines when contents are identical", () => {
    const r = computeDiff("a\nb\nc", "a\nb\nc")
    expect(r.removed).toEqual([])
    expect(r.added).toEqual([])
  })

  it("trims common prefix and suffix and reports the middle as added/removed", () => {
    const oldC = "a\nb\nc\nd\ne"
    const newC = "a\nb\nX\nY\nd\ne"
    const r = computeDiff(oldC, newC)
    expect(r.prefix).toEqual(["a", "b"])
    expect(r.removed).toEqual(["c"])
    expect(r.added).toEqual(["X", "Y"])
    // suffix is taken from old; both sides share the same lines
    expect(r.suffix).toEqual(["d", "e"])
  })

  it("identifies pure addition correctly", () => {
    const r = computeDiff("a\nb", "a\nNEW\nb")
    expect(r.removed).toEqual([])
    expect(r.added).toEqual(["NEW"])
  })

  it("identifies pure removal correctly", () => {
    const r = computeDiff("a\nGONE\nb", "a\nb")
    expect(r.removed).toEqual(["GONE"])
    expect(r.added).toEqual([])
  })

  it("handles totally divergent contents", () => {
    const r = computeDiff("x\ny", "p\nq")
    expect(r.prefix).toEqual([])
    expect(r.removed).toEqual(["x", "y"])
    expect(r.added).toEqual(["p", "q"])
    expect(r.suffix).toEqual([])
  })
})

describe("DiffBlock", () => {
  it("renders with valid props and shows file path + counts", () => {
    render(
      <DiffBlock
        filePath="src/foo.ts"
        old={"const x = 1\nconst y = 2"}
        new={"const x = 1\nconst y = 3"}
      />,
    )
    expect(screen.getByTestId("diff-block")).toBeInTheDocument()
    expect(screen.getByText("src/foo.ts")).toBeInTheDocument()
    expect(screen.getByTestId("diff-block-added")).toHaveTextContent("+1")
    expect(screen.getByTestId("diff-block-removed")).toHaveTextContent("-1")
  })

  it("expands the body when toggled", async () => {
    const user = userEvent.setup()
    render(
      <DiffBlock
        filePath="src/bar.ts"
        old={"unchanged\nold-line\ntail"}
        new={"unchanged\nnew-line\ntail"}
      />,
    )
    expect(screen.queryByTestId("diff-block-body")).toBeNull()
    await user.click(screen.getByRole("button"))
    expect(screen.getByTestId("diff-block-body")).toBeInTheDocument()
  })

  it("renders sensibly when old equals new (zero diff)", () => {
    render(
      <DiffBlock filePath="src/same.ts" old={"same"} new={"same"} />,
    )
    expect(screen.getByTestId("diff-block-added")).toHaveTextContent("+0")
    expect(screen.getByTestId("diff-block-removed")).toHaveTextContent("-0")
  })
})

describe("TestResultsBlock", () => {
  it("renders summary pills with valid props", () => {
    render(
      <TestResultsBlock
        passed={12}
        failed={1}
        skipped={3}
        duration={1234}
        failures={[
          {
            test: "describe > it should foo",
            error: "Expected 1\nReceived 2\nat foo.ts:10",
          },
        ]}
      />,
    )
    expect(screen.getByTestId("test-results-block")).toBeInTheDocument()
    expect(screen.getByTestId("test-pill-passed")).toHaveTextContent("12 passed")
    expect(screen.getByTestId("test-pill-failed")).toHaveTextContent("1 failed")
    expect(screen.getByTestId("test-pill-skipped")).toHaveTextContent("3 skipped")
  })

  it("renders zero-state without throwing and disables expand", () => {
    render(<TestResultsBlock passed={0} failed={0} />)
    expect(screen.getByTestId("test-results-block")).toBeInTheDocument()
    // Toggle button is disabled because there are no failures to expand.
    expect(screen.getByRole("button")).toBeDisabled()
    // Skipped pill is hidden when count is zero.
    expect(screen.queryByTestId("test-pill-skipped")).toBeNull()
  })

  it("expands and reveals failure rows when failures exist", async () => {
    const user = userEvent.setup()
    render(
      <TestResultsBlock
        passed={0}
        failed={1}
        failures={[
          {
            test: "broken test",
            error: "line1\nline2\nline3\nline4-not-shown",
          },
        ]}
      />,
    )
    await user.click(screen.getByRole("button"))
    const failures = screen.getByTestId("test-failures")
    expect(failures).toHaveTextContent("broken test")
    expect(failures).toHaveTextContent("line1")
    expect(failures).toHaveTextContent("line3")
    // Only the first 3 lines of the error are rendered.
    expect(failures).not.toHaveTextContent("line4-not-shown")
  })
})

describe("CoverageBlock", () => {
  it("renders with valid props and shows the after percentage and delta", () => {
    render(<CoverageBlock before={80.0} after={82.3} />)
    expect(screen.getByTestId("coverage-block")).toBeInTheDocument()
    expect(screen.getByTestId("coverage-after")).toHaveTextContent("82.3%")
    expect(screen.getByTestId("coverage-delta")).toHaveTextContent("+2.3%")
  })

  it("renders a negative delta when coverage drops", () => {
    render(<CoverageBlock before={90} after={88.9} />)
    expect(screen.getByTestId("coverage-delta")).toHaveTextContent("-1.1%")
  })

  it("renders zero-state at 0% / 0% without throwing", () => {
    render(<CoverageBlock before={0} after={0} />)
    expect(screen.getByTestId("coverage-block")).toBeInTheDocument()
    expect(screen.getByTestId("coverage-after")).toHaveTextContent("0.0%")
  })

  it("expands the per-file breakdown when files are provided", async () => {
    const user = userEvent.setup()
    render(
      <CoverageBlock
        before={50}
        after={60}
        files={[
          { path: "src/a.ts", before: 50, after: 70 },
          { path: "src/b.ts", before: 50, after: 50 },
        ]}
      />,
    )
    await user.click(screen.getByRole("button"))
    const list = screen.getByTestId("coverage-files")
    expect(list).toHaveTextContent("src/a.ts")
    expect(list).toHaveTextContent("src/b.ts")
  })
})

describe("LintBlock", () => {
  it("renders summary with severity counts", () => {
    render(
      <LintBlock
        findings={[
          {
            file: "src/a.ts",
            line: 10,
            severity: "error",
            message: "Unexpected token",
            rule: "parse-error",
          },
          {
            file: "src/a.ts",
            line: 12,
            severity: "warning",
            message: "Unused import",
          },
          {
            file: "src/b.ts",
            line: 1,
            severity: "warning",
            message: "Missing semicolon",
          },
        ]}
      />,
    )
    expect(screen.getByTestId("lint-block")).toBeInTheDocument()
    expect(screen.getByTestId("lint-summary")).toHaveTextContent(
      "1 error, 2 warnings",
    )
  })

  it("renders zero-state with no findings without throwing", () => {
    render(<LintBlock findings={[]} />)
    expect(screen.getByTestId("lint-block")).toBeInTheDocument()
    expect(screen.getByTestId("lint-summary")).toHaveTextContent("No findings")
    expect(screen.getByRole("button")).toBeDisabled()
  })

  it("groups findings by file when expanded", async () => {
    const user = userEvent.setup()
    render(
      <LintBlock
        findings={[
          {
            file: "src/a.ts",
            line: 10,
            column: 5,
            severity: "error",
            message: "Boom",
            rule: "no-boom",
          },
          {
            file: "src/b.ts",
            line: 2,
            severity: "info",
            message: "FYI",
          },
        ]}
      />,
    )
    await user.click(screen.getByRole("button"))
    const region = screen.getByTestId("lint-findings")
    expect(region).toHaveTextContent("src/a.ts")
    expect(region).toHaveTextContent("src/b.ts")
    expect(region).toHaveTextContent("Boom")
    expect(region).toHaveTextContent("[no-boom]")
    expect(region).toHaveTextContent("10:5")
  })
})
