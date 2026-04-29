"use client";

/**
 * ProjectIdLayout — Cursor-style 3-pane IDE shell.
 *
 *   ┌─────┬───────────┬──────────────────┬──────────────┐
 *   │     │  Files    │   Editor +       │   Agent      │
 *   │ Rail│  (toggle) │   Tabs +         │   (toggle)   │
 *   │     │           │   Terminal       │              │
 *   └─────┴───────────┴──────────────────┴──────────────┘
 *
 * Layout owns the toggle state for the auxiliary panes (files, agent).
 * The rail dispatches toggles; the file tree and agent are rendered here
 * (lifted up from `ProjectIdView` so the shell can manage their visibility).
 *
 * The center pane is `{children}` — the route's page renders the editor.
 */

import { useCallback, useEffect, useState } from "react";
import { Allotment } from "allotment";

import { ConversationSidebar } from "@/features/conversations/components/conversation-sidebar";
import { SpecPanel } from "@/features/specs/components/spec-panel";
import { PlanPane } from "@/features/specs/components/plan-pane";
import { FileExplorer } from "./file-explorer";
import { IdeRail } from "./ide-rail";
import { ProjectTopbar } from "./project-topbar";
import { GitHubDialog } from "./github-dialog";
import { Id } from "../../../../convex/_generated/dataModel";

const LEFT_DEFAULT = 300;
const LEFT_MIN = 220;
const LEFT_MAX = 520;

const AGENT_DEFAULT = 360;
const AGENT_MIN = 300;
const AGENT_MAX = 680;

/**
 * What's showing in the left pane:
 *   files — file explorer (default)
 *   plan  — D-026 build plan with sprint-grouped checklist
 *   spec  — legacy spec panel (Praxiom feature editor)
 *   hidden — collapsed
 */
type LeftPaneMode = "files" | "plan" | "spec" | "hidden";

export const ProjectIdLayout = ({
  children,
  projectId,
}: {
  children: React.ReactNode;
  projectId: Id<"projects">;
}) => {
  const [leftMode, setLeftMode] = useState<LeftPaneMode>("plan");
  const [agentOpen, setAgentOpen] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);

  // Persist sidebar collapsed state across refreshes.
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("polaris:sidebar-collapsed") === "1";
  });

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((v) => {
      const next = !v;
      window.localStorage.setItem("polaris:sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  }, []);

  // Cmd+B / Ctrl+B keyboard shortcut to toggle sidebar (VS Code convention).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleSidebar]);

  // Praxiom — toggling: closed → open; open → closed. Each toggles
  // independently within the same pane (only one mode visible at a time).
  const handleToggleFiles = () =>
    setLeftMode((m) => (m === "files" ? "hidden" : "files"));
  const handleTogglePlan = () =>
    setLeftMode((m) => (m === "plan" ? "hidden" : "plan"));
  const handleToggleSpec = () =>
    setLeftMode((m) => (m === "spec" ? "hidden" : "spec"));

  return (
    <div className="w-full h-screen flex bg-surface-0 overflow-hidden">
      <IdeRail
        filesOpen={leftMode === "files"}
        planOpen={leftMode === "plan"}
        specOpen={leftMode === "spec"}
        agentOpen={agentOpen}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
        onToggleFiles={handleToggleFiles}
        onTogglePlan={handleTogglePlan}
        onToggleSpec={handleToggleSpec}
        onToggleAgent={() => setAgentOpen((v) => !v)}
        onOpenExport={() => setExportOpen(true)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <ProjectTopbar
          projectId={projectId}
          onOpenExport={() => setExportOpen(true)}
        />

        <div className="flex-1 min-h-0">
          <Allotment proportionalLayout={false}>
            <Allotment.Pane
              snap
              visible={!sidebarCollapsed && leftMode !== "hidden"}
              minSize={LEFT_MIN}
              maxSize={LEFT_MAX}
              preferredSize={LEFT_DEFAULT}
            >
              {leftMode === "spec" ? (
                <SpecPanel projectId={projectId} />
              ) : leftMode === "plan" ? (
                <PlanPane projectId={projectId} />
              ) : (
                <FileExplorer projectId={projectId} />
              )}
            </Allotment.Pane>

            <Allotment.Pane minSize={300}>{children}</Allotment.Pane>

            <Allotment.Pane
              snap
              visible={agentOpen}
              minSize={AGENT_MIN}
              maxSize={AGENT_MAX}
              preferredSize={AGENT_DEFAULT}
            >
              <ConversationSidebar projectId={projectId} />
            </Allotment.Pane>
          </Allotment>
        </div>
      </div>

      <GitHubDialog
        projectId={projectId}
        open={exportOpen}
        onOpenChange={setExportOpen}
      />
    </div>
  );
};
