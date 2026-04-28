import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { inngest } from "@/inngest/client";
import { convex } from "@/lib/convex-client";

import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

const requestSchema = z.object({
    messageId: z.string(),
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
    const { messageId } = requestSchema.parse(body);

    try {
        // Send cancel event to Inngest so agentLoop's cancelOn fires.
        // agentLoop listens for "agent/cancel"; "message/cancel" was wrong.
        await inngest.send({
            name: "agent/cancel",
            data: {
                messageId: messageId as Id<"messages">,
            },
        });

        // Update message status to cancelled in Convex
        await convex.mutation(api.system.cancelMessage, {
            internalKey,
            messageId: messageId as Id<"messages">,
        });

        return NextResponse.json({
            success: true,
            message: "Message cancelled successfully",
        });
    } catch (error) {
        console.error("Failed to cancel message:", error);
        return NextResponse.json(
            { error: "Failed to cancel message" },
            { status: 500 }
        );
    }
}
