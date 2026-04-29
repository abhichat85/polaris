# @polaris/agent-kit

Reusable agent-runtime primitives extracted from Polaris. The package
captures the parts of an agent loop that are *not* Polaris-specific:
contract evaluation, healing loops, stream monitoring, HITL gating,
override clamps, user profiles, the calibrator, the preference injector,
the `AgentRunner` itself, and the `AgentSink` abstraction it persists
through.

This is currently an in-tree workspace package (not yet published). The
private `package.json` exists so that the package boundary is visible to
tooling and downstream consumers can already import from
`@/lib/agent-kit` (or, when the move lands, from `@polaris/agent-kit`).

## Package boundary

The `core/` subdirectory is the hard boundary. Code under `core/` MUST NOT
import from:

- `convex` / `convex/*`
- `next` / `next/*`
- `@/lib/*` (the Polaris alias for non-agent-kit code)
- `@/features/*`, `@/components/*`, `@/app/*`

This is enforced by an ESLint rule scoped to `src/lib/agent-kit/core/**`
in the repo's flat config (`eslint.config.mjs`). Only relative imports
inside agent-kit itself are allowed in `core/`.

The other subdirectories are softer:

- `runtime/` — the `AgentRunner` orchestration. Same boundary as `core/`
  in spirit, but enforcement is lighter while the extraction settles.
- `sink/` — `AgentSink` implementations. The in-tree InMemoryAgentSink
  lives here; `ConvexAgentSink` stays in `@/lib/agents/convex-sink`
  until Convex types stabilize.
- `adapters/` — transition stub re-exporting the model adapters from
  `@/lib/agents/`. Will become the canonical home once their
  Polaris-specific deps (system-prompt, tool-meta) are split.
- `tools/` — transition stub re-exporting `@/lib/tools/types`. Same
  story: tool definitions will move once they're depolarized.

## Public surface

Major exports (see `index.ts` for the full list):

| Primitive            | Purpose                                                       |
| -------------------- | ------------------------------------------------------------- |
| `Contract<T>`        | Schema + verifier for a typed agent output                    |
| `HealingLoop`        | Self-correction loop driven by a `Contract`                   |
| `StreamMonitor`      | Real-time alerts (loops, dead-ends) over a streaming response |
| `HITLGate`           | Human-in-the-loop checkpoint enforcement                      |
| `OverrideClamps`     | Bound model override params to safe per-plan ranges           |
| `UserProfile`        | Mined preferences + persona                                   |
| `Calibrator`         | Scales scores against ground-truth labels                     |
| `PreferenceInjector` | Renders learned preferences into the system prompt            |
| `AgentRunner`        | Orchestrates the agent loop (model + tools + sink)            |
| `AgentSink`          | Side-effect persistence (text/tool/usage/checkpoint)          |
| `InMemoryAgentSink`  | Deterministic in-memory sink for tests                        |

## Wiring example

Minimal end-to-end shape: an `AgentRunner` driven by a scripted adapter,
backed by an `InMemoryAgentSink`.

```ts
import { AgentRunner } from "@/lib/agent-kit/runtime"
import { InMemoryAgentSink } from "@/lib/agent-kit/sink"
import type {
  AgentSink,
  AgentStep,
  Message,
  ModelAdapter,
  RunOptions,
  ToolDefinition,
} from "@/lib/agent-kit/core"

// Trivial adapter that always returns a single text block then stops.
const adapter: ModelAdapter = {
  name: "echo",
  async *runWithTools(
    _messages: Message[],
    _tools: ToolDefinition[],
    _opts: RunOptions,
  ): AsyncGenerator<AgentStep, void, void> {
    yield { type: "text_delta", delta: "hello" }
    yield {
      type: "stop",
      stopReason: "end_turn",
      usage: { inputTokens: 1, outputTokens: 1 },
    }
  },
}

const sink: AgentSink = new InMemoryAgentSink()

// Then construct the runner with your tool executor + budget; see
// `tests/unit/agents/agent-runner.test.ts` for the full wiring.
```

## Tests

Each primitive has a focused unit test under `tests/unit/agents/`:

- `agent-runner.test.ts`         — `AgentRunner` end-to-end loop
- `sink-contract.test.ts`        — shared `AgentSink` contract
- `contract.test.ts`             — `Contract<T>` parsing + verification
- `healing.test.ts`              — `HealingLoop` self-correction
- `stream-monitor.test.ts`       — `StreamMonitor` alert firing
- `hitl.test.ts`                 — `HITLGate` checkpoint flow
- `override-clamps.test.ts`      — `OverrideClamps` per-plan bounds
- `user-profile.test.ts`         — `UserProfile` mining
- `calibrator.test.ts`           — `Calibrator` score scaling
- `preference-injector.test.ts`  — `PreferenceInjector` rendering
- `sse.test.ts`                  — SSE parser
- `types.test.ts`                — public type smoke tests
- `telemetry.test.ts`            — `StreamAlert` shape
- `tool-meta.test.ts`            — tool descriptor metadata
- `checkpoint-codec.test.ts`     — checkpoint serialization

## Related docs

- `CHANGELOG.md` — released versions and changes
- `CONSTITUTION.md` (repo root) — Articles VI–VIII govern the runtime
  abstractions this package implements.
