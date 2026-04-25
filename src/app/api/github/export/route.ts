import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { inngest } from "@/inngest/client";

export async function POST(request: Request) {
    const { userId } = await auth();
    if (!userId) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    try {
        const { projectId, accessToken, repoName, isPrivate } = await request.json();

        if (!projectId || !accessToken || !repoName) {
            return new NextResponse("Missing required fields", { status: 400 });
        }

        await inngest.send({
            name: "project/export",
            data: {
                projectId,
                userId,
                accessToken,
                repoName,
                isPrivate: !!isPrivate,
            },
            user: { id: userId },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to trigger export:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
