/**
 * Verify the workspace backfill ran cleanly. Authority: D-020.
 *
 *   npx convex run "migrations/verify_workspace_backfill:run"
 *
 * Returns `{ unscoped, total }`. When `unscoped == 0` for a sustained
 * window, we can promote `projects.workspaceId` to required (drop the
 * `v.optional` wrapper in `convex/schema.ts`). Until then the field
 * stays optional so legacy data keeps validating.
 */

import { internalQuery } from "../_generated/server"

export const run = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("projects").collect()
    const unscoped = all.filter((p) => !p.workspaceId).length
    return {
      total: all.length,
      unscoped,
      readyToPromoteRequired: unscoped === 0,
    }
  },
})
