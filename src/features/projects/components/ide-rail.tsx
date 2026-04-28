"use client";

/**
 * IdeRail — labelled navigation sidebar for the project IDE.
 *
 * Praxiom §4.3 sidebar pattern with text labels — elevated from the original
 * icon-only 48px rail to a full 180px sidebar with section headers, labels,
 * and a bottom identity cluster, matching the Praxiom design language.
 */

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  FileTextIcon,
  FilesIcon,
  GithubIcon,
  ListChecksIcon,
  MessageSquareIcon,
  SettingsIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { WorkspaceSwitcher } from "@/features/workspaces/components/workspace-switcher";
import { PlanBadge } from "@/features/billing/components/plan-badge";

interface NavItemProps {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick?: () => void;
  /** Small primary dot in the corner — signals background activity. */
  pulse?: boolean;
}

const NavItem = ({
  icon: Icon,
  label,
  active,
  onClick,
  pulse,
}: NavItemProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    aria-pressed={active}
    className={cn(
      "relative w-full h-8 flex items-center gap-2.5 px-2.5 rounded-md transition-colors group",
      "text-muted-foreground hover:text-foreground hover:bg-surface-2",
      active && "text-foreground bg-surface-2",
    )}
  >
    {/* Praxiom §4.3 — 2px left-edge primary accent bar */}
    <span
      className={cn(
        "absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-r-full transition-colors",
        active ? "bg-primary" : "bg-transparent",
      )}
    />
    <Icon className="size-3.5 shrink-0" />
    <span className="text-xs font-medium tracking-[-0.01em] truncate">{label}</span>
    {pulse && (
      <span className="ml-auto size-1.5 rounded-full bg-primary animate-pulse shrink-0" />
    )}
  </button>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="px-2.5 pt-3 pb-1 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/50 select-none">
    {children}
  </p>
);

interface IdeRailProps {
  filesOpen: boolean;
  planOpen: boolean;
  specOpen: boolean;
  agentOpen: boolean;
  onToggleFiles: () => void;
  onTogglePlan: () => void;
  onToggleSpec: () => void;
  onToggleAgent: () => void;
  onOpenExport?: () => void;
}

export const IdeRail = ({
  filesOpen,
  planOpen,
  specOpen,
  agentOpen,
  onToggleFiles,
  onTogglePlan,
  onToggleSpec,
  onToggleAgent,
  onOpenExport,
}: IdeRailProps) => {
  const router = useRouter();

  return (
    <aside className="w-44 shrink-0 bg-surface-1 flex flex-col py-2 overflow-hidden">

      {/* Brand */}
      <Link
        href="/dashboard"
        className="h-10 flex items-center gap-2.5 px-3 group mb-1"
        aria-label="Polaris home"
      >
        <Image
          src="/logo.svg"
          alt="Polaris"
          width={18}
          height={18}
          className="opacity-90 group-hover:opacity-100 transition-opacity shrink-0"
        />
        <span className="font-heading text-sm font-semibold tracking-[-0.02em] text-foreground group-hover:text-primary transition-colors">
          Polaris
        </span>
      </Link>

      {/* Workspace switcher — compact tile, left-aligned */}
      <div className="px-1.5">
        <WorkspaceSwitcher />
      </div>

      <div className="h-px bg-surface-3 mx-2.5 my-2.5" />

      {/* Navigation */}
      <div className="flex-1 flex flex-col px-1.5 min-h-0 overflow-y-auto scrollbar-thin">
        <SectionLabel>Workspace</SectionLabel>

        <NavItem
          icon={FilesIcon}
          label="Explorer"
          active={filesOpen}
          onClick={onToggleFiles}
        />
        <NavItem
          icon={ListChecksIcon}
          label="Build Plan"
          active={planOpen}
          onClick={onTogglePlan}
        />
        <NavItem
          icon={FileTextIcon}
          label="Spec"
          active={specOpen}
          onClick={onToggleSpec}
        />

        <SectionLabel>Tools</SectionLabel>

        <NavItem
          icon={MessageSquareIcon}
          label="Agent"
          active={agentOpen}
          onClick={onToggleAgent}
          pulse={agentOpen}
        />
        <NavItem
          icon={GithubIcon}
          label="Export"
          onClick={onOpenExport}
        />
      </div>

      {/* Bottom cluster — settings + identity + plan */}
      <div className="px-1.5 pt-2 border-t border-surface-3 mt-1 space-y-0.5">
        <NavItem
          icon={SettingsIcon}
          label="Settings"
          onClick={() => router.push("/settings")}
        />

        <div className="flex items-center gap-2.5 px-2.5 h-8">
          <UserButton
            appearance={{
              elements: { avatarBox: "size-5" },
            }}
          />
          <PlanBadge />
        </div>
      </div>
    </aside>
  );
};
