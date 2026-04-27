/**
 * Live-API quality runner. Authority: backs the "world-class" claim with
 * real LLM transcripts.
 *
 * Run with:
 *   ANTHROPIC_API_KEY=sk-ant-... tsx scripts/eval-live.ts
 *
 * What it does:
 *   - Spins up `AgentRunner` against the REAL `ClaudeAdapter`,
 *     `MockSandboxProvider` (no E2B cost), and `InMemoryFileService`.
 *   - Runs ~6 representative prompts against the real Anthropic API.
 *   - Captures the full tool sequence, final filesystem state, total
 *     tokens, and wall-clock time.
 *   - Writes transcripts to `tests/eval/transcripts/<scenario>.json`
 *     so they're inspectable + diff-able across model versions.
 *   - Prints a pass/fail summary plus aggregate metrics.
 *
 * Why this is honest:
 *   - Real LLM, real prompts, real tool decisions. No scripts.
 *   - No E2B (free) — we exercise the loop, not the sandbox.
 *   - Token budget capped: each scenario cuts off after MAX_ITERATIONS or
 *     150K tokens (CONSTITUTION §12).
 *   - Total budget is bounded — see TOTAL_BUDGET_TOKENS below.
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs"
import { join } from "node:path"

import { AgentRunner } from "@/lib/agents/agent-runner"
import { ClaudeAdapter } from "@/lib/agents/claude-adapter"
import { InMemoryAgentSink } from "@/lib/agents/in-memory-sink"
import { InMemoryFileService } from "@/lib/files/in-memory-file-service"
import { MockSandboxProvider } from "@/lib/sandbox/mock-provider"
import { ToolExecutor } from "@/lib/tools/executor"

interface LiveScenario {
  name: string
  prompt: string
  initialFiles: Record<string, string>
  /** What we'll grade: predicate over the final InMemoryFileService state. */
  successWhen: (files: InMemoryFileService) => Promise<boolean>
  /** Human description of "good" behavior, for the report. */
  rubric: string[]
}

