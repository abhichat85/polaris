/**
 * /api/quick-edit — apply a natural-language edit to a selected code range.
 *
 * Authority: Constitution D-007 — no Vercel AI SDK. Uses raw
 * `@anthropic-ai/sdk`. Structured output is enforced by asking Claude to
 * return strict JSON and parsing with the existing Zod schema.
 *
 * If the instruction contains URLs, those are scraped via Firecrawl and
 * appended as a `<documentation>` block before the model call (unchanged
 * from previous behaviour).
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { firecrawl } from "@/lib/firecrawl";
import { rateLimitOr429 } from "@/lib/rate-limit/middleware";
import { convex } from "@/lib/convex-client";
import { api } from "../../../../convex/_generated/api";

const quickEditSchema = z.object({
  editedCode: z
    .string()
    .describe(
      "The edited version of the selected code based on the instruction",
    ),
});

const URL_REGEX = /https?:\/\/[^\s)>\]]+/g;

const QUICK_EDIT_PROMPT = `You are a code editing assistant. Edit the selected code based on the user's instruction.

<context>
<selected_code>
{selectedCode}
</selected_code>
<full_code_context>
{fullCode}
</full_code_context>
</context>

{documentation}

<instruction>
{instruction}
</instruction>

<instructions>
Return ONLY the edited version of the selected code.
Maintain the same indentation level as the original.
Do not include any explanations or comments unless requested.
If the instruction is unclear or cannot be applied, return the original code unchanged.

Respond with ONLY a JSON object on a single line, no prose, no markdown fence:
{"editedCode": "<the edited code, with literal newlines escaped as \\n>"}
</instructions>`;

const anthropic = new Anthropic();

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    const { selectedCode, fullCode, instruction } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 400 });
    }

    // §13.4 — quick-edit shares the global HTTP bucket; per-tier multiplier
    // applied via plan from customers row.
    const customer = await convex.query(api.customers.getByUser, { userId });
    const blocked = await rateLimitOr429({
      userId,
      bucket: "httpGlobal",
      plan: customer?.plan ?? "free",
    });
    if (blocked) return blocked;

    if (!selectedCode) {
      return NextResponse.json(
        { error: "Selected code is required" },
        { status: 400 },
      );
    }

    if (!instruction) {
      return NextResponse.json(
        { error: "Instruction is required" },
        { status: 400 },
      );
    }

    const urls: string[] = instruction.match(URL_REGEX) || [];
    let documentationContext = "";

    if (urls.length > 0) {
      const scrapedResults = await Promise.all(
        urls.map(async (url) => {
          try {
            const result = await firecrawl.scrape(url, {
              formats: ["markdown"],
            });
            if (result.markdown) {
              return `<doc url="${url}">\n${result.markdown}\n</doc>`;
            }
            return null;
          } catch {
            return null;
          }
        }),
      );

      const validResults = scrapedResults.filter(Boolean);
      if (validResults.length > 0) {
        documentationContext = `<documentation>\n${validResults.join("\n\n")}\n</documentation>`;
      }
    }

    const prompt = QUICK_EDIT_PROMPT
      .replace("{selectedCode}", selectedCode)
      .replace("{fullCode}", fullCode || "")
      .replace("{instruction}", instruction)
      .replace("{documentation}", documentationContext);

    const response = await anthropic.messages.create({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ editedCode: selectedCode });
    }

    const raw = textBlock.text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Bare-text fallback: return what the model returned, untouched.
      return NextResponse.json({ editedCode: raw });
    }

    const result = quickEditSchema.safeParse(parsed);
    if (!result.success) {
      return NextResponse.json({ editedCode: selectedCode });
    }

    return NextResponse.json({ editedCode: result.data.editedCode });
  } catch (error) {
    console.error("Edit error:", error);
    return NextResponse.json(
      { error: "Failed to generate edit" },
      { status: 500 },
    );
  }
}
