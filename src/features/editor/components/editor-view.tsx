"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { PanelRight } from "lucide-react";
import { Allotment } from "allotment";
import "allotment/dist/style.css";

import { useFile, useUpdateFile } from "@/features/projects/hooks/use-files";
import { Button } from "@/components/ui/button";

import { CodeEditor } from "./code-editor";
import { useEditor } from "../hooks/use-editor";
import { TopNavigation } from "./top-navigation";
import { FileBreadcrumbs } from "./file-breadcrumbs";
import { PreviewPanel } from "./preview-panel";
import { Id } from "../../../../convex/_generated/dataModel";
import { WebContainerProvider } from "../context/webcontainer-context";
import { TerminalPanel } from "./terminal";

const DEBOUNCE_MS = 1500;

export const EditorView = ({ projectId }: { projectId: Id<"projects"> }) => {
  return (
    <WebContainerProvider projectId={projectId}>
      <EditorViewContent projectId={projectId} />
    </WebContainerProvider>
  );
};

const EditorViewContent = ({ projectId }: { projectId: Id<"projects"> }) => {
  const { activeTabId } = useEditor(projectId);
  const activeFile = useFile(activeTabId);
  const updateFile = useUpdateFile();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [showPreview, setShowPreview] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const isActiveFileBinary = activeFile && activeFile.storageId;
  const isActiveFileText = activeFile && !activeFile.storageId;

  // Cleanup pending debounced updates on unmount or file change
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [activeTabId]);

  const EditorContent = () => (
    <div className="flex-1 min-h-0 bg-background h-full flex flex-col">
      {activeTabId && <FileBreadcrumbs projectId={projectId} />}
      <div className="flex-1 relative">
        {!activeFile && (
          <div className="size-full flex items-center justify-center">
            <Image
              src="/logo-alt.svg"
              alt="Polaris"
              width={50}
              height={50}
              className="opacity-25"
            />
          </div>
        )}
        {isActiveFileText && (
          <CodeEditor
            key={activeFile._id}
            fileName={activeFile.name}
            initialValue={activeFile.content}
            onChange={(content: string) => {
              if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
              }

              timeoutRef.current = setTimeout(() => {
                updateFile({ id: activeFile._id, content });
                setRefreshKey(prev => prev + 1);
              }, DEBOUNCE_MS);
            }}
          />
        )}
        {isActiveFileBinary && activeFile && (
          <div className="size-full flex items-center justify-center p-4 bg-muted/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeFile.url || `/api/preview/${projectId}/${activeFile.name}`}
              alt={activeFile.name}
              className="max-w-full max-h-full object-contain rounded shadow-sm"
            />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center border-b bg-sidebar h-9">
        <TopNavigation projectId={projectId} />
        <div className="flex items-center px-2 border-l h-full">
          <Button
            variant={showPreview ? "secondary" : "ghost"}
            size="icon-xs"
            onClick={() => setShowPreview(!showPreview)}
            title="Toggle Preview"
            className="h-6 w-6"
          >
            <PanelRight className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        <Allotment vertical>
          <Allotment.Pane>
            {showPreview ? (
              <Allotment>
                <Allotment.Pane minSize={200}>
                  <EditorContent />
                </Allotment.Pane>
                <Allotment.Pane minSize={200} preferredSize={400}>
                  <PreviewPanel projectId={projectId} refreshTrigger={refreshKey} />
                </Allotment.Pane>
              </Allotment>
            ) : (
              <EditorContent />
            )}
          </Allotment.Pane>
          <Allotment.Pane minSize={100} preferredSize={200} visible>
            <TerminalPanel />
          </Allotment.Pane>
        </Allotment>
      </div>
    </div>
  );
};
