/**
 * Eval scenarios for the new agent tools (Phase 1.x / 3.x / D-050..056).
 *
 * Each scenario simulates a competent LLM choosing the right new tool
 * for a given user prompt, and asserts that:
 *   - The agent picked the new tool (not the old workaround)
 *   - The arguments are well-formed
 *   - Output flows back into the sink correctly
 *   - No fallback to the brute-force tool (e.g. read_file when
 *     find_definition would do)
 */

import { describe, expect, it, vi } from "vitest"
import {
  done,
  makeFixture,
  text,
  tool,
  toolCallNames,
  turnFinish,
  usage,
  type ScriptedTurn,
} from "./_helpers"

const baseInput = {
  messageId: "msg_eval",
  conversationId: "conv_eval",
  projectId: "proj_eval",
  userId: "user_eval",
  resumeFromCheckpoint: false,
}

// =============================================================================
// SCENARIO 11 — find_definition is preferred over read_file for symbol questions
// =============================================================================
// Claim: Asked "where is X defined?", the agent picks find_definition
// (returns file:line:snippet matches) instead of pulling whole files
// into context.

describe("Quality 11 — find_definition over read_file for symbol lookup", () => {
  it("uses find_definition when asked where a symbol lives", async () => {
    const script: ScriptedTurn[] = [
      [
        text("Locating the definition."),
        tool(
          "find_definition",
          { symbol: "useAppStore", kind: "any" },
          "tu_find",
        ),
        usage(120, 30),
        done("tool_use"),
      ],
      turnFinish("Found in src/store.ts:42 (const declaration)."),
    ]
    const { sink, runner, sandbox, sandboxId } = await makeFixture(script, {
      conversation: [
        { role: "user", content: "Where is useAppStore defined?" },
      ],
    })
    // Mock ripgrep output for the find_definition call.
    sandbox.execHandler = (cmd) => {
      if (cmd.includes("rg ")) {
        return {
          stdout:
            "src/store.ts:42:export const useAppStore = create<State>(() => ({}))\n",
          stderr: "",
          exitCode: 0,
          durationMs: 5,
        }
      }
      return { stdout: "", stderr: "", exitCode: 0, durationMs: 0 }
    }
    void sandboxId

    await runner.run(baseInput)

    const names = toolCallNames(sink)
    expect(names).toContain("find_definition")
    expect(names).not.toContain("read_file")
    expect(names).not.toContain("list_files")
  })
})

// =============================================================================
// SCENARIO 12 — find_references reveals call sites without dumping files
// =============================================================================
// Claim: For "what calls X?", the agent calls find_references with the
// symbol name and gets file:line matches scoped to references (definitions
// filtered out by default).

describe("Quality 12 — find_references for impact analysis", () => {
  it("uses find_references before refactoring a function", async () => {
    const script: ScriptedTurn[] = [
      [
        text("Checking blast radius."),
        tool(
          "find_references",
          { symbol: "calculateTotal" },
          "tu_refs",
        ),
        usage(80, 20),
        done("tool_use"),
      ],
      turnFinish("Three call sites: cart.tsx, summary.tsx, invoice.ts."),
    ]
    const { sink, runner, sandbox } = await makeFixture(script, {
      conversation: [
        { role: "user", content: "What calls calculateTotal?" },
      ],
    })
    sandbox.execHandler = (cmd) => {
      if (cmd.includes("rg ")) {
        return {
          stdout: [
            "src/cart.tsx:18:  const total = calculateTotal(items)",
            "src/summary.tsx:25:  const t = calculateTotal(cartItems)",
            "src/invoice.ts:9:return calculateTotal(line)",
          ].join("\n") + "\n",
          stderr: "",
          exitCode: 0,
          durationMs: 4,
        }
      }
      return { stdout: "", stderr: "", exitCode: 0, durationMs: 0 }
    }

    await runner.run(baseInput)

    const names = toolCallNames(sink)
    expect(names).toContain("find_references")
    // Should NOT have grepped via search_code since find_references is
    // the structurally-correct tool.
    expect(names).not.toContain("search_code")
  })
})

// =============================================================================
// SCENARIO 13 — shell maintains cwd across sequential calls
// =============================================================================
// Claim: A build sequence (cd + install + test) shares state across
// shell calls — agent doesn't pay for re-cd-ing every command.

describe("Quality 13 — shell session preserves cwd", () => {
  it("stateful shell tool reuses cwd", async () => {
    let lastCwd = "/"
    const script: ScriptedTurn[] = [
      [
        text("Setting working directory."),
        tool("shell", { command: "cd packages/web" }, "tu_cd"),
        usage(60, 15),
        done("tool_use"),
      ],
      [
        text("Installing deps."),
        tool("shell", { command: "pnpm install" }, "tu_inst"),
        usage(80, 20),
        done("tool_use"),
      ],
      [
        text("Running tests."),
        tool("shell", { command: "pnpm test" }, "tu_test"),
        usage(80, 20),
        done("tool_use"),
      ],
      turnFinish("All green."),
    ]
    const { sink, runner, sandbox } = await makeFixture(script, {
      conversation: [
        { role: "user", content: "Install deps for packages/web and test." },
      ],
    })
    // Track the cwd that the wrapper passes through. The shell wrapper
    // emits `cd '<cwd>'` as the first line of its bash script, so we
    // can read the intended cwd from there. We then update lastCwd to
    // simulate a successful cd and emit the matching marker.
    sandbox.execHandler = (cmd) => {
      const cdMatch = cmd.match(/^cd '([^']*)'/)
      if (cdMatch) lastCwd = cdMatch[1]
      // Detect a `cd <path>` from the user command and update lastCwd.
      const userCdMatch = cmd.match(/\ncd packages\/web\n/)
      if (userCdMatch) lastCwd = "/packages/web"
      const markerMatch = cmd.match(/__POLARIS_(\S+?)__:CWD/)
      if (markerMatch) {
        return {
          stdout: `__POLARIS_${markerMatch[1]}__:CWD:${lastCwd}`,
          stderr: "",
          exitCode: 0,
          durationMs: 5,
        }
      }
      return { stdout: "", stderr: "", exitCode: 0, durationMs: 0 }
    }

    await runner.run(baseInput)

    const names = toolCallNames(sink)
    expect(names.filter((n) => n === "shell")).toHaveLength(3)
    // Critical: agent did NOT prepend `cd packages/web && ...` to the
    // install/test invocations because shell preserves cwd.
    const installCall = sink.toolCalls.find(
      (tc) => tc.toolCall.id === "tu_inst",
    )
    const testCall = sink.toolCalls.find((tc) => tc.toolCall.id === "tu_test")
    expect((installCall?.toolCall.input as { command: string }).command).toBe(
      "pnpm install",
    )
    expect((testCall?.toolCall.input as { command: string }).command).toBe(
      "pnpm test",
    )
  })
})

