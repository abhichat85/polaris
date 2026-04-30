import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { inngest } from "@/inngest/client";
import { convex } from "@/lib/convex-client";

import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

const requestSchema = z.object({
  sessionId: z.string(),
  answers: z.array(
    z.object({
      questionId: z.string(),
      answer: z.string(),
    })
  ),
  conversationId: z.string(),
  projectId: z.string(),
  userId: z.string().optional(),
});

export async function POST(request: Request) {
  const { userId: authUserId } = await auth();

  if (!authUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY;

  if (!internalKey) {
    return NextResponse.json(
      { error: "Internal key not configured" },
      { status: 500 }
    );
  }

  const body = await request.json();
  const { sessionId, answers, conversationId, projectId } =
    requestSchema.parse(body);

  const actualUserId = authUserId;

  await convex.mutation(api.prompt_enrichment.saveAnswers, {
    internalKey,
    sessionId: sessionId as Id<"prompt_enrichment_sessions">,
    answers,
  });

  await inngest.send({
    name: "prompt-enrichment/score",
    data: { sessionId, conversationId, projectId, userId: actualUserId },
  });

  return NextResponse.json({ ok: true });
}
