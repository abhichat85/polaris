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
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
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
  /** When true, render icon-only with tooltip label. */
  collapsed?: boolean;
}

const NavItem = ({
  icon: Icon,
  label,
  active,
  onClick,
  pulse,
  collapsed,
}: NavItemProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    aria-pressed={active}
    title={collapsed ? label : undefined}
    className={cn(
      "relative w-full h-8 flex items-center rounded-md transition-colors group",
      collapsed ? "justify-center px-0" : "gap-2.5 px-2.5",
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
    {!collapsed && (
      <span className="text-xs font-medium tracking-[-0.01em] truncate">{label}</span>
    )}
    {pulse && (
      <span
        className={cn(
          "size-1.5 rounded-full bg-primary animate-pulse shrink-0",
          collapsed ? "absolute top-1 right-1" : "ml-auto",
        )}
      />
    )}
  </button>
);

const SectionLabel = ({ children, collapsed }: { children: React.ReactNode; collapsed?: boolean }) => {
  if (collapsed) {
    return <div className="h-px bg-surface-3/60 mx-1.5 my-2" />;
  }
  return (
    <p className="px-2.5 pt-3 pb-1 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/50 select-none">
      {children}
    </p>
  );
};

interface IdeRailProps {
  filesOpen: boolean;
  planOpen: boolean;
  specOpen: boolean;
  agentOpen: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
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
  collapsed = false,
  onToggleCollapse,
  onToggleFiles,
  onTogglePlan,
  onToggleSpec,
  onToggleAgent,
  onOpenExport,
}: IdeRailProps) => {
  const router = useRouter();
  const CollapseIcon = collapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon;

  return (
    <aside
      className={cn(
        "shrink-0 bg-surface-1 flex flex-col py-2 overflow-hidden border-r border-surface-3/40 transition-[width] duration-200",
        collapsed ? "w-10" : "w-44",
      )}
    >
      {/* Brand + workspace */}
      <div className={cn("h-10 flex items-center shrink-0", collapsed ? "justify-center px-0" : "justify-between px-3")}>
        <Link
          href="/dashboard"
          className={cn("flex items-center group min-w-0", collapsed ? "gap-0" : "gap-2")}
          aria-label="Polaris home"
        >
          <Image
            src="/logo.svg"
            alt="Polaris"
            width={18}
            height={18}
            className="opacity-90 group-hover:opacity-100 transition-opacity shrink-0"
          />
          {!collapsed && (
            <span className="font-heading text-sm font-semibold tracking-[-0.02em] text-foreground group-hover:text-primary transition-colors truncate">
              Polaris
            </span>
          )}
        </Link>
        {!collapsed && (
          <div className="shrink-0">
            <WorkspaceSwitcher />
          </div>
        )}
      </div>

      <div className={cn("h-px bg-surface-3", collapsed ? "mx-1.5 my-1.5" : "mx-2.5 my-1.5")} />

      {/* Navigation */}
      <div className={cn("flex-1 flex flex-col min-h-0 overflow-y-auto scrollbar-thin", collapsed ? "px-0.5" : "px-1.5")}>
        <SectionLabel collapsed={collapsed}>Workspace</SectionLabel>

        <NavItem
          icon={FilesIcon}
          label="Explorer"
          active={filesOpen}
          onClick={onToggleFiles}
          collapsed={collapsed}
        />
        <NavItem
          icon={ListChecksIcon}
          label="Build Plan"
          active={planOpen}
          onClick={onTogglePlan}
          collapsed={collapsed}
        />
        <NavItem
          icon={FileTextIcon}
          label="Spec"
          active={specOpen}
          onClick={onToggleSpec}
          collapsed={collapsed}
        />

        <SectionLabel collapsed={collapsed}>Tools</SectionLabel>

        <NavItem
          icon={MessageSquareIcon}
          label="Agent"
          active={agentOpen}
          onClick={onToggleAgent}
          pulse={agentOpen}
          collapsed={collapsed}
        />
        <NavItem
          icon={GithubIcon}
          label="Export"
          onClick={onOpenExport}
          collapsed={collapsed}
        />
      </div>

      {/* Bottom cluster — settings + identity + collapse toggle */}
      <div className={cn("pt-2 border-t border-surface-3 mt-1 space-y-0.5", collapsed ? "px-0.5" : "px-1.5")}>
        <NavItem
          icon={SettingsIcon}
          label="Settings"
          onClick={() => router.push("/settings")}
          collapsed={collapsed}
        />

        {collapsed ? (
          <div className="flex items-center justify-center h-8">
            <UserButton
              appearance={{
                elements: { avatarBox: "size-5" },
              }}
            />
          </div>
        ) : (
          <div className="flex items-center gap-2.5 px-2.5 h-8">
            <UserButton
              appearance={{
                elements: { avatarBox: "size-5" },
              }}
            />
            <PlanBadge />
          </div>
        )}

        {/* Sidebar collapse/expand toggle */}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}
            className={cn(
              "w-full h-7 flex items-center rounded-md transition-colors",
              "text-muted-foreground/50 hover:text-foreground hover:bg-surface-2",
              collapsed ? "justify-center px-0" : "gap-2.5 px-2.5",
            )}
          >
            <CollapseIcon className="size-3.5 shrink-0" />
            {!collapsed && (
              <span className="text-[10px] font-medium tracking-[-0.01em]">Collapse</span>
            )}
          </button>
        )}
      </div>
    </aside>
  );
};
