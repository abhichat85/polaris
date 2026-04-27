# E2B Image Bake — Polaris Sandbox Template

> **Authority:** D-029. The 4 `browser_*` agent tools require Playwright +
> Chromium preinstalled in the sandbox image. This runbook covers the
> one-time operator-side bake. After it's done, every new project
> sandbox boots with browser tools functional.

## Why a custom image

The default E2B `nextjs` template doesn't ship with Playwright. The four
browser tools (`browser_navigate`, `browser_screenshot`, `browser_click`,
`browser_inspect`) write a tiny Node script to `/tmp/` inside the
sandbox and execute it via `sandbox.exec("node /tmp/...cjs")`. The
script does `require("playwright")` — which fails without preinstall —
and the agent receives `BROWSER_NOT_AVAILABLE`.

Baking Playwright + Chromium into a custom image takes ~15 min once
and saves 30+ seconds per agent run (no per-run install).

## Prereqs

- E2B account with team access to publish templates
- E2B CLI installed: `npm install -g @e2b/cli`
- Authenticated: `e2b login`

## Steps

```bash
# 1. Create the template directory
mkdir polaris-e2b-template && cd polaris-e2b-template

# 2. e2b.toml
cat > e2b.toml <<'EOF'
template_id = "polaris-nextjs"
dockerfile = "e2b.Dockerfile"
team_id = "<YOUR-TEAM-ID>"
start_cmd = ""
EOF

# 3. Dockerfile — extend the official Node base
cat > e2b.Dockerfile <<'EOF'
FROM e2bdev/code-interpreter:latest

# Playwright + Chromium for the agent's browser_* tools (D-029).
# Pinned to a known-good version; bump deliberately.
RUN npm install -g playwright@1.49.0 \
    && npx playwright install chromium \
    && npx playwright install-deps chromium
EOF

# 4. Build + publish
e2b template build
```

After publish, the CLI prints the new template id (e.g.
`polaris-nextjs-abc123`).

## Wire the template into Polaris

Update `src/lib/sandbox/e2b-provider.ts` to use the new template id
when `SANDBOX_PROVIDER=e2b`:

```ts
const TEMPLATE_ID = process.env.E2B_TEMPLATE_ID ?? "polaris-nextjs"
// Pass to Sandbox.create({ template: TEMPLATE_ID })
```

Set `E2B_TEMPLATE_ID=polaris-nextjs-abc123` in the deploy env.

## Verification

After deploy, run an agent task that uses a browser tool:

```
ask Polaris: "Navigate to /products and screenshot the page"
```

Expected: the chat shows the screenshot inline. If it shows
`BROWSER_NOT_AVAILABLE`, the template id is wrong or the bake didn't
include Playwright.

## Rollback

If the new image breaks something, set `E2B_TEMPLATE_ID=nextjs`
(default) and redeploy. The browser_* tools fall back to
`BROWSER_NOT_AVAILABLE` and the agent adapts.

## Image size budget

Adding Playwright + Chromium adds ~350 MB to the image. If we ever
exceed 2 GB total, switch to Option 1 from D-029 (Playwright on a
separate worker pod with reverse-tunnel).

## Future bakes

Same Dockerfile pattern for additional tooling:

```dockerfile
# Future: bake `gh` CLI for github_* tools
RUN apt-get update && apt-get install -y gh

# Future: bake `supabase` CLI for supabase_* tools
RUN npm install -g supabase
```
