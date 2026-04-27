/**
 * E2E: /api/praxiom/import returns 501 with the documented stub shape.
 * Authority: CONSTITUTION §18.5.
 *
 * Unauthenticated requests get 401 (Clerk gate). To verify the stub
 * itself a Clerk session is needed; for now we assert the route exists
 * and answers (vs. a 404 from a misrouted file).
 */

import { test, expect } from "@playwright/test"

test("/api/praxiom/import is reachable (returns 401 unauth or 501 stub)", async ({
  request,
}) => {
  const res = await request.post("/api/praxiom/import", {
    data: { projectId: "test", praxiomDocumentId: "01HX" },
  })
  // Either 401 (Clerk rejected) or 501 (stub) — anything else means routing broke.
  expect([401, 501]).toContain(res.status())
})
