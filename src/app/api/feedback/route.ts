import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";

import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

/**
 * POST /api/feedback
 *
 * Forward a per-message thumbs up/down (with optional comment) to the
 * `response_feedback.submit` Convex mutation. The Convex mutation is itself
 * Clerk-auth gated (it calls `ctx.auth.getUserIdentity()`), so we mint a
 * short-lived Convex JWT from Clerk and attach it to a request-scoped
 * `ConvexHttpClient`. The shared `convex` singleton is unauthenticated and
 * cannot be used here.
 *
 * Body shape: { messageId: string, rating: "up" | "down", comment?: string }.
 */
const requestSchema = z.object({
    messageId: z.string(),
    rating: z.union([z.literal("up"), z.literal("down")]),
    comment: z.string().optional(),
});

export async function POST(request: Request) {
    const { userId, getToken } = await auth();

    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
        return NextResponse.json(
            { error: "Invalid request body", issues: parsed.error.flatten() },
            { status: 400 },
        );
    }

    const { messageId, rating, comment } = parsed.data;

    try {
        // The mutation is Clerk-auth gated server-side, so we forward the
        // caller's identity via a Convex JWT (template configured in Clerk).
        const token = await getToken({ template: "convex" });
        if (!token) {
            return NextResponse.json(
                { error: "Failed to mint Convex token" },
                { status: 500 },
            );
        }

        const client = new ConvexHttpClient(
            process.env.NEXT_PUBLIC_CONVEX_URL!,
        );
        client.setAuth(token);

        const feedbackId = await client.mutation(api.response_feedback.submit, {
            messageId: messageId as Id<"messages">,
            rating,
            comment,
        });

        return NextResponse.json({
            success: true,
            feedbackId,
        });
    } catch (error) {
        console.error("Failed to submit feedback:", error);
        return NextResponse.json(
            { error: "Failed to submit feedback" },
            { status: 500 },
        );
    }
}
