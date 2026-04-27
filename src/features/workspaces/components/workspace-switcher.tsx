"use client";

/**
 * WorkspaceSwitcher — Praxiom §7.8 dropdown (compact icon-trigger variant
 * suited for the IDE rail). Shows current workspace initial in a primary
 * tile; on click, lists all workspaces user is a member of + "Create
 * workspace" + "Manage members" entries.
 *
 * Authority: D-020. Currently read-only — wiring the switcher to *actually*
 * scope projects requires the project queries to filter by workspaceId,
 * which is a follow-up after the migration runs.
 */

import { useState } from "react";
import {
  CheckIcon,
  ChevronsUpDownIcon,
  PlusIcon,
  UsersIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

import {
  useCurrentWorkspace,
  useWorkspaces,
  useCreateWorkspace,
} from "../hooks/use-workspaces";

export const WorkspaceSwitcher = () => {
  const current = useCurrentWorkspace();
  const all = useWorkspaces();
  const createWorkspace = useCreateWorkspace();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  // Loading shimmer — keep the rail tile from popping in/out.
  if (current === undefined) {
    return (
      <div className="h-10 flex items-center justify-center">
        <Spinner className="size-3.5 text-muted-foreground/50" />
      </div>
    );
  }

  const initial = (current?.name ?? "?").charAt(0).toUpperCase();

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      await createWorkspace({ name: trimmed });
      toast.success(`Workspace "${trimmed}" created`);
      setCreateOpen(false);
      setName("");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not create workspace",
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "h-10 w-full flex items-center justify-center group",
                  "text-foreground hover:opacity-90 transition-opacity",
                )}
                aria-label={
                  current ? `Workspace: ${current.name}` : "No workspace"
                }
              >
                <div
                  className={cn(
                    "size-7 rounded-md flex items-center justify-center",
                    "bg-primary text-primary-foreground",
                    "text-xs font-semibold",
                    "[box-shadow:0_1px_3px_hsl(0_0%_0%_/_0.2)]",
                  )}
                >
                  {initial}
                </div>
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">
            {current?.name ?? "No workspace"}
          </TooltipContent>
        </Tooltip>

        <DropdownMenuContent side="right" align="start" className="min-w-56">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-semibold">
            Workspaces
          </DropdownMenuLabel>

          {all === undefined ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              Loading…
            </div>
          ) : all.length === 0 ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              No workspaces yet
            </div>
          ) : (
            all.map((w) => {
              const isCurrent = current?._id === w._id;
              return (
                <DropdownMenuItem
                  key={w._id}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ChevronsUpDownIcon className="size-3.5 text-muted-foreground/60 shrink-0" />
                    <span className="text-sm truncate">{w.name}</span>
                    <span className="text-[10px] text-muted-foreground/60 shrink-0 uppercase tracking-wide">
                      {w.role}
                    </span>
                  </div>
                  {isCurrent && (
                    <CheckIcon className="size-3.5 text-primary shrink-0" />
                  )}
                </DropdownMenuItem>
              );
            })
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2"
          >
            <PlusIcon className="size-3.5 text-muted-foreground" />
            <span className="text-sm">Create workspace</span>
          </DropdownMenuItem>

          {current && (
            <DropdownMenuItem
              onClick={() => {
                window.location.href = `/settings#workspace`;
              }}
              className="flex items-center gap-2"
            >
              <UsersIcon className="size-3.5 text-muted-foreground" />
              <span className="text-sm">Manage members</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="ws-name"
              className="text-xs font-medium text-muted-foreground"
            >
              Name
            </label>
            <Input
              id="ws-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate();
              }}
              placeholder="Acme team"
              disabled={creating}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleCreate()} disabled={creating || !name.trim()}>
              {creating ? <Spinner className="size-3.5" /> : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
