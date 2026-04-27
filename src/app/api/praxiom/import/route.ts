/**
 * /api/praxiom/import — Praxiom spec import endpoint.
 *
 * Authority: CONSTITUTION §18 (Praxiom Integration Contract).
 *
 * v1 STUB. The full integration is intentionally deferred per §18.5
 * (Praxiom OAuth + spec sync arrives after the Polaris coding-agent
 * core is solid). Until then this route exists so:
 *   1. Frontend "Import from Praxiom" buttons can target a real URL
 *      and surface a clear "coming soon" rather than a 404.
 *   2. The route shape is locked in — when the implementation lands,
 *      it can ship behind the same path without a breaking change.
 *
 * Body shape (when implemented):
 *   {
 *     praxiomDocumentId: string,   // ULID of the spec doc in Praxiom
 *     projectId: Id<"projects">,   // target project — overwrites specs row
 *   }
 *
 * Response (today): 501 Not Implemented + tracking issue.
 */

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    {
      error: "praxiom_integration_pending",
      message:
        "Praxiom spec import lands after the Polaris coding-agent core is verified. See CONSTITUTION §18.5.",
      trackingIssue: "POL-18",
      praxiomUrl: "https://www.praxiomai.xyz",
    },
    { status: 501 },
  );
}
