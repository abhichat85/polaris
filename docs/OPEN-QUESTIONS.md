# Open Questions

> Issues surfaced during sub-plan authoring that need resolution before or during the relevant phase. Some are Constitutional bugs (must amend before sub-plan is executed); others are research items (verify in dev before committing); others are policy decisions (operator must decide).

**Last updated:** 2026-04-26 (CB-1 resolved)

---

## Severity legend

- **🔴 BLOCKER** — Must resolve before the affected sub-plan is executed. Constitutional amendment likely required.
- **🟡 VERIFY** — Research or empirical validation needed; pick a default, validate in dev, adjust if wrong.
- **🟢 POLICY** — Operator decision; no architectural impact.

---

## 🔴 BLOCKERS (Constitutional Amendments)

### ✅ RESOLVED — CB-1: Convex schema should use typed validators, not JSON-serialized strings

**Resolved:** 2026-04-26 | **Decision Log:** D-016
**Resolution:** Amended `CONSTITUTION.md` §11.2 — all three tables now specify typed Convex validators with explicit `defineTable` code blocks:
- `agent_checkpoints.messages` → `v.array(v.object({ role, content, toolCallId?, toolName? }))`
- `messages.toolCalls` → `v.array(v.object({ id, name, input, status, output?, error? }))`
- `specs.features` → `v.array(v.object({ id, title, description, acceptanceCriteria, status, priority, praxiomEvidenceIds? }))`
Sub-plans 01, 04, 05 must implement these validators as specified.

### CB-2: Index name collision risk between sub-plans 01 and 04

**Affected:** `convex/schema.ts` — `files` table
**Surfaced by:** Sub-plan 04
**Issue:** Sub-plan 01 adds `by_project_path` index. Sub-plan 04 may add `by_project_updated` for "recently changed files" subscription. Need to confirm both ship and don't conflict.
**Fix:** Coordinate during Day 2 schema-migration step. Both indexes are valid; just register both in one PR.

---

## 🟡 VERIFY (Research / Empirical Validation)

### V-1: E2B `SandboxOptions.ram` not natively supported per-call

**Affected:** Sub-plan 02 Task 2
**Surfaced by:** Sub-plan 02
**Issue:** E2B SDK doesn't accept `ram` per `Sandbox.create()` call. Currently routed through `metadata.ram` and applied via template configuration.
**Fix path:** Verify in E2B dev account whether per-call resource sizing is exposed in 2026 SDK. If not, plan to use multiple templates (`nextjs-supabase-512mb`, `nextjs-supabase-2gb`) instead.
**Decision deadline:** Day 2 (sub-plan 02 implementation).

### V-2: Convex action → Inngest ingest reachability

**Affected:** Sub-plan 02 Task 13 (file-changed event from editor save)
**Surfaced by:** Sub-plan 02
**Issue:** When user types in editor → Convex `files:write` mutation fires → we want to dispatch Inngest event for E2B sync. Question: can Convex actions `fetch()` Inngest's `inn.gs` ingest endpoint reliably (network egress allowed)?
**Fix path:** Test in dev. If blocked, fall back to: Next.js API route receives Convex webhook, then dispatches Inngest event.
**Decision deadline:** Day 2.

### V-3: Sandbox sync queue concurrency cap (4 per project)

**Affected:** Sub-plan 02 Task 19
**Surfaced by:** Sub-plan 02
**Issue:** When user types fast in editor, multiple `file/changed` events queue. Current cap is 4 concurrent E2B writes per project. May need tuning based on observed E2B latency.
**Fix path:** Default to 4. Monitor in Sentry. Adjust based on data.
**Decision deadline:** End of Phase 1 (Day 4).

### V-4: Scaffolding base template count (19 vs 25-35)

