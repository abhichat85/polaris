"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { MonitorIcon, TerminalIcon } from "lucide-react";
import { Allotment } from "allotment";
import "allotment/dist/style.css";

import { useFile, useUpdateFile } from "@/features/projects/hooks/use-files";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { CodeEditor } from "./code-editor";
import { useEditor } from "../hooks/use-editor";
import { TopNavigation } from "./top-navigation";
import { FileBreadcrumbs } from "./file-breadcrumbs";
import { PreviewPanel } from "./preview-panel";
import { Id } from "../../../../convex/_generated/dataModel";
import { WebContainerProvider } from "../context/webcontainer-context";
import { useWebContainer } from "../context/webcontainer-context";
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
  const {
    serverUrl,
    isLoading: wcLoading,
    bootPhase,
    bootError,
    restartDev,
  } = useWebContainer();

  // Persist preview open/closed state across refreshes via localStorage.
  const [showPreview, setShowPreview] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("polaris:preview-open") === "1";
  });

  const [refreshKey, setRefreshKey] = useState(0);

  // Auto-open preview the first time the dev server comes up.
  const serverUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (serverUrl && !serverUrlRef.current) {
      serverUrlRef.current = serverUrl;
      setShowPreview(true);
      window.localStorage.setItem("polaris:preview-open", "1");
    }
  }, [serverUrl]);

  // Persist manual toggle.
  const togglePreview = () => {
    setShowPreview((v) => {
      const next = !v;
      window.localStorage.setItem("polaris:preview-open", next ? "1" : "0");
      return next;
    });
  };

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
    // Praxiom — editor canvas sits on surface-0 (deepest level)
    <div className="flex-1 min-h-0 bg-surface-0 h-full flex flex-col">
      {activeTabId && <FileBreadcrumbs projectId={projectId} />}
      <div className="flex-1 relative overflow-hidden">
        {/* Empty state — shown when no file is open */}
        {!activeFile && (
          <EditorEmptyState
            wcLoading={wcLoading}
            serverUrl={serverUrl}
            bootPhase={bootPhase}
            bootError={bootError}
            onRetry={restartDev}
          />
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
          <div className="size-full flex items-center justify-center p-4 bg-surface-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeFile.url || `/api/preview/${projectId}/${activeFile.name}`}
              alt={activeFile.name}
              className="max-w-full max-h-full object-contain rounded-lg"
            />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar */}
      <div className="flex items-center bg-surface-1 h-10 shrink-0 border-b border-surface-3/60">
        <TopNavigation projectId={projectId} />

        {/* Preview toggle — labeled, with server-status dot */}
        <div className="flex items-center gap-1 px-2 h-full ml-auto shrink-0">
          <Button
            variant={showPreview ? "secondary" : "ghost"}
            size="sm"
            onClick={togglePreview}
            className={cn(
              "h-7 gap-1.5 text-xs font-medium",
              !showPreview && "text-muted-foreground hover:text-foreground",
            )}
          >
            {/* Green dot when dev server is live */}
            <span
              className={cn(
                "size-1.5 rounded-full shrink-0 transition-colors",
                serverUrl ? "bg-success" : wcLoading ? "bg-warning/70 animate-pulse" : "bg-surface-4",
              )}
            />
            Preview
            <MonitorIcon className="size-3.5" />
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
                <Allotment.Pane minSize={200} preferredSize={420}>
                  <PreviewPanel projectId={projectId} refreshTrigger={refreshKey} />
                </Allotment.Pane>
              </Allotment>
            ) : (
              <EditorContent />
            )}
          </Allotment.Pane>
          <Allotment.Pane minSize={100} preferredSize={180} visible>
            <TerminalPanel />
          </Allotment.Pane>
        </Allotment>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Editor empty state — orientation card shown when no file is open
