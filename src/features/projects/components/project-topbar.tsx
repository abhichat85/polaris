"use client";

/**
 * ProjectTopbar — slim header above the IDE 3-pane.
 *
 * The full-height left rail already carries the brand and identity, so the
 * topbar is just contextual: project name (with inline rename), save state,
 * and the GitHub export action. Praxiom §4.4 — h-14 was bigger than needed
 * once the rail took over branding; we drop to h-12 here.
 */

import { useState } from "react";
import { CloudCheckIcon, GithubIcon, LoaderIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

import { Id } from "../../../../convex/_generated/dataModel";
import { useProject, useRenameProject } from "../hooks/use-projects";

interface Props {
  projectId: Id<"projects">;
  onOpenExport: () => void;
}

export const ProjectTopbar = ({ projectId, onOpenExport }: Props) => {
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

  return (
    <header className="h-12 px-3 flex items-center justify-between bg-surface-1 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        {isRenaming ? (
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={handleSubmit}
            onKeyDown={handleKeyDown}
            className="font-heading text-sm font-semibold tracking-[-0.01em] bg-transparent text-foreground outline-none focus:ring-1 focus:ring-inset focus:ring-primary max-w-60 truncate"
          />
        ) : (
          <button
            type="button"
            onClick={handleStartRename}
            className="font-heading text-sm font-semibold tracking-[-0.01em] text-foreground hover:text-primary transition-colors max-w-60 truncate"
          >
            {project?.name ?? "Loading…"}
          </button>
        )}

        {project?.importStatus === "importing" ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <LoaderIcon className="size-3.5 text-muted-foreground animate-spin" />
            </TooltipTrigger>
            <TooltipContent>Importing…</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <CloudCheckIcon className="size-3.5 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>
              Saved
              {project?.updatedAt
                ? ` ${formatDistanceToNow(project.updatedAt, { addSuffix: true })}`
                : "…"}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-muted-foreground hover:text-foreground hidden sm:flex"
          onClick={onOpenExport}
        >
          <GithubIcon className="size-3.5 mr-1.5" />
          Export
        </Button>
      </div>
    </header>
  );
};
