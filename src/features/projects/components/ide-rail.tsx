"use client";

/**
 * IdeRail — thin left navigation rail for the project IDE.
 *
 * Praxiom §4.3 sidebar pattern, applied to a Cursor-style 3-pane IDE:
 * the rail toggles which auxiliary panels are visible, holds project-wide
 * actions, and houses the user identity. Active state uses the §4.3
 * left-edge accent bar (2px primary), not a filled background.
 */

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  FileTextIcon,
  FilesIcon,
  GithubIcon,
  MessageSquareIcon,
  SettingsIcon,
} from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { WorkspaceSwitcher } from "@/features/workspaces/components/workspace-switcher";
import { PlanBadge } from "@/features/billing/components/plan-badge";

interface RailButtonProps {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick?: () => void;
  /** Praxiom — small dot in the bottom-right corner for "has activity". */
  pulse?: boolean;
}

const RailButton = ({
  icon: Icon,
  label,
  active,
  onClick,
  pulse,
}: RailButtonProps) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        className={cn(
          "relative w-full h-10 flex items-center justify-center transition-colors group",
          "text-muted-foreground hover:text-foreground hover:bg-surface-2",
          active && "text-foreground",
        )}
      >
        {/* Praxiom §4.3 — left-edge active accent bar */}
        <span
          className={cn(
            "absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-r-full transition-colors",
            active ? "bg-primary" : "bg-transparent",
          )}
        />
        <Icon className="size-[18px]" />
        {pulse && (
          <span className="absolute top-2 right-2 size-1.5 rounded-full bg-primary animate-pulse" />
        )}
      </button>
    </TooltipTrigger>
    <TooltipContent side="right">{label}</TooltipContent>
  </Tooltip>
);

interface IdeRailProps {
  filesOpen: boolean;
  specOpen: boolean;
  agentOpen: boolean;
  onToggleFiles: () => void;
  onToggleSpec: () => void;
  onToggleAgent: () => void;
  onOpenExport?: () => void;
}

export const IdeRail = ({
  filesOpen,
  specOpen,
  agentOpen,
  onToggleFiles,
  onToggleSpec,
  onToggleAgent,
  onOpenExport,
}: IdeRailProps) => {
  const router = useRouter();
  return (
  <aside className="w-12 shrink-0 bg-surface-1 flex flex-col items-stretch py-2 gap-0.5">
    {/* Brand — links back to /dashboard */}
    <Link
      href="/dashboard"
      className="h-10 flex items-center justify-center group"
      aria-label="Polaris home"
    >
      <Image
        src="/logo.svg"
        alt="Polaris"
        width={22}
        height={22}
        className="opacity-90 group-hover:opacity-100 transition-opacity"
      />
    </Link>

    {/* Praxiom §7.8 — workspace switcher (D-020) */}
    <WorkspaceSwitcher />

    <div className="h-px bg-surface-3 mx-2 my-1.5" />

    <RailButton
      icon={FilesIcon}
      label={filesOpen ? "Hide files" : "Show files"}
      active={filesOpen}
      onClick={onToggleFiles}
    />
    <RailButton
      icon={FileTextIcon}
      label={specOpen ? "Hide spec" : "Show spec"}
      active={specOpen}
      onClick={onToggleSpec}
    />
    <RailButton
      icon={MessageSquareIcon}
      label={agentOpen ? "Hide agent" : "Show agent"}
      active={agentOpen}
      onClick={onToggleAgent}
    />
    <RailButton
      icon={GithubIcon}
      label="Export to GitHub"
      onClick={onOpenExport}
    />

    {/* Spacer */}
    <div className="flex-1" />

    <RailButton
      icon={SettingsIcon}
      label="Settings"
      onClick={() => router.push("/settings")}
    />

    <div className="h-10 flex items-center justify-center">
      <UserButton
        appearance={{
          elements: { avatarBox: "size-7" },
        }}
      />
    </div>

    {/* D-019 — current plan tier; click navigates to billing settings. */}
    <div className="flex items-center justify-center pb-1">
      <PlanBadge />
    </div>
  </aside>
  );
};