// ---------------------------------------------------------------------------
function EditorEmptyState({
  wcLoading,
  serverUrl,
  bootPhase,
  bootError,
  onRetry,
}: {
  wcLoading: boolean;
  serverUrl: string | null;
  bootPhase: import("../context/webcontainer-context").BootPhase;
  bootError: string | null;
  onRetry: () => void;
}) {
  const phaseLabel =
    bootPhase === "installing"
      ? "Installing dependencies…"
      : bootPhase === "starting"
      ? "Starting dev server…"
      : bootPhase === "running"
      ? "Dev server running"
      : bootPhase === "failed"
      ? "Boot failed"
      : wcLoading
      ? "Starting environment…"
      : "Environment ready";
  return (
    <div className="size-full flex flex-col items-center justify-center gap-6 px-8">
      {/* Brand mark */}
      <Image
        src="/logo-alt.svg"
        alt="Polaris"
        width={32}
        height={32}
        className="opacity-20"
      />

      {/* Status + guidance */}
      <div className="w-full max-w-xs flex flex-col gap-3">
        {/* Boot status — driven by the auto-boot pipeline */}
        <div className="flex items-center gap-2 rounded-lg bg-surface-2/60 px-3 py-2.5">
          <span
            className={cn(
              "size-1.5 rounded-full shrink-0",
              bootPhase === "running"
                ? "bg-success"
                : bootPhase === "failed"
                ? "bg-destructive"
                : bootPhase === "installing" || bootPhase === "starting" || wcLoading
                ? "bg-warning/70 animate-pulse"
                : "bg-surface-4",
            )}
          />
          <span className="text-xs text-muted-foreground">{phaseLabel}</span>
        </div>

        {/* Steps — driven by phases, not user input */}
        <div className="flex flex-col gap-1.5">
          <Step
            done={!wcLoading}
            label="Environment booted"
            detail="WebContainer sandbox is ready"
          />
          <Step
            done={bootPhase === "starting" || bootPhase === "running"}
            label="Dependencies installed"
            detail={
              bootPhase === "installing"
                ? "Running npm install…"
                : bootPhase === "failed"
                ? "Install or build failed — see details below"
                : "Packages ready"
            }
          />
          <Step
            done={bootPhase === "running"}
            label="Dev server running"
            detail={
              serverUrl ? (
                <a
                  href={serverUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline underline-offset-2 hover:opacity-80"
                >
                  {serverUrl}
                </a>
              ) : bootPhase === "starting" ? (
                "Waiting for first request…"
              ) : (
                "Will start automatically after install"
              )
            }
          />
          <Step
            done={false}
            label="Open a file"
            detail="Click any file in the Explorer to edit"
          />
        </div>

        {/* Failure surface + retry */}
        {bootPhase === "failed" && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 mt-1">
            <TerminalIcon className="size-3.5 text-destructive/70 mt-0.5 shrink-0" />
            <div className="min-w-0 flex flex-col gap-1.5 flex-1">
              <p className="text-xs text-destructive/90 leading-relaxed font-medium">
                {bootError ?? "Something went wrong starting the project."}
              </p>
              <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                The terminal below shows the full output. You can retry the
                install + dev pipeline:
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="h-7 text-xs w-fit mt-0.5"
                onClick={onRetry}
              >
                Retry boot
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Step({
  done,
  label,
  detail,
}: {
  done: boolean;
  label: string;
  detail: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-surface-2/40">
      <span
        className={cn(
          "size-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[9px] font-bold",
          done
            ? "bg-success/20 text-success"
            : "bg-surface-3/80 text-muted-foreground/50",
        )}
      >
        {done ? "✓" : "·"}
      </span>
      <div className="min-w-0 flex flex-col gap-0.5">
        <p
          className={cn(
            "text-xs font-medium",
            done ? "text-foreground/80" : "text-muted-foreground",
          )}
        >
          {label}
        </p>
        <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
          {detail}
        </p>
      </div>
    </div>
  );
}
