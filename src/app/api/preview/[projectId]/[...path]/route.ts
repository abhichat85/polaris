import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { convex } from "@/lib/convex-client";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";

const MIME_TYPES: Record<string, string> = {
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
    json: "application/json",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    svg: "image/svg+xml",
    gif: "image/gif",
    txt: "text/plain",
    md: "text/markdown",
};

export async function GET(
    request: Request,
    { params }: { params: { projectId: string; path: string[] } }
) {
    const { userId } = await auth();

    if (!userId) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const { projectId, path } = params;
    const filePath = path.join("/");

    try {
        const file = await convex.query(api.files.getFileByPath, {
            projectId: projectId as Id<"projects">,
            path: filePath,
        });

        if (!file) {
            return new NextResponse("File not found", { status: 404 });
        }

        // Binary file (image, etc.) - redirect to signed URL
        if (file.url) {
            return NextResponse.redirect(file.url);
        }

        const extension = file.name.split(".").pop()?.toLowerCase() || "txt";
        const contentType = MIME_TYPES[extension] || "text/plain";

        return new NextResponse(file.content || "", {
            headers: {
                "Content-Type": contentType,
                // Add minimal security headers for preview
                "X-Frame-Options": "SAMEORIGIN",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (error) {
        console.error("Preview error:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
