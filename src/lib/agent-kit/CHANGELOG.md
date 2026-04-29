# Changelog

All notable changes to `@polaris/agent-kit` are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-04-30

### Added

- Initial extraction from Polaris into `src/lib/agent-kit/`.
- Workspace `package.json` (`@polaris/agent-kit`, private, in-tree).
- Core primitives in `core/`:
  - `Contract<T>` — typed output schema + verifier.
  - `HealingLoop` — `Contract`-driven self-correction loop.
  - `StreamMonitor` — real-time alerts (loop / dead-end / stall) over
    a streaming model response.
  - `HITLGate` — human-in-the-loop checkpoint enforcement.
  - `OverrideClamps` — per-plan bounds on model override params.
  - `UserProfile` — mined preferences + persona shape.
  - `Calibrator` — score-vs-ground-truth scaling.
  - `PreferenceInjector` — renders learned preferences into the
    system prompt.
  - `AgentSink` interface — side-effect persistence abstraction.
  - SSE parser (`sse.ts`), telemetry types (`telemetry.ts`),
    tool-layer types (`tool-types.ts`), context shape (`context.ts`),
    and verify-types (`verify-types.ts`).
- `runtime/AgentRunner` — orchestrates the agent loop against a
  `ModelAdapter`, a tool executor, and an `AgentSink`. Plan-aware
  budgets (free / pro / team) and 4-layer error recovery as per
  CONSTITUTION §12.
- `sink/InMemoryAgentSink` — deterministic in-memory sink for tests.
- ESLint rule (in `eslint.config.mjs`) enforcing the `core/**`
  package boundary: no imports from `convex/*`, `next/*`,
  `@/lib/*` (non-agent-kit), `@/features/*`, `@/components/*`,
  `@/app/*`.
- Transition shims at `adapters/` and `tools/` that re-export the
  current Polaris-side adapters and tool types so downstream code can
  start importing from agent-kit immediately. The shims will collapse
  into direct implementations once the Polaris-specific dependencies
  of those modules are factored out.
- Shared `AgentSink` contract test at
  `tests/unit/agents/sink-contract.test.ts` so any new sink
  implementation can be plugged into the same behavioural assertions.
- README + this CHANGELOG.

### Notes

- This release is purely a structural extraction: no runtime behaviour
  has changed for callers that continue to use `@/lib/agents/*`.
- ConvexAgentSink, the model adapters, and the tool definitions remain
  in `@/lib/agents/` and `@/lib/tools/` for now and are scheduled to
  move in a follow-up release once their Polaris-specific dependencies
  are split out.
