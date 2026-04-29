"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLinkIcon, MonitorOffIcon, RefreshCwIcon, RotateCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Id } from "../../../../convex/_generated/dataModel";
import { useWebContainer } from "../context/webcontainer-context";

interface PreviewPanelProps {
  projectId: Id<"projects">;
  className?: string;
  defaultPath?: string;
  refreshTrigger?: number;
}

export const PreviewPanel = ({
  projectId,
  className,
  defaultPath = "",
  refreshTrigger = 0,
}: PreviewPanelProps) => {
  const [path, setPath] = useState(defaultPath);
  const [iframeKey, setIframeKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { serverUrl, isLoading: wcLoading, bootPhase, restartDev } = useWebContainer();

  // Refresh iframe when parent editor saves a file.
  useEffect(() => {
    if (refreshTrigger > 0) {
      setIframeKey(prev => prev + 1);
      setIsLoading(true);
    }
  }, [refreshTrigger]);

  // Auto-navigate to root when server first comes up.
  const serverUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (serverUrl && !serverUrlRef.current) {
      serverUrlRef.current = serverUrl;
      setPath("");
      setIframeKey(prev => prev + 1);
      setIsLoading(true);
    }
  }, [serverUrl]);

  // Construct the preview URL.
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const previewUrl = serverUrl
    ? `${serverUrl}/${normalizedPath}`
    : `/api/preview/${projectId}/${normalizedPath || "index.html"}`;

  const handleRefresh = () => {
    setIframeKey(prev => prev + 1);
    setIsLoading(true);
  };

  return (
    <div className={cn("flex flex-col h-full bg-surface-1", className)}>
      {/* Toolbar */}
      <div className="h-10 flex items-center gap-2 px-2 bg-surface-1 shrink-0 border-b border-surface-3/60">
        {/* Server status dot */}
        <span
          className={cn(
            "size-1.5 rounded-full shrink-0",
            serverUrl ? "bg-success" : wcLoading ? "bg-warning/70 animate-pulse" : "bg-surface-4",
          )}
        />

        {/* URL bar */}
        <div className="flex-1 flex items-center gap-1 bg-surface-2 rounded-md px-2.5 h-6.5">
          {serverUrl && (
            <span className="text-muted-foreground/50 text-[10px] font-mono shrink-0 truncate max-w-[120px]">
              {serverUrl.replace(/https?:\/\//, "")}
            </span>
          )}
          <span className="text-muted-foreground/30 text-[10px] font-mono shrink-0">/</span>
          <Input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder={serverUrl ? "" : "index.html"}
            className="h-5 bg-transparent shadow-none focus-visible:ring-0 px-0 text-[10px] font-mono border-0 min-w-0"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRefresh();
            }}
          />
        </div>

        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleRefresh}
          title="Refresh preview"
          disabled={!serverUrl}
        >
          <RotateCwIcon className={cn("size-3.5", isLoading && serverUrl && "animate-spin")} />
        </Button>
        {/* Reinstall + restart — always available so the user can recover
            from build errors (e.g. missing packages) without going to the
            terminal. Uses a distinct icon to signal "heavy restart". */}
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={restartDev}
          title={bootPhase === "installing" ? "Installing…" : "Reinstall & restart dev server"}
          disabled={bootPhase === "installing" || bootPhase === "starting"}
        >
          <RefreshCwIcon
            className={cn(
              "size-3.5",
              (bootPhase === "installing" || bootPhase === "starting") && "animate-spin opacity-50",
            )}
          />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => window.open(previewUrl, "_blank")}
          title="Open in new tab"
          disabled={!serverUrl}
        >
          <ExternalLinkIcon className="size-3.5" />
        </Button>
      </div>

      {/* Content area */}
      <div className="flex-1 relative bg-white">
        {/* No server — orientation placeholder */}
        {!serverUrl && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-surface-0 z-20">
            <MonitorOffIcon className="size-8 text-muted-foreground/20" />
            <div className="text-center space-y-1.5 px-6">
              <p className="text-sm font-medium text-muted-foreground/60">
                {wcLoading ? "Starting environment…" : "No dev server running"}
              </p>
              {!wcLoading && (
                <p className="text-xs text-muted-foreground/40 leading-relaxed">
                  Run{" "}
                  <code className="font-mono text-[10px] bg-surface-2 px-1.5 py-0.5 rounded text-muted-foreground/70">
                    npm run dev
                  </code>{" "}
                  in the terminal to start the preview
                </p>
              )}
            </div>
          </div>
        )}

        {/* Loading overlay while iframe loads */}
        {isLoading && serverUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-1/60 backdrop-blur-sm z-10">
            <span className="size-6 rounded-full bg-primary/20 animate-pulse" />
          </div>
        )}

        <iframe
          key={iframeKey}
          ref={iframeRef}
          src={serverUrl ? previewUrl : "about:blank"}
          className="w-full h-full bg-white"
          title="Preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          onLoad={() => setIsLoading(false)}
        />
      </div>
    </div>
  );
};
