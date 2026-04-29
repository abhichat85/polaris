"use client";

/**
 * ProjectTopbar — refined header above the IDE 3-pane.
 *
 * Elevated to Praxiom design standard: breadcrumb-style project identity,
 * subtle save-state chip, and a clean right-side action cluster.
 */

import { useState } from "react";
import { CloudCheckIcon, LoaderIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { Id } from "../../../../convex/_generated/dataModel";
import { useProject, useRenameProject } from "../hooks/use-projects";

interface Props {
  projectId: Id<"projects">;
}

export const ProjectTopbar = ({ projectId }: Props) => {
  const project = useProject(projectId);
  const renameProject = useRenameProject();

  const [isRenaming, setIsRenaming] = useState(false);
  const [name, setName] = useState("");

  const handleStartRename = () => {
    if (!project) return;
    setName(project.name);
    setIsRenaming(true);
  };

  const handleSubmit = () => {
    if (!project) return;
    setIsRenaming(false);
    const trimmed = name.trim();
    if (!trimmed || trimmed === project.name) return;
    renameProject({ id: projectId, name: trimmed });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
    else if (e.key === "Escape") setIsRenaming(false);
  };

  const isSaving = project?.importStatus === "importing";

  return (
    <header className="h-10 px-3 flex items-center justify-between bg-surface-1 shrink-0 border-b border-surface-3/60">
      {/* Left: Project identity */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Breadcrumb prefix — muted "Projects /" */}
        <span className="text-xs text-muted-foreground/50 font-medium shrink-0 hidden sm:block">
          Projects
        </span>
        <span className="text-muted-foreground/30 text-xs shrink-0 hidden sm:block">/</span>

        {isRenaming ? (
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={handleSubmit}
            onKeyDown={handleKeyDown}
            className="font-heading text-sm font-semibold tracking-[-0.02em] bg-transparent text-foreground outline-none focus:ring-1 focus:ring-inset focus:ring-primary max-w-52 rounded px-1"
          />
        ) : (
          <button
            type="button"
            onClick={handleStartRename}
            className="font-heading text-sm font-semibold tracking-[-0.02em] text-foreground hover:text-primary transition-colors max-w-52 truncate"
          >
            {project?.name ?? "Loading…"}
          </button>
        )}

        {/* Save state indicator */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                "flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium transition-colors",
                isSaving
                  ? "text-warning"
                  : "text-muted-foreground/40 hover:text-muted-foreground/70",
              )}
            >
              {isSaving ? (
                <LoaderIcon className="size-3 animate-spin" />
              ) : (
                <CloudCheckIcon className="size-3" />
              )}
              <span className="hidden md:block">
                {isSaving ? "Saving…" : "Saved"}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {isSaving
              ? "Importing…"
              : `Saved${project?.updatedAt ? ` ${formatDistanceToNow(project.updatedAt, { addSuffix: true })}` : "…"}`}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Right: reserved for future status chips (Tier 3) */}
      <div className="flex items-center gap-1" />
    </header>
  );
};
