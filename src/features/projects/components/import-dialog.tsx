"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Github } from "lucide-react";
import { toast } from "sonner";
import ky from "ky";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ImportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const ImportDialog = ({ open, onOpenChange }: ImportDialogProps) => {
    const router = useRouter();
    const [url, setUrl] = useState("");
    const [projectName, setProjectName] = useState("");
    const [isImporting, setIsImporting] = useState(false);

    const handleImport = async () => {
        if (!url) return;

        try {
            setIsImporting(true);

            const res = await ky.post("/api/github/import", {
                json: {
                    url,
                    name: projectName || undefined,
                },
                timeout: 60000,
            }).json<{ projectId: string }>();

            toast.success("Project imported successfully");
            onOpenChange(false);

            // Redirect to the new project
            router.push(`/project/${res.projectId}`);

        } catch (error) {
            console.error(error);
            toast.error("Failed to import project. Make sure the repository is public.");
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Import from GitHub</DialogTitle>
                    <DialogDescription>
                        Enter a public GitHub repository URL to import it as a new project.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="url">Repository URL</Label>
                        <Input
                            id="url"
                            placeholder="https://github.com/owner/repo"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            disabled={isImporting}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="name">Project Name (Optional)</Label>
                        <Input
                            id="name"
                            placeholder="My Project"
                            value={projectName}
                            onChange={(e) => setProjectName(e.target.value)}
                            disabled={isImporting}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isImporting}>
                        Cancel
                    </Button>
                    <Button onClick={handleImport} disabled={!url || isImporting}>
                        {isImporting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Importing...
                            </>
                        ) : (
                            <>
                                <Github className="mr-2 h-4 w-4" />
                                Import
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
