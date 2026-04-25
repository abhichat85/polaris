"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import ky from "ky";
import { toast } from "sonner";
import { Id } from "../../../../convex/_generated/dataModel";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";

import { useCreateProject } from "../hooks/use-projects";
import { useCreateConversation } from "../../conversations/hooks/use-conversations";
import { PROJECT_TEMPLATES } from "../lib/templates";
import { cn } from "@/lib/utils";
import { DEFAULT_CONVERSATION_TITLE } from "../../../../convex/constants";

interface ProjectGeneratorDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const ProjectGeneratorDialog = ({
    open,
    onOpenChange,
}: ProjectGeneratorDialogProps) => {
    const router = useRouter();
    const createProject = useCreateProject();
    const createConversation = useCreateConversation();

    const [projectName, setProjectName] = useState("");
    const [selectedTemplate, setSelectedTemplate] = useState(PROJECT_TEMPLATES[0].id);
    const [instructions, setInstructions] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerate = async () => {
        if (!projectName.trim()) {
            toast.error("Please enter a project name");
            return;
        }

        setIsGenerating(true);
        try {
            // 1. Create Project
            const projectId = await createProject({
                name: projectName,
            });

            if (!projectId) {
                throw new Error("Failed to create project");
            }

            // 2. Create Conversation
            const conversationId = await createConversation({
                projectId,
                title: "Project Generation",
            });

            if (!conversationId) {
                throw new Error("Failed to create conversation");
            }

            // 3. Construct Prompt
            const template = PROJECT_TEMPLATES.find(t => t.id === selectedTemplate)!;
            let prompt = template.prompt;

            if (instructions.trim()) {
                prompt += `\n\nAdditional Instructions:\n${instructions}`;
            }

            // 4. Send Message (Trigger Agent)
            await ky.post("/api/messages", {
                json: {
                    conversationId,
                    message: prompt,
                },
            });

            toast.success("Project generation started");

            // 5. Redirect
            onOpenChange(false);
            router.push(`/projects/${projectId}`);
        } catch (error) {
            console.error(error);
            toast.error("Failed to generate project");
            setIsGenerating(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl h-[80vh] flex flex-col p-0">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="size-5 text-primary" />
                        Generate with AI
                    </DialogTitle>
                    <DialogDescription>
                        Create a new project from a template or your own description.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="project-name">Project Name</Label>
                        <Input
                            id="project-name"
                            placeholder="e.g., my-awesome-app"
                            value={projectName}
                            onChange={(e) => setProjectName(e.target.value)}
                        />
                    </div>

                    <div className="space-y-3">
                        <Label>Choose a Template</Label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {PROJECT_TEMPLATES.map((template) => (
                                <div
                                    key={template.id}
                                    className={cn(
                                        "cursor-pointer rounded-lg border p-4 hover:bg-accent transition-colors text-left",
                                        selectedTemplate === template.id && "border-primary bg-accent/50 ring-1 ring-primary"
                                    )}
                                    onClick={() => setSelectedTemplate(template.id)}
                                >
                                    <div className="font-semibold mb-1 flex items-center gap-2">
                                        {/* Icons could be mapped dynamically, for now simplified */}
                                        {template.name}
                                    </div>
                                    <div className="text-sm text-muted-foreground line-clamp-2">
                                        {template.description}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="instructions">
                            Additional Instructions (Optional)
                        </Label>
                        <Textarea
                            id="instructions"
                            placeholder="e.g., Use purple as the primary color, add a 'Contact' page..."
                            value={instructions}
                            onChange={(e) => setInstructions(e.target.value)}
                            className="h-24 resize-none"
                        />
                    </div>
                </div>

                <div className="p-6 pt-2 border-t mt-auto">
                    <Button
                        className="w-full gap-2"
                        size="lg"
                        onClick={handleGenerate}
                        disabled={isGenerating || !projectName.trim()}
                    >
                        {isGenerating ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : (
                            <Wand2 className="size-4" />
                        )}
                        Generate Project
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
