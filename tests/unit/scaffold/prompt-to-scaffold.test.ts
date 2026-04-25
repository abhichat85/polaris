import { describe, it, expect } from "vitest"
import { promptToScaffold } from "@/features/scaffold/lib/prompt-to-scaffold"
import type {
  AgentStep,
  Message,
  ModelAdapter,
  RunOptions,
  ToolDefinition,
} from "@/lib/agents/types"

class StubAdapter implements ModelAdapter {
  readonly name = "stub"
  receivedMessages: Message[][] = []

  constructor(private readonly response: string | (() => string | Error)) {}

  async *runWithTools(
    messages: Message[],
    _tools: ToolDefinition[],
    _opts: RunOptions,
  ): AsyncGenerator<AgentStep, void, void> {
    this.receivedMessages.push(messages.map((m) => ({ ...m })))
    let text: string
    if (typeof this.response === "function") {
      const r = this.response()
      if (r instanceof Error) {
        yield { type: "done", stopReason: "error", error: r.message }
        return
      }
      text = r
    } else {
      text = this.response
    }
    // Stream the response in chunks to simulate Claude
    for (const chunk of [text.slice(0, Math.floor(text.length / 2)), text.slice(Math.floor(text.length / 2))]) {
      if (chunk) yield { type: "text_delta", delta: chunk }
    }
    yield { type: "usage", inputTokens: 100, outputTokens: 200 }
    yield { type: "done", stopReason: "end_turn" }
  }
}

const goodResponse = JSON.stringify({
  summary: "A todo list app with Supabase auth.",
  files: [
    {
      path: "src/app/page.tsx",
      content: 'export default function Home() {\n  return <div>Todos</div>\n}\n',
    },
    {
      path: "src/app/todos/page.tsx",
      content: 'export default function Todos() {\n  return <ul />\n}\n',
    },
  ],
})

describe("promptToScaffold", () => {
  it("parses Claude's JSON response and returns merged files", async () => {
    const adapter = new StubAdapter(goodResponse)

    const result = await promptToScaffold("Build me a todo app", { adapter })

    expect(result.ok).toBe(true)
    if (result.ok) {
      // Generated files appear
      expect(result.files.find((f) => f.path === "src/app/todos/page.tsx")).toBeDefined()
      // Template files appear too
      expect(result.files.find((f) => f.path === "package.json")).toBeDefined()
      expect(result.files.find((f) => f.path === "tsconfig.json")).toBeDefined()
      // Generated overrides template placeholder for src/app/page.tsx
      const page = result.files.find((f) => f.path === "src/app/page.tsx")!
      expect(page.content).toContain("Todos")
    }
  })

  it("returns CLAUDE_PARSE_ERROR when output is not JSON", async () => {
    const adapter = new StubAdapter("This is not JSON at all.")
    const result = await promptToScaffold("anything", { adapter })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("CLAUDE_PARSE_ERROR")
  })

  it("returns CLAUDE_SCHEMA_VIOLATION when JSON does not match schema", async () => {
    const adapter = new StubAdapter(JSON.stringify({ summary: "x", files: [] }))
    const result = await promptToScaffold("anything", { adapter })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("CLAUDE_SCHEMA_VIOLATION")
  })

  it("returns POLICY_VIOLATION when Claude tries to write outside writable dirs", async () => {
    const adapter = new StubAdapter(
      JSON.stringify({
        summary: "x",
        files: [
          { path: ".github/workflows/deploy.yml", content: "name: deploy" },
          { path: "src/app/page.tsx", content: "ok" },
        ],
      }),
    )
    const result = await promptToScaffold("anything", { adapter })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("POLICY_VIOLATION")
  })

  it("strips markdown code fences if Claude wraps the JSON", async () => {
    const fenced = "```json\n" + goodResponse + "\n```"
    const adapter = new StubAdapter(fenced)
    const result = await promptToScaffold("anything", { adapter })
    expect(result.ok).toBe(true)
  })

  it("returns INVALID_PROMPT when prompt is empty/whitespace", async () => {
    const adapter = new StubAdapter("ignored")
    const result = await promptToScaffold("   ", { adapter })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("INVALID_PROMPT")
  })

  it("returns CLAUDE_TIMEOUT when adapter emits stopReason=error", async () => {
    const adapter = new StubAdapter(() => new Error("timeout"))
    const result = await promptToScaffold("anything", { adapter })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(["CLAUDE_TIMEOUT", "INTERNAL_ERROR"]).toContain(result.error.code)
    }
  })

  it("template files override Claude's locked-baseline emissions", async () => {
    const evil = JSON.stringify({
      summary: "evil",
      files: [
        { path: "package.json", content: '{"name":"hacked"}' },
        { path: "src/app/page.tsx", content: "ok" },
      ],
    })
    const adapter = new StubAdapter(evil)
    const result = await promptToScaffold("anything", { adapter })
    expect(result.ok).toBe(true)
    if (result.ok) {
      const pkg = result.files.find((f) => f.path === "package.json")!
      expect(pkg.content).not.toContain("hacked")
    }
  })
})
