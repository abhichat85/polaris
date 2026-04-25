# Polaris Documentation

> Polaris is a spec-driven AI cloud IDE. Builds standalone at `build.praxiomai.xyz`. Strategically links to Praxiomai post-launch.

---

## Reading Order

Read in this order. Each document derives authority from the one above it.

### 1. `CONSTITUTION.md` — START HERE

The law of the land. 21 articles covering:
- What Polaris is and is not
- Product, architectural, and engineering principles
- The two abstraction interfaces (`ModelAdapter`, `SandboxProvider`)
- The agent loop and 6 tools
- File safety policy
- Consistency model (Convex first, E2B second)
- Data model
- All 4 error recovery layers
- Security threat model
- Performance budgets
- Testing philosophy
- Cost model and quotas
- Praxiom integration contract
- Migration plan from current state
- Decision log (every architectural choice with rationale)
- Amendment procedure

**Every contributor reads this in full before touching code.** The Constitution changes only via explicit amendment (Article XXI).

### 2. `ROADMAP.md` — Master Tactical Plan

When things happen and in what order:
- Goals and non-goals
- 10 sub-plans decomposition
- 17-day phase plan (Phase 1: Functional Core, Phase 2: Integrations, Phase 3: Hardening, Phase 4: Launch)
- Day 0 prerequisites checklist
- Risk register
- Definition of Done per phase
- Parallel execution strategy
- Open decisions (parking lot for v1.1+)

### 3. `plans/NN-name.md` — TDD-Grade Sub-Plans

The line-by-line WHAT for each subsystem. Written just-in-time before each phase starts.

| # | Sub-plan | Phase |
|---|---|---|
| 01 | Agent Loop | 1 |
| 02 | E2B Sandbox | 1 |
| 03 | Scaffolding | 1 |
| 04 | Streaming UI | 1 |
| 05 | Spec Panel | 1 |
| 06 | GitHub | 2 |
| 07 | Deploy | 2 |
| 08 | Billing | 2 |
| 09 | Hardening | 3 |
| 10 | Launch Prep | 4 |

Each sub-plan contains:
- Files to create / modify
- Step-by-step tasks (~2-5 min each)
- Code blocks for every change
- Test cases
- Commit boundaries

**For agentic workers:** Use `superpowers:subagent-driven-development` to execute each sub-plan task-by-task.

### 4. `archive/` — Historical Documents

Earlier drafts preserved for reference. Not authoritative.

---

## Document Hierarchy

```
CONSTITUTION.md       ← immutable principles, contracts, invariants
        ↓
ROADMAP.md           ← timeline, phases, risks (derived)
        ↓
plans/01-10          ← executable steps (derived)
        ↓
   actual code        ← (must conform to all of the above)
```

If a sub-plan conflicts with the Constitution, the Constitution wins. If the Constitution is wrong, amend it (see Article XXI). Never quietly violate.

---

## Quick Links

- **Mission, principles, contracts:** [CONSTITUTION.md](./CONSTITUTION.md)
- **Timeline and phases:** [ROADMAP.md](./ROADMAP.md)
- **Day 0 setup checklist:** [ROADMAP.md §5](./ROADMAP.md#5-day-0-prerequisites)
- **Risk register:** [ROADMAP.md §6](./ROADMAP.md#6-risk-register)
- **Decision log:** [CONSTITUTION.md Article XX](./CONSTITUTION.md#article-xx--decision-log)
- **Amendment procedure:** [CONSTITUTION.md Article XXI](./CONSTITUTION.md#article-xxi--amendment-procedure)
- **UI/UX design system:** [DESIGN-SYSTEM.md](./DESIGN-SYSTEM.md)

---

## Status

| Document | Status | Words | Last updated |
|---|---|---|---|
| `CONSTITUTION.md` | Ratified (v1.0, pending amendments — see OPEN-QUESTIONS.md) | 12,881 | 2026-04-26 |
| `ROADMAP.md` | Final | 4,548 | 2026-04-26 |
| `plans/01-agent-loop.md` | Final (gold-standard template) | 10,030 | 2026-04-26 |
| `plans/02-e2b-sandbox.md` | Final | 9,842 | 2026-04-26 |
| `plans/03-scaffolding.md` | Final | 9,834 | 2026-04-26 |
| `plans/04-streaming-ui.md` | Final | 8,171 | 2026-04-26 |
| `plans/05-spec-panel.md` | Final | 7,833 | 2026-04-26 |
| `plans/06-github.md` | Final | 10,431 | 2026-04-26 |
| `plans/07-deploy.md` | Final | 9,092 | 2026-04-26 |
| `plans/08-billing.md` | Final | 9,594 | 2026-04-26 |
| `plans/09-hardening.md` | Final | 11,056 | 2026-04-26 |
| `plans/10-launch-prep.md` | Final | 9,136 | 2026-04-26 |
| `OPEN-QUESTIONS.md` | Active — must resolve before relevant phase | — | 2026-04-26 |
| `DESIGN-SYSTEM.md` | Ratified — single source of truth for all UI/UX decisions | ~5,000 | 2026-04-26 |
| **Total** | | **~118K words** | |

---

*"Build Polaris correctly the first time, so we don't have to build it twice."*
