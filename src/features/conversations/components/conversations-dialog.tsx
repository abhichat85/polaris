"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
    Loader2,
    MessageSquare,
    MoreVertical,
    Pencil,
    Trash2,
    Check,
    X
} from "lucide-react";
import { toast } from "sonner";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

import { Id } from "../../../../convex/_generated/dataModel";
import {
    useConversations,
    useDeleteConversation,
    useUpdateConversationTitle
} from "../hooks/use-conversations";
import { cn } from "@/lib/utils";

interface ConversationsDialogProps {
    projectId: Id<"projects">;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelectConversation: (id: Id<"conversations">) => void;
    selectedConversationId: Id<"conversations"> | null;
}

export const ConversationsDialog = ({
    projectId,
    open,
    onOpenChange,
    onSelectConversation,
    selectedConversationId,
}: ConversationsDialogProps) => {
    const conversations = useConversations(projectId);
    const deleteConversation = useDeleteConversation();
    const updateTitle = useUpdateConversationTitle();

    const [editingId, setEditingId] = useState<Id<"conversations"> | null>(null);
    const [editTitle, setEditTitle] = useState("");
    const [deletingId, setDeletingId] = useState<Id<"conversations"> | null>(null);

    const startEditing = (id: Id<"conversations">, currentTitle: string) => {
        setEditingId(id);
        setEditTitle(currentTitle);
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditTitle("");
    };

    const handleUpdateTitle = async (id: Id<"conversations">) => {
        if (!editTitle.trim()) return;

        try {
            await updateTitle({ conversationId: id, title: editTitle });
            setEditingId(null);
            toast.success("Conversation renamed");
        } catch {
            toast.error("Failed to rename conversation");
        }
    };

    const handleDelete = async (id: Id<"conversations">) => {
        try {
            setDeletingId(id);
            await deleteConversation({ conversationId: id });

            if (selectedConversationId === id) {
                onSelectConversation(null as any); // Clear selection or handle in parent
            }

            toast.success("Conversation deleted");
        } catch {
            toast.error("Failed to delete conversation");
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] h-[600px] flex flex-col p-0 gap-0">
                <DialogHeader className="p-4 border-b">
                    <DialogTitle>Conversations</DialogTitle>
                </DialogHeader>

                <ScrollArea className="flex-1 p-4">
                    <div className="flex flex-col gap-2">
                        {!conversations ? (
                            <div className="flex items-center justify-center py-8 text-muted-foreground">
                                <Loader2 className="h-6 w-6 animate-spin" />
                            </div>
                        ) : conversations.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                <MessageSquare className="h-12 w-12 mb-4 opacity-50" />
                                <p>No conversations yet</p>
                            </div>
                        ) : (
                            conversations.map((conversation) => (
                                <div
                                    key={conversation._id}
                                    className={cn(
                                        "group flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors",
                                        selectedConversationId === conversation._id && "bg-muted border-primary/50"
                                    )}
                                >
                                    <div className="flex-1 min-w-0 mr-2">
                                        {editingId === conversation._id ? (
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    value={editTitle}
                                                    onChange={(e) => setEditTitle(e.target.value)}
                                                    className="h-8 text-sm"
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter") handleUpdateTitle(conversation._id);
                                                        if (e.key === "Escape") cancelEditing();
                                                    }}
                                                    autoFocus
                                                />
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-8 w-8 shrink-0 text-green-600 hover:text-green-700 hover:bg-green-100 dark:hover:bg-green-900/30"
                                                    onClick={() => handleUpdateTitle(conversation._id)}
                                                >
                                                    <Check className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                                                    onClick={cancelEditing}
                                                >
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ) : (
                                            <div
                                                className="cursor-pointer"
                                                onClick={() => {
                                                    onSelectConversation(conversation._id);
                                                    onOpenChange(false);
                                                }}
                                            >
                                                <div className="font-medium truncate text-sm">
                                                    {conversation.title}
                                                </div>
                                                <div className="text-xs text-muted-foreground mt-0.5">
                                                    {formatDistanceToNow(conversation.updatedAt, { addSuffix: true })}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {!editingId && (
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem
                                                    onClick={() => startEditing(conversation._id, conversation.title)}
                                                >
                                                    <Pencil className="h-4 w-4 mr-2" />
                                                    Rename
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
                                                    onClick={() => handleDelete(conversation._id)}
                                                    disabled={deletingId === conversation._id}
                                                >
                                                    {deletingId === conversation._id ? (
                                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="h-4 w-4 mr-2" />
                                                    )}
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
};
