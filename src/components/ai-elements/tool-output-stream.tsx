"use client";

/**
 * ToolOutputStream — renders per-line stdout/stderr produced by the
 * `run_command` agent tool. Authority: CONSTITUTION D-018, Praxiom §7.7.
 *
 * The lines arrive in `messages.toolCalls[].stream[]` (extended by
 * D-018). Convex streams updates via `useMessages` so the parent
 * already gets live data; this component is pure render.
 *
 * Praxiom design: vertical 2px primary/40 accent bar, JetBrains Mono,
 * stderr is text-warning, scrolls within 12rem max-height.
 */

import { cn } from "@/lib/utils";

export interface ToolStreamLine {
  kind: "stdout" | "stderr";
  line: string;
  at: number;
}

interface Props {
  lines?: ToolStreamLine[];
}

export const ToolOutputStream = ({ lines }: Props) => {
  if (!lines || lines.length === 0) {
    return (
      <div className="border-l-2 border-primary/40 pl-3 py-2 mt-2">
        <p className="font-mono text-[11px] italic text-muted-foreground/60">
          (no output yet — command running)
        </p>
      </div>
    );
  }

  return (
    <div className="border-l-2 border-primary/40 pl-3 py-2 mt-2">
      <div className="font-mono text-[11px] leading-relaxed max-h-48 overflow-y-auto scrollbar-thin">
        {lines.map((entry, i) => (
          <div
            key={`${entry.at}-${i}`}
            className={cn(
              "whitespace-pre-wrap",
              entry.kind === "stderr"
                ? "text-warning"
                : "text-foreground/85",
            )}
          >
            {entry.line}
          </div>
        ))}
      </div>
    </div>
  );
};
