import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { inngest } from "@/inngest/client";
import { convex } from "@/lib/convex-client";
import { rateLimitOr429 } from "@/lib/rate-limit/middleware";

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

  // PERF — these four pre-flight reads have no inter-dependencies,
  // so we fan them out in parallel. On a cold Convex dev deployment
  // each round-trip can be ~1s; the previous sequential layout
  // accumulated to >10s and tripped the client ky timeout.
  // Order in original code was customer → quota → conversation → in-flight;
  // here we parallelize and preserve the same set of failure responses.
  const [customer, quota, conversation, inFlight] = await Promise.all([
    convex.query(api.customers.getByUser, { userId }),
    convex.query(api.plans.assertWithinQuotaInternal, {
      internalKey,
      userId,
      op: "agent_run",
    }),
    convex.query(api.system.getConversationById, {
      internalKey,
      conversationId: conversationId as Id<"conversations">,
    }),
    convex.query(api.system.getProcessingMessageInConversation, {
      internalKey,
      conversationId: conversationId as Id<"conversations">,
    }),
  ]);

  // §13.4 — burst protection. Rate-limit check uses customer.plan;
  // sequential because it depends on `customer` above. Upstash REST is
  // fast (<100ms typical) so this single trip is cheap.
  const blocked = await rateLimitOr429({
    userId,
    bucket: "agentRun",
    plan: customer?.plan ?? "free",
  });
  if (blocked) return blocked;

  // Constitution §17 — quota gate.
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

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }

  const projectId = conversation.projectId;

  // Constitution §10 — only one in-flight message per conversation.
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

  // PERF — three independent writes/reads we can fan out:
  //   1. Insert the user message (write)
  //   2. Insert the assistant placeholder (write)
  //   3. Check for an existing plan (read) → drives plan/run vs agent/run
  // Convex serialises mutations to the same documents internally, so this
  // is safe; we just save 2× round-trip latency.
  const [, assistantMessageId, existingPlan] = await Promise.all([
    convex.mutation(api.system.createMessage, {
      internalKey,
      conversationId: conversationId as Id<"conversations">,
      projectId,
      role: "user",
      content: message,
    }),
    convex.mutation(api.system.createMessage, {
      internalKey,
      conversationId: conversationId as Id<"conversations">,
      projectId,
      role: "assistant",
      content: "",
      status: "processing",
    }),
    // D-026 — first-message-of-project triggers the Planner. The Planner
    // produces /docs/plan.md + the structured spec; the user reviews +
    // edits in the plan pane; clicking "Start build" then fires `agent/run`.
    convex.query(api.specs.getPlan, { projectId }),
  ]);

  const isFirstMessage = !existingPlan;

  if (isFirstMessage) {
    // Plan path. The placeholder assistant message gets filled in by the
    // plan/run completion step.
    const event = await inngest.send({
      name: "plan/run",
      data: {
        messageId: assistantMessageId,
        conversationId: conversationId as Id<"conversations">,
        projectId,
        userId,
        userPrompt: message,
      },
    });

    return NextResponse.json({
      success: true,
      mode: "planning",
      eventId: event.ids[0],
      messageId: assistantMessageId,
    });
  }

  // D-018, Article XIX migration — emit `agent/run` (handled by the
  // new agent-loop with E2B sandbox lifecycle + run_command + streaming).
  const event = await inngest.send({
    name: "agent/run",
    data: {
      messageId: assistantMessageId,
      conversationId: conversationId as Id<"conversations">,
      projectId,
      userId,
    },
  });

  return NextResponse.json({
    success: true,
    mode: "agent",
    eventId: event.ids[0],
    messageId: assistantMessageId,
  });
};
