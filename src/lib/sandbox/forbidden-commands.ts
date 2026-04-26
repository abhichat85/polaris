/**
 * Patterns the agent may NEVER execute via `run_command`.
 * Authority: CONSTITUTION §8.4. Adding a pattern is allowed; removing one
 * requires a constitutional amendment.
 *
 * Why these three:
 *  - `sudo`            : the sandbox is single-user; privilege escalation is
 *                        always wrong here.
 *  - `rm -rf /`        : nukes the sandbox root. Removing project files
 *                        belongs to `delete_file` which goes through Convex.
 *  - `npm run dev`     : the sandbox lifecycle owns the dev server (§8.5).
 *                        A second `npm run dev` would race the lifecycle.
 */

export const FORBIDDEN_COMMAND_PATTERNS: readonly RegExp[] = [
  /(^|\s|;|&&|\|\|)\s*sudo\b/i,
  /\brm\s+-rf\s+\/(\s|$|;|&|\|)/i,
  /(^|\s|;|&&|\|\|)\s*(npm|pnpm|yarn|bun)\s+(run\s+)?dev\b/i,
]

export function isForbiddenCommand(cmd: string): boolean {
  return FORBIDDEN_COMMAND_PATTERNS.some((re) => re.test(cmd))
}
