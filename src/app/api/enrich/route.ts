import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { inngest } from "@/inngest/client";
import { convex } from "@/lib/convex-client";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

const requestSchema = z.object({
  conversationId: z.string(),
  projectId: z.string(),
  prompt: z.string().min(1).max(10000),
});

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
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
  const { conversationId, projectId, prompt } = requestSchema.parse(body);

  const sessionId = await convex.mutation(api.prompt_enrichment.create, {
    internalKey,
    conversationId: conversationId as Id<"conversations">,
    projectId: projectId as Id<"projects">,
    userId,
    rawPrompt: prompt,
  });

  await inngest.send({
    name: "prompt-enrichment/score",
    data: { sessionId, conversationId, projectId, userId },
  });

  return NextResponse.json({ sessionId });
}