// =============================================================================
// SCENARIO 14 — read_plan + update_feature_status flow
// =============================================================================
// Claim: When a plan exists, the agent reads it, marks the feature
// in_progress before working, then done after.

describe("Quality 14 — plan-driven execution updates feature status", () => {
  it("reads plan, updates status to in_progress, then done", async () => {
    const script: ScriptedTurn[] = [
      [
        text("Reading the plan."),
        tool("read_plan", { pendingOnly: true }, "tu_plan"),
        usage(70, 20),
        done("tool_use"),
      ],
      [
        text("Starting feature f2."),
        tool(
          "update_feature_status",
          { featureId: "f2", status: "in_progress" },
          "tu_start",
        ),
        usage(60, 15),
        done("tool_use"),
      ],
      [
        text("Editing."),
        tool(
          "edit_file",
          {
            path: "src/cart.tsx",
            search: "<button>Add</button>",
            replace: '<button onClick={onAdd}>Add</button>',
          },
          "tu_edit",
        ),
        usage(80, 30),
        done("tool_use"),
      ],
      [
        text("Done."),
        tool(
          "update_feature_status",
          { featureId: "f2", status: "done" },
          "tu_done",
        ),
        usage(50, 10),
        done("tool_use"),
      ],
      turnFinish("Feature f2 complete."),
    ]
    const { sink, runner } = await makeFixture(script, {
      initialFiles: {
        "src/cart.tsx": "export const Cart = () => <button>Add</button>",
      },
      conversation: [
        { role: "user", content: "Wire the Add button." },
      ],
    })

    await runner.run(baseInput)

    const names = toolCallNames(sink)
    // read_plan came before update_feature_status, which came before edit
    expect(names.indexOf("read_plan")).toBeLessThan(
      names.indexOf("update_feature_status"),
    )
    expect(names.indexOf("update_feature_status")).toBeLessThan(
      names.indexOf("edit_file"),
    )
    // status was updated twice: in_progress then done
    const updates = sink.toolCalls.filter(
      (tc) => tc.toolCall.name === "update_feature_status",
    )
    expect(updates).toHaveLength(2)
    expect((updates[0].toolCall.input as { status: string }).status).toBe(
      "in_progress",
    )
    expect((updates[1].toolCall.input as { status: string }).status).toBe(
      "done",
    )
  })
})

// =============================================================================
// SCENARIO 15 — agent prefers find_definition over read_file even when both work
// =============================================================================
// This is the cost-discipline check: many small edits to a known symbol
// should NOT pull whole files. A poorly-prompted agent reads first,
// edits second, paying 10× the tokens for the same outcome.

describe("Quality 15 — cost discipline: navigate before reading", () => {
  it("does not read_file when find_definition + edit_file is sufficient", async () => {
    const script: ScriptedTurn[] = [
      [
        text("Finding the constant."),
        tool(
          "find_definition",
          { symbol: "DEFAULT_PORT" },
          "tu_find",
        ),
        usage(60, 15),
        done("tool_use"),
      ],
      [
        text("Updating the value."),
        tool(
          "edit_file",
          {
            path: "src/config.ts",
            search: "export const DEFAULT_PORT = 3000",
            replace: "export const DEFAULT_PORT = 4000",
          },
          "tu_edit",
        ),
        usage(60, 15),
        done("tool_use"),
      ],
      turnFinish("DEFAULT_PORT changed to 4000."),
    ]
    const { sink, runner, sandbox } = await makeFixture(script, {
      initialFiles: {
        "src/config.ts": "export const DEFAULT_PORT = 3000\n",
      },
      conversation: [
        { role: "user", content: "Change DEFAULT_PORT to 4000." },
      ],
    })
    sandbox.execHandler = (cmd) => {
      if (cmd.includes("rg ")) {
        return {
          stdout:
            "src/config.ts:1:export const DEFAULT_PORT = 3000\n",
          stderr: "",
          exitCode: 0,
          durationMs: 3,
        }
      }
      return { stdout: "", stderr: "", exitCode: 0, durationMs: 0 }
    }

    await runner.run(baseInput)

    const names = toolCallNames(sink)
    expect(names).toEqual(["find_definition", "edit_file"])
    // Critical: never called read_file
    expect(names).not.toContain("read_file")
    // The find_definition snippet gave the agent enough context to
    // construct an accurate edit_file search string.
  })
})