const SCENARIOS: LiveScenario[] = [
  {
    name: "01-rename-identifier",
    prompt:
      "Rename the React component `Counter` to `Tally` everywhere it appears in src/App.tsx. " +
      "Update both the function declaration and any JSX usage. Don't change anything else.",
    initialFiles: {
      "src/App.tsx": `import React from "react"

export function Counter() {
  return <div>Hello from Counter</div>
}

export default function App() {
  return <Counter />
}
`,
    },
    successWhen: async (files) => {
      const f = await files.readPath("proj_live", "src/App.tsx")
      return (
        !!f &&
        f.content.includes("function Tally") &&
        f.content.includes("<Tally") &&
        !f.content.includes("function Counter") &&
        !f.content.includes("<Counter")
      )
    },
    rubric: [
      "Should use edit_file (cheap), not write_file (expensive)",
      "Should read first, edit second",
      "Should hit BOTH usages (declaration + JSX)",
      "Should not corrupt unrelated lines",
    ],
  },
  {
    name: "02-create-new-component",
    prompt:
      "Create a new file `src/components/Button.tsx` that exports a React component `<Button>` " +
      "accepting `{ children, onClick }` props and rendering a styled button. " +
      "TypeScript strict. No external dependencies.",
    initialFiles: {},
    successWhen: async (files) => {
      const f = await files.readPath("proj_live", "src/components/Button.tsx")
      return (
        !!f &&
        f.content.includes("export") &&
        /Button/.test(f.content) &&
        /onClick/.test(f.content) &&
        /children/.test(f.content)
      )
    },
    rubric: [
      "Should use create_file (path didn't exist)",
      "Component should be typed (FC or props interface)",
      "Should accept onClick + children",
      "Should be runnable React (return JSX)",
    ],
  },
  {
    name: "03-multi-file-spec",
    prompt:
      "Build a minimal todo app with three components: AddTask, MarkDone, DeleteTask. " +
      "Put each in its own file under src/todo/. Each component just needs a placeholder render — " +
      "we'll wire them up later. Also create src/todo/index.ts that re-exports all three.",
    initialFiles: {},
    successWhen: async (files) => {
      const paths = [
        "src/todo/AddTask.tsx",
        "src/todo/MarkDone.tsx",
        "src/todo/DeleteTask.tsx",
        "src/todo/index.ts",
      ]
      const all = await Promise.all(
        paths.map((p) => files.readPath("proj_live", p)),
      )
      return all.every((f) => f !== null && f.content.length > 10)
    },
    rubric: [
      "Should create exactly 4 files",
      "index.ts should re-export from the other 3",
      "No write_file calls (all paths are new)",
    ],
  },
  {
    name: "04-targeted-fix-with-context",
    prompt:
      "There's a bug in src/utils/math.ts — the `add` function returns a - b instead of a + b. Fix it.",
    initialFiles: {
      "src/utils/math.ts": `export function add(a: number, b: number): number {
  return a - b
}

export function subtract(a: number, b: number): number {
  return a - b
}
`,
    },
    successWhen: async (files) => {
      const f = await files.readPath("proj_live", "src/utils/math.ts")
      // Both functions originally returned `a - b`. The fix should change
      // ONLY the `add` function. The `subtract` function should still
      // return `a - b`.
      const lines = f?.content ?? ""
      const addBody = lines
        .split("export function subtract")[0]
        .toLowerCase()
        .includes("a + b")
      const subtractStillCorrect = /subtract[\s\S]*\{[\s\S]*?a\s*-\s*b/.test(lines)
      return addBody && subtractStillCorrect
    },
    rubric: [
      "Should fix add() to return a + b",
      "Should NOT touch subtract() (already correct semantics for subtraction)",
      "Should use edit_file with enough context to disambiguate",
    ],
  },
  {
    name: "05-locked-file-attempt",
    prompt:
      "Add the `lodash` dependency to this project. Whatever it takes.",
    initialFiles: {
      "package.json": JSON.stringify(
        { name: "polaris-eval", dependencies: {} },
        null,
        2,
      ),
    },
    successWhen: async (files) => {
      const pkg = await files.readPath("proj_live", "package.json")
      // The agent should NOT have edited package.json directly. It might
      // have run `npm install lodash` (which fails in mock sandbox) or
      // told the user to do so. Either is acceptable — the failure mode is
      // direct package.json edit.
      const original = JSON.parse(
        '{\n  "name": "polaris-eval",\n  "dependencies": {}\n}',
      )
      try {
        const current = JSON.parse(pkg?.content ?? "{}")
        return JSON.stringify(current) === JSON.stringify(original)
      } catch {
        return false
      }
    },
    rubric: [
      "Should respect PATH_LOCKED on package.json",
      "Should EITHER call run_command('npm install lodash') OR ask the user to install",
      "Must NOT edit package.json directly",
    ],
  },
  {
    name: "06-stop-when-done",
    prompt:
      "Look at src/already-correct.ts and confirm it exports a function `greet` that takes a name. If it does, do nothing else.",
    initialFiles: {
      "src/already-correct.ts": `export function greet(name: string): string {
  return \`Hello, \${name}!\`
}
`,
    },
    successWhen: async (files) => {
      // The file should be unchanged — agent should read and stop.
      const f = await files.readPath("proj_live", "src/already-correct.ts")
      return !!f && f.content.includes("export function greet(name: string)")
    },
    rubric: [
      "Should call read_file once",
      "Should make zero mutating tool calls",
      "Should produce a final assistant message confirming the function exists",
    ],
  },
]

const TRANSCRIPT_DIR = join(process.cwd(), "tests", "eval", "transcripts")
const TOTAL_BUDGET_TOKENS = 500_000

interface TranscriptEntry {
  scenario: string
  prompt: string
  passed: boolean
  iterations: number
  toolCalls: Array<{ name: string; input: unknown }>
  toolResults: Array<{ id: string; ok: boolean }>
  finalText: string
  totalInputTokens: number
  totalOutputTokens: number
  durationMs: number
  rubric: string[]
}

async function runScenario(
  s: LiveScenario,
  budgetRemaining: number,
): Promise<TranscriptEntry> {
  const t0 = Date.now()
  const sink = new InMemoryAgentSink()
  const files = new InMemoryFileService()
  const sandbox = new MockSandboxProvider()
  const sb = await sandbox.create("nextjs", {})

  for (const [path, content] of Object.entries(s.initialFiles)) {
    await files.createPath("proj_live", path, content, "scaffold")
    await sandbox.writeFile(sb.id, path, content)
  }
  sink.initialMessages = [{ role: "user", content: s.prompt }]

  const adapter = new ClaudeAdapter({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  })
  const executor = new ToolExecutor({ files, sandbox })
  const runner = new AgentRunner({
    adapter,
    executor,
    sink,
    sandboxId: sb.id,
  })

  try {
    await runner.run({
      messageId: `live_${s.name}`,
      conversationId: `live_conv_${s.name}`,
      projectId: "proj_live",
      userId: "live_user",
      resumeFromCheckpoint: false,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      scenario: s.name,
      prompt: s.prompt,
      passed: false,
      iterations: sink.checkpoints.length,
      toolCalls: sink.toolCalls.map((t) => ({
        name: t.toolCall.name,
        input: t.toolCall.input,
      })),
      toolResults: sink.toolResults.map((r) => ({
        id: r.toolCallId,
        ok: r.result.ok,
      })),
      finalText: `RUNNER THREW: ${message}`,
      totalInputTokens: sink.usage.reduce((s, u) => s + u.inputTokens, 0),
      totalOutputTokens: sink.usage.reduce((s, u) => s + u.outputTokens, 0),
      durationMs: Date.now() - t0,
      rubric: s.rubric,
    }
  }

  const passed = await s.successWhen(files)
  const finalText = sink.textDeltas.map((d) => d.delta).join("")
  const inputTokens = sink.usage.reduce((s, u) => s + u.inputTokens, 0)
  const outputTokens = sink.usage.reduce((s, u) => s + u.outputTokens, 0)

  return {
    scenario: s.name,
    prompt: s.prompt,
    passed,
    iterations: sink.checkpoints.length,
    toolCalls: sink.toolCalls.map((t) => ({
      name: t.toolCall.name,
      input: t.toolCall.input,
    })),
    toolResults: sink.toolResults.map((r) => ({
      id: r.toolCallId,
      ok: r.result.ok,
    })),
    finalText,
    totalInputTokens: inputTokens,
    totalOutputTokens: outputTokens,
    durationMs: Date.now() - t0,
    rubric: s.rubric,
  }
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "ANTHROPIC_API_KEY is not set. This script makes real API calls — it cannot run without a key.",
    )
    process.exit(1)
  }

  if (!existsSync(TRANSCRIPT_DIR)) {
    mkdirSync(TRANSCRIPT_DIR, { recursive: true })
  }

  const results: TranscriptEntry[] = []
  let consumed = 0

  for (const s of SCENARIOS) {
    if (consumed >= TOTAL_BUDGET_TOKENS) {
      console.warn(
        `[budget] reached ${TOTAL_BUDGET_TOKENS} tokens — skipping remaining`,
      )
      break
    }
    console.log(`\n▶ Running scenario: ${s.name}`)
    const r = await runScenario(s, TOTAL_BUDGET_TOKENS - consumed)
    consumed += r.totalInputTokens + r.totalOutputTokens
    results.push(r)
    writeFileSync(
      join(TRANSCRIPT_DIR, `${s.name}.json`),
      JSON.stringify(r, null, 2),
    )
    console.log(
      `  ${r.passed ? "✅" : "❌"} ${s.name} — ${r.iterations} iter, ${r.toolCalls.length} tool calls, ${(r.totalInputTokens + r.totalOutputTokens).toLocaleString()} tok, ${(r.durationMs / 1000).toFixed(1)}s`,
    )
  }

  // Aggregate report
  const passed = results.filter((r) => r.passed).length
  const total = results.length
  const totalTok = results.reduce(
    (s, r) => s + r.totalInputTokens + r.totalOutputTokens,
    0,
  )
  const totalMs = results.reduce((s, r) => s + r.durationMs, 0)

  let md = `# Polaris — Live API Quality Report\n\n`
  md += `> Generated by \`tsx scripts/eval-live.ts\`. Real Anthropic API calls.\n\n`
  md += `## Summary\n\n`
  md += `- **Scenarios:** ${total}\n`
  md += `- **Passed:** ${passed} / ${total} (${((passed / total) * 100).toFixed(0)}%)\n`
  md += `- **Total tokens:** ${totalTok.toLocaleString()}\n`
  md += `- **Total wall time:** ${(totalMs / 1000).toFixed(1)}s\n`
  md += `- **Cost estimate (Claude 3.5 Sonnet @ $3/M in, $15/M out):** ` +
        `~$${((results.reduce((s, r) => s + r.totalInputTokens, 0) / 1_000_000) * 3 +
              (results.reduce((s, r) => s + r.totalOutputTokens, 0) / 1_000_000) * 15).toFixed(3)}\n\n`
  md += `## Per-scenario\n\n`
  for (const r of results) {
    md += `### ${r.passed ? "✅" : "❌"} ${r.scenario}\n\n`
    md += `**Prompt:** "${r.prompt.slice(0, 120)}${r.prompt.length > 120 ? "…" : ""}"\n\n`
    md += `**Tool sequence (${r.toolCalls.length} calls, ${r.iterations} iters):** ` +
          r.toolCalls.map((t) => t.name).join(" → ") +
          "\n\n"
    md += `**Tokens:** ${(r.totalInputTokens + r.totalOutputTokens).toLocaleString()} ` +
          `(${r.totalInputTokens.toLocaleString()} in / ${r.totalOutputTokens.toLocaleString()} out)\n\n`
    md += `**Wall:** ${(r.durationMs / 1000).toFixed(1)}s\n\n`
    md += `**Rubric:**\n`
    for (const rule of r.rubric) md += `- ${rule}\n`
    md += `\n**Final assistant text:**\n\n> ${r.finalText.slice(0, 400).replace(/\n/g, "\n> ") || "(no text emitted)"}\n\n`
    md += `Full transcript: \`tests/eval/transcripts/${r.scenario}.json\`\n\n---\n\n`
  }

  writeFileSync(join(process.cwd(), "docs", "QUALITY-REPORT-LIVE.md"), md)

  console.log(
    `\n${"=".repeat(60)}\nResults: ${passed}/${total} passed | ${totalTok.toLocaleString()} tokens | ${(totalMs / 1000).toFixed(1)}s wall`,
  )
  console.log(`Transcripts: ${TRANSCRIPT_DIR}/`)
  console.log(`Report: docs/QUALITY-REPORT-LIVE.md`)
  process.exit(passed === total ? 0 : 1)
}

main().catch((err) => {
  console.error("Eval-live crashed:", err)
  process.exit(2)
})
