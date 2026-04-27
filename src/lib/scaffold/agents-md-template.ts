/**
 * D-030 — starter AGENTS.md dropped into every scaffolded project.
 *
 * Authority: OpenAI Harness Engineering — "AGENTS.md is a 100-line
 * table-of-contents, not an encyclopedia."
 *
 * The Generator agent reads this file at the start of every session.
 * Power users edit it to teach Polaris their conventions.
 */

export const STARTER_AGENTS_MD = `# Project Map for AI Agents

This file is the table-of-contents for this project. Always read it
first when working on a new task. Keep it ~100 lines.

## Architecture

- See \`docs/ARCHITECTURE.md\` for the system-level diagram.
- See \`docs/DESIGN.md\` for visual + interaction design tokens.
- See \`docs/plan.md\` for the active build plan (sprint-grouped features).
- See \`.polaris/notes.md\` for durable agent-authored notes.

## Conventions

- **Boundaries are typed.** All API request/response shapes use Zod.
- **No magic strings.** Routes + table names + env-var keys are constants.
- **Tests live next to source.** \`foo.ts\` ↔ \`foo.test.ts\`.
- **Components in \`src/components\`,** pages in \`src/app\`.
- **Surface tokens, not raw hex.** Praxiom Design System §1–§14.

## Locked paths

The agent must NEVER edit:

- \`/package.json\` — use \`run_command(\"npm install <pkg>\")\` instead.
- \`/.env*\` files — managed by the user / deploy pipeline.
- \`/.git/\`, \`/node_modules/\`, \`/.next/\`, \`/dist/\`.

## Preferred tools

- File ops: \`edit_file\` for surgical edits (always read before editing);
  \`write_file\` only for new files or full rewrites.
- Shell: \`run_command\` for npm install / test / build. NEVER for
  \`npm run dev\` (already running in the sandbox).
- Plan tracking: \`set_feature_status\` AS YOU SHIP each feature.
- (When available) \`browser_*\` tools for visual verification.

## Local commands worth knowing

- \`npm run build\` — compile the app, fail on TS errors.
- \`npm test\` — run unit tests.
- \`npm run lint\` — ESLint. Fix violations before declaring "done".

## How this file evolves

When the user asks for a new convention, add it here. When you discover
a project quirk worth remembering across sessions, add it to
\`.polaris/notes.md\` (terser, more transient than this file).
`
