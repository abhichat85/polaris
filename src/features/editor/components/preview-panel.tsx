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
        <div className={cn("flex flex-col h-full bg-background border-l", className)}>
            <div className="h-10 flex items-center gap-2 px-2 border-b bg-muted/30">
                <div className="flex-1 flex items-center gap-1 bg-background border rounded-md px-2 h-7">
                    <span className="text-muted-foreground text-xs">/</span>
                    <Input
                        value={path}
                        onChange={(e) => setPath(e.target.value)}
                        className="h-6 border-none shadow-none focus-visible:ring-0 px-0 text-xs"
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
            <div className="flex-1 relative">
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                )}
                <iframe
                    key={key}
                    ref={iframeRef}
                    src={previewUrl}
                    className="w-full h-full border-none bg-white"
                    title="Preview"
                    sandbox="allow-scripts allow-same-origin allow-forms"
                    onLoad={handleLoad}
                />
            </div>
        </div>
    );
};
