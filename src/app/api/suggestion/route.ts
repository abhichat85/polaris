/**
 * /api/suggestion — inline code completion at the cursor.
 *
 * Authority: Constitution D-007 — no Vercel AI SDK. Uses the raw
 * `@anthropic-ai/sdk` directly. Structured output is enforced by asking
 * Claude to return strict JSON and parsing with the existing Zod schema.
 */

import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { rateLimitOr429 } from "@/lib/rate-limit/middleware";
import { convex } from "@/lib/convex-client";
import { api } from "../../../../convex/_generated/api";

const suggestionSchema = z.object({
  suggestion: z
    .string()
    .describe(
      "The code to insert at cursor, or empty string if no completion needed",
    ),
});

const SUGGESTION_PROMPT = `You are a code suggestion assistant.

<context>
<file_name>{fileName}</file_name>
<previous_lines>
{previousLines}
</previous_lines>
<current_line number="{lineNumber}">{currentLine}</current_line>
<before_cursor>{textBeforeCursor}</before_cursor>
<after_cursor>{textAfterCursor}</after_cursor>
<next_lines>
{nextLines}
</next_lines>
<full_code>
{code}
</full_code>
</context>

<instructions>
Follow these steps IN ORDER:

1. First, look at next_lines. If next_lines contains ANY code, check if it continues from where the cursor is. If it does, return empty string immediately - the code is already written.

2. Check if before_cursor ends with a complete statement (;, }, )). If yes, return empty string.

3. Only if steps 1 and 2 don't apply: suggest what should be typed at the cursor position, using context from full_code.

Your suggestion is inserted immediately after the cursor, so never suggest code that's already in the file.

Respond with ONLY a JSON object on a single line, no prose, no markdown fence:
{"suggestion": "<your code or empty string>"}
</instructions>`;

const anthropic = new Anthropic();

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // §13.4 — burst limit on autocompletion. Suggestion ≠ agentRun bucket.
    const customer = await convex.query(api.customers.getByUser, { userId });
    const blocked = await rateLimitOr429({
      userId,
      bucket: "httpGlobal",
      plan: customer?.plan ?? "free",
    });
    if (blocked) return blocked;

    const {
      fileName,
      code,
      currentLine,
      previousLines,
      textBeforeCursor,
      textAfterCursor,
      nextLines,
      lineNumber,
    } = await request.json();

    if (!code) {
      return NextResponse.json(
        { error: "Code is required" },
        { status: 400 },
      );
    }

    const prompt = SUGGESTION_PROMPT
      .replace("{fileName}", fileName)
      .replace("{code}", code)
      .replace("{currentLine}", currentLine)
      .replace("{previousLines}", previousLines || "")
      .replace("{textBeforeCursor}", textBeforeCursor)
      .replace("{textAfterCursor}", textAfterCursor)
      .replace("{nextLines}", nextLines || "")
      .replace("{lineNumber}", lineNumber.toString());

    const response = await anthropic.messages.create({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    // Extract first text block (Anthropic returns a content array).
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ suggestion: "" });
    }

    // Strip any accidental markdown fences and parse JSON.
    const raw = textBlock.text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Model returned bare text — treat as the suggestion itself.
      return NextResponse.json({ suggestion: raw });
    }

    const result = suggestionSchema.safeParse(parsed);
    if (!result.success) {
      return NextResponse.json({ suggestion: "" });
    }

    return NextResponse.json({ suggestion: result.data.suggestion });
  } catch (error) {
    console.error("Suggestion error: ", error);
    return NextResponse.json(
      { error: "Failed to generate suggestion" },
      { status: 500 },
    );
  }
}
