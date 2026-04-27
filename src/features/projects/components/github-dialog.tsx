"use client";

import { useEffect, useState } from "react";
import { Github, Loader2, UploadCloud } from "lucide-react";
import { polarisKy as ky } from "@/lib/http/polaris-ky";
import { toast } from "sonner";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getGitHubOAuthUrl } from "@/lib/github";
import { Id } from "../../../../convex/_generated/dataModel";

interface GitHubDialogProps {
    projectId: Id<"projects">;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const GitHubDialog = ({
    projectId,
    open,
    onOpenChange,
}: GitHubDialogProps) => {
    const [token, setToken] = useState<string | null>(null);
    const [repoName, setRepoName] = useState("");
    const [isPrivate, setIsPrivate] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // Listen for OAuth token from popup
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (
                event.origin === window.location.origin &&
                event.data?.type === "GITHUB_TOKEN"
            ) {
                setToken(event.data.token);
                toast.success("Connected to GitHub");
            }
        };

        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, []);

    const handleConnect = () => {
        const url = getGitHubOAuthUrl();
        const width = 600;
        const height = 700;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;

        window.open(
            url,
            "GitHubAuth",
            `width=${width},height=${height},left=${left},top=${top}`
        );
    };

    const handleExport = async () => {
        if (!token || !repoName) return;

        setIsExporting(true);
        try {
            await ky.post("/api/github/export", {
                json: {
                    projectId,
                    accessToken: token,
                    repoName,
                    isPrivate,
                },
            });
            toast.success("Export started in background");
            onOpenChange(false);
        } catch {
            toast.error("Failed to start export");
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>GitHub Integration</DialogTitle>
                    <DialogDescription>
                        Export your project to a new GitHub repository.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4 py-4">
                    {!token ? (
                        <div className="flex flex-col items-center justify-center gap-4 py-8">
                            <p className="text-muted-foreground text-center text-sm">
                                Connect your GitHub account to enable export functionality.
                            </p>
                            <Button onClick={handleConnect} className="gap-2">
                                <Github className="size-4" />
                                Connect GitHub
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="repo-name">Repository Name</Label>
                                <Input
                                    id="repo-name"
                                    placeholder="my-polaris-project"
                                    value={repoName}
                                    onChange={(e) => setRepoName(e.target.value)}
                                />
                            </div>

                            <div className="flex items-center justify-between space-x-2">
                                <Label htmlFor="private" className="flex flex-col space-y-1">
                                    <span>Private Repository</span>
                                    <span className="font-normal text-xs text-muted-foreground">
                                        Only you will be able to see this code
                                    </span>
                                </Label>
                                <Switch
                                    id="private"
                                    checked={isPrivate}
                                    onCheckedChange={setIsPrivate}
                                />
                            </div>

                            <Button
                                onClick={handleExport}
                                disabled={!repoName || isExporting}
                                className="w-full gap-2"
                            >
                                {isExporting ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : (
                                    <UploadCloud className="size-4" />
                                )}
                                Start Export
                            </Button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
