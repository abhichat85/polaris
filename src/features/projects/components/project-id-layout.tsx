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
import { FileExplorer } from "./file-explorer";
import { IdeRail } from "./ide-rail";
import { ProjectTopbar } from "./project-topbar";
import { GitHubDialog } from "./github-dialog";
import { Id } from "../../../../convex/_generated/dataModel";

const FILES_DEFAULT = 260;
const FILES_MIN = 200;
const FILES_MAX = 480;

const AGENT_DEFAULT = 400;
const AGENT_MIN = 320;
const AGENT_MAX = 720;

export const ProjectIdLayout = ({
  children,
  projectId,
}: {
  children: React.ReactNode;
  projectId: Id<"projects">;
}) => {
  const [filesOpen, setFilesOpen] = useState(true);
  const [agentOpen, setAgentOpen] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <div className="w-full h-screen flex bg-surface-0 overflow-hidden">
      <IdeRail
        filesOpen={filesOpen}
        agentOpen={agentOpen}
        onToggleFiles={() => setFilesOpen((v) => !v)}
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
              visible={filesOpen}
              minSize={FILES_MIN}
              maxSize={FILES_MAX}
              preferredSize={FILES_DEFAULT}
            >
              <FileExplorer projectId={projectId} />
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