**Affected:** Sub-plan 03
**Surfaced by:** Sub-plan 03
**Issue:** Original brief specified 25-35 base files; sub-plan 03 ships 19 to leave headroom under `MAX_GENERATED_FILES=60`.
**Fix path:** 19 is defensible (lean template, more room for Claude's generated files). Test in dev: do scaffolds consistently produce reasonable apps? If under-rendered, expand template.
**Decision deadline:** Day 2-3 (when scaffold is tested end-to-end).

### V-5: shadcn primitives Claude generates aren't statically validated

**Affected:** Sub-plan 03
**Surfaced by:** Sub-plan 03
**Issue:** When Claude generates new shadcn components, we don't typecheck them at scaffold time. Errors surface only when sandbox runs `npm run dev`.
**Fix path:** Accept for v1. Sub-plan 09 hardening could add a typecheck step before declaring scaffold complete.
**Decision deadline:** Day 11 (during hardening).

### V-6: Supabase Management API SQL execution endpoint

**Affected:** Sub-plan 07 Task 10 (run migrations)
**Surfaced by:** Sub-plan 07
**Issue:** Sub-plan 07 assumes `POST /v1/projects/{ref}/database/query` is stable. Alternative paths exist (deprecated `pg-meta`, custom RPC).
**Fix path:** Validate in Supabase dev account before Day 6. If endpoint changes, swap to alternative.
**Decision deadline:** Day 6.

### V-7: Vercel `setEnvVars` 409 (already-exists) handling

**Affected:** Sub-plan 07 Task 7
**Surfaced by:** Sub-plan 07
**Issue:** Sub-plan currently swallows 409 errors when env var already exists. On redeploy with rotated keys, this would skip the update.
**Fix path:** Change to: GET existing env vars first, then PATCH-overwrite by env-var-id when present. Ensures key rotation works.
**Decision deadline:** Day 6.

### V-8: Edge-runtime `AsyncLocalStorage` reliability for trace propagation

**Affected:** Sub-plan 09 Task 3
**Surfaced by:** Sub-plan 09
**Issue:** Trace ID propagation via Node `AsyncLocalStorage` works in Node runtime but is unreliable in Edge runtime under load.
**Fix path:** Default to ALS; if Edge-runtime traces show gaps, switch to explicit traceId threading via function arguments.
**Decision deadline:** Day 11.

### V-9: Upstash Redis latency under load

**Affected:** Sub-plan 09 Task 9
**Surfaced by:** Sub-plan 09
**Issue:** HTTP-bucket rate limit check adds ~20-50ms per request via Upstash. May pressure performance budgets in Article XIV.
**Fix path:** Measure actual latency in dev. If P95 > 50ms, switch to in-memory rate limiter for HTTP bucket (with per-instance limits) and use Upstash only for cross-instance buckets.
**Decision deadline:** Day 11.

### V-10: Real-Anthropic e2e cost in CI

**Affected:** Sub-plan 09 Task 18-22 (Playwright e2e)
**Surfaced by:** Sub-plan 09
**Issue:** Running 5 e2e tests against real Anthropic API on every PR could cost $5-20/PR. Adds up.
**Fix path:** Two options: (a) Mock Anthropic in CI, run real-API e2e nightly. (b) `[skip ci]` opt-in for expensive paths. Default: (a).
**Decision deadline:** Day 12.

### V-11: `detectMessageRepeat` false-positive risk

**Affected:** Sub-plan 09 Task 11 (abuse signals)
**Surfaced by:** Sub-plan 09
**Issue:** Abuse heuristic "same prompt 3x in 10min" may false-positive on legitimate retries.
**Fix path:** Tune threshold based on observed beta data. Make it advisory (Sentry alert) before it becomes blocking.
**Decision deadline:** Day 14 (post-soft-launch).

### V-12: In-process circuit breaker is per-worker

**Affected:** Sub-plan 09 Task 14
**Surfaced by:** Sub-plan 09
**Issue:** Circuit breaker state lives in process memory; Vercel functions scale horizontally so each worker has its own state. A globally-degraded API may not trigger CB until enough workers see failures.
**Fix path:** Accept for v1. Distributed CB (via Upstash) is v1.1.
**Decision deadline:** v1.1 planning.

### V-13: ULID collision math for trace IDs

**Affected:** Sub-plan 09 Task 3
**Surfaced by:** Sub-plan 09
**Issue:** ULID has very low collision probability for our scale; safe for v1. Revisit if trace IDs become primary keys.
**Decision deadline:** When/if traces become primary keys.

### V-14: Redaction regex completeness

**Affected:** Sub-plan 09 Task 5
**Surfaced by:** Sub-plan 09
**Issue:** Redaction patterns cover known secret formats. New providers introduce new key formats.
**Fix path:** Quarterly audit cadence — review redaction patterns against current secret formats.
**Decision deadline:** Quarterly recurring.

### V-15: Vercel deploy concurrency policy

**Affected:** Sub-plan 07
**Surfaced by:** Sub-plan 07
**Issue:** Currently rejects concurrent deploys for same project with 409. Alternative: queue silently.
**Fix path:** Reject is more honest UX. Keep current behavior.
**Decision deadline:** Resolved (reject).

### V-16: Vercel Prism mock fidelity

**Affected:** Sub-plan 09 Task 21 (deploy e2e)
**Surfaced by:** Sub-plan 09
**Issue:** Mocked Vercel responses may drift from real API behavior over time.
**Fix path:** Run a nightly cron against real Vercel API to detect drift; alert on schema changes.
**Decision deadline:** Day 12.

---

## 🟢 POLICY (Operator Decisions)

### P-1: Stripe API version pinning policy

**Affected:** Sub-plan 08
**Surfaced by:** Sub-plan 08
**Issue:** Pinned to `2025-09-30.basil`. Need policy for when to bump.
**Decision needed:** Bump on major Stripe webhook event additions; otherwise quarterly review.

### P-2: Team plan multi-seat support

**Affected:** Sub-plan 08
**Surfaced by:** Sub-plan 08
**Issue:** v1 ships team plan as single-seat. Multi-seat (`orgId`) deferred.
**Decision needed:** Confirm v1.1 priority. If team plan sees demand, prioritize multi-seat early in v1.1.

### P-3: ToS jurisdiction for legal pages

**Affected:** Sub-plan 10
**Surfaced by:** Sub-plan 10
**Issue:** ToS dispute resolution clause needs counsel input.
**Decision needed:** Engage lawyer before Day 15.

### P-4: BetterStack on-call phone for SMS alerts

**Affected:** Sub-plan 10
**Surfaced by:** Sub-plan 10
**Decision needed:** Provide phone number Day 16.

### P-5: Resend vs nodemailer for deletion emails

**Affected:** Sub-plan 10
**Surfaced by:** Sub-plan 10
**Issue:** Default is Resend ($20/month for low volume). Nodemailer + SES is cheaper but more setup.
**Decision needed:** Confirm Resend on Day 15.

### P-6: Welcome email copy

**Affected:** Sub-plan 10
**Surfaced by:** Sub-plan 10
**Decision needed:** Founder review of welcome email copy before beta sends.

### P-7: Account-deletion token storage location

**Affected:** Sub-plan 10
**Surfaced by:** Sub-plan 10
**Issue:** `setDeletionToken` / `consumeDeletionToken` helpers; storage location TBD (`user_profiles` vs dedicated table).
**Decision needed:** Schema decision Day 15. Default: `user_profiles.deletionToken` field.

### P-8: GitHub branch policy for push

**Affected:** Sub-plan 06
**Surfaced by:** Sub-plan 06
**Issue:** v1 only pushes to user-supplied branches; no auto-create. "Create new repo" path explicitly deferred.
**Decision needed:** Confirm v1.1 priority for "create new repo from Polaris" feature.

### P-9: Schema additive migrations approval

**Affected:** Sub-plan 06
**Surfaced by:** Sub-plan 06
**Issue:** Sub-plan 06 adds `projects.exportFindings` field and extended `exportStatus` values (`"pushing"`, `"blocked_secrets"`).
**Decision needed:** Approve schema additions during Day 5 schema review.

### P-10: SUPABASE_ORG_ID model

**Affected:** Sub-plan 07
**Surfaced by:** Sub-plan 07
**Issue:** Sub-plan assumes single Polaris-org Supabase model (we provision projects on our org). Alternative: per-tenant orgs.
**Decision needed:** Confirm single-org model. (Default: yes, single org — simpler, supports our cost model.)

---

## Resolution Process

For each open question:

1. **Owner** = whoever is implementing the affected sub-plan, OR operator (for policy items).
2. **Resolution** logged inline in the sub-plan as a numbered `OQ-N` reference.
3. **Constitutional amendments** (🔴 items) follow Article XXI procedure.
4. **This document is updated** as items resolve — change severity to ✅ RESOLVED with date and decision.

## Currently Resolved

| ID | Title | Date | Decision |
|---|---|---|---|
| CB-1 | Convex schema typed validators | 2026-04-26 | Use `v.array(v.object(...))` — never `v.string()` for structured arrays. See D-016. |
