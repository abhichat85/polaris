import { NextResponse } from "next/server";
import { exchangeGitHubCode } from "@/lib/github";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error || !code) {
        return new NextResponse(`Authentication failed: ${error || "No code"}`, {
            status: 400,
        });
    }

    try {
        const token = await exchangeGitHubCode(code);

        // Return HTML that posts the token back to the main window
        const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>GitHub Authentication Success</title>
        </head>
        <body>
          <p>Authentication successful! You can close this window.</p>
          <script>
            window.opener.postMessage({ type: "GITHUB_TOKEN", token: "${token}" }, window.location.origin);
            window.close();
          </script>
        </body>
      </html>
    `;

        return new NextResponse(html, {
            headers: {
                "Content-Type": "text/html",
            },
        });
    } catch (err) {
        console.error("GitHub Auth Error:", err);
        return new NextResponse("Authentication failed", { status: 500 });
    }
}
