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

import { useState } from "react";
import { Allotment } from "allotment";

import { ConversationSidebar } from "@/features/conversations/components/conversation-sidebar";
import { SpecPanel } from "@/features/specs/components/spec-panel";
import { FileExplorer } from "./file-explorer";
import { IdeRail } from "./ide-rail";
import { ProjectTopbar } from "./project-topbar";
import { GitHubDialog } from "./github-dialog";
import { Id } from "../../../../convex/_generated/dataModel";

const LEFT_DEFAULT = 320;
const LEFT_MIN = 240;
const LEFT_MAX = 560;

const AGENT_DEFAULT = 400;
const AGENT_MIN = 320;
const AGENT_MAX = 720;

/** What's showing in the left pane: files (default) or spec (Polaris differentiator). */
type LeftPaneMode = "files" | "spec" | "hidden";

export const ProjectIdLayout = ({
  children,
  projectId,
}: {
  children: React.ReactNode;
  projectId: Id<"projects">;
}) => {
  const [leftMode, setLeftMode] = useState<LeftPaneMode>("files");
  const [agentOpen, setAgentOpen] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);

  // Praxiom — toggling files: closed → open files; open files → closed.
  // Spec slot toggles independently within the same pane.
  const handleToggleFiles = () =>
    setLeftMode((m) => (m === "files" ? "hidden" : "files"));
  const handleToggleSpec = () =>
    setLeftMode((m) => (m === "spec" ? "hidden" : "spec"));

  return (
    <div className="w-full h-screen flex bg-surface-0 overflow-hidden">
      <IdeRail
        filesOpen={leftMode === "files"}
        specOpen={leftMode === "spec"}
        agentOpen={agentOpen}
        onToggleFiles={handleToggleFiles}
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
              visible={leftMode !== "hidden"}
              minSize={LEFT_MIN}
              maxSize={LEFT_MAX}
              preferredSize={LEFT_DEFAULT}
            >
              {leftMode === "spec" ? (
                <SpecPanel projectId={projectId} />
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
