import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { inngest } from "@/inngest/client";
import { convex } from "@/lib/convex-client";

import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

const requestSchema = z.object({
  conversationId: z.string(),
  message: z.string(),
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
  const { conversationId, message } = requestSchema.parse(body);

  // Constitution §17 — pre-operation quota check. Returns 429 + machine-readable
  // payload so the client toast can show "Upgrade to Pro" with actual numbers.
  const quota = await convex.query(api.plans.assertWithinQuotaInternal, {
    internalKey,
    userId,
    op: "agent_run",
  });
  if (!quota.ok) {
    return NextResponse.json(
      {
        error: "quota_exceeded",
        reason: quota.reason,
        limit: quota.limit,
        current: quota.current,
        upgradeUrl: "/pricing",
      },
      { status: 429 },
    );
  }

  // Call convex mutation, query
  const conversation = await convex.query(api.system.getConversationById, {
    internalKey,
    conversationId: conversationId as Id<"conversations">,
  });

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  const projectId = conversation.projectId;

  // Constitution §10 — only one in-flight message per conversation. The
  // client is expected to call /api/messages/cancel before re-submitting.
  const inFlight = await convex.query(
    api.system.getProcessingMessageInConversation,
    { internalKey, conversationId: conversationId as Id<"conversations"> },
  );
  if (inFlight) {
    return NextResponse.json(
      {
        error: "in_flight",
        messageId: inFlight._id,
        hint: "Cancel the in-flight message via /api/messages/cancel before sending a new one.",
      },
      { status: 409 },
    );
  }

  // Create user message
  await convex.mutation(api.system.createMessage, {
    internalKey,
    conversationId: conversationId as Id<"conversations">,
    projectId,
    role: "user",
    content: message,
  });

  // Create assistant message placeholder with processing status
  const assistantMessageId = await convex.mutation(
    api.system.createMessage,
    {
      internalKey,
      conversationId: conversationId as Id<"conversations">,
      projectId,
      role: "assistant",
      content: "",
      status: "processing",
    }
  );

  // Invoke inngest to process the message with agent
  const event = await inngest.send({
    name: "message/sent",
    data: {
      messageId: assistantMessageId,
      conversationId: conversationId as Id<"conversations">,
      projectId,
    },
  });

  return NextResponse.json({
    success: true,
    eventId: event.ids[0],
    messageId: assistantMessageId,
  });
};
