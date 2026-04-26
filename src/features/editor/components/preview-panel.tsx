"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCw, ExternalLink } from "lucide-react";
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
    defaultPath = "index.html",
    refreshTrigger = 0
}: PreviewPanelProps) => {
    const [path, setPath] = useState(defaultPath);
    const [key, setKey] = useState(0); // Used to force refresh
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isLoading, setIsLoading] = useState(true);

    const { serverUrl } = useWebContainer();

    useEffect(() => {
        if (refreshTrigger > 0) {
            setKey(prev => prev + 1);
            setIsLoading(true);
        }
    }, [refreshTrigger]);

    // Construct the preview URL
    // If a dev server is running (serverUrl), use it.
    // Otherwise, fall back to our simple static file serving API.
    const previewUrl = serverUrl
        ? `${serverUrl}/${path.startsWith("/") ? path.slice(1) : path}`
        : `/api/preview/${projectId}/${path}`;

    const handleRefresh = () => {
        setIsLoading(true);
        setKey((prev) => prev + 1);
    };

    const handleLoad = () => {
        setIsLoading(false);
    };

    return (
        // Praxiom §2.3 — surface depth replaces border. Preview panel sits on
        // surface-1 so it's lighter than the surface-0 main background.
        <div className={cn("flex flex-col h-full bg-surface-1", className)}>
            {/* Toolbar — surface-2 (one step lighter than panel) */}
            <div className="h-10 flex items-center gap-2 px-2 bg-surface-2 shrink-0">
                <div className="flex-1 flex items-center gap-1 bg-input rounded-md px-2 h-7">
                    <span className="text-muted-foreground/70 text-xs font-mono">/</span>
                    <Input
                        value={path}
                        onChange={(e) => setPath(e.target.value)}
                        className="h-6 bg-transparent shadow-none focus-visible:ring-0 px-0 text-xs font-mono"
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleRefresh();
                        }}
                    />
                </div>
                <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={handleRefresh}
                    title="Refresh"
                >
                    <RotateCw className={cn("size-3.5", isLoading && "animate-spin")} />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => window.open(previewUrl, "_blank")}
                    title="Open in new tab"
                >
                    <ExternalLink className="size-3.5" />
                </Button>
            </div>

            {/* Iframe area */}
            <div className="flex-1 relative">
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-surface-1/80 backdrop-blur-sm z-10">
                        <div className="size-8 rounded-full bg-primary/20 animate-pulse" />
                    </div>
                )}
                <iframe
                    key={key}
                    ref={iframeRef}
                    src={previewUrl}
                    /* The iframe content (user's app) defines its own bg.
                       Preview frame stays transparent so transitions feel seamless. */
                    className="w-full h-full bg-transparent"
                    title="Preview"
                    sandbox="allow-scripts allow-same-origin allow-forms"
                    onLoad={handleLoad}
                />
            </div>
        </div>
    );
};
