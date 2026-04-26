import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"

import { useFile } from "@/features/projects/hooks/use-files";

import { useEditor } from "../hooks/use-editor";
import { Id } from "../../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { FileIcon } from "@react-symbols/icons/utils";
import { XIcon } from "lucide-react";

const Tab = ({
  fileId,
  projectId,
}: {
  fileId: Id<"files">;
  projectId: Id<"projects">;
}) => {
  const file = useFile(fileId);
  const {
    activeTabId,
    previewTabId,
    setActiveTab,
    openFile,
    closeTab,
  } = useEditor(projectId);

  const isActive = activeTabId === fileId;
  const isPreview = previewTabId === fileId;
  const fileName = file?.name ?? "Loading...";

  return (
    <div
      onClick={() => setActiveTab(fileId)}
      onDoubleClick={() => openFile(fileId, { pinned: true })}
      className={cn(
        // Praxiom — tabs use surface contrast (no borders).
        // Inactive: muted-foreground on surface-1 nav, hover lifts to surface-2.
        // Active: surface-0 (= main editor bg) + foreground text — appears "carved out".
        "flex items-center gap-2 h-8.75 pl-2 pr-1.5 cursor-pointer text-muted-foreground group transition-colors hover:bg-surface-2",
        isActive && "bg-surface-0 text-foreground hover:bg-surface-0",
      )}
    >
      {file === undefined ? (
        <Spinner className="text-ring" />
      ) : (
        <FileIcon fileName={fileName} autoAssign className="size-4" />
      )}
      <span className={cn(
        "text-sm whitespace-nowrap",
        isPreview && "italic"
      )}>
        {fileName}
      </span>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          closeTab(fileId);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            closeTab(fileId);
          }
        }}
        className={cn(
          // Praxiom — close button uses surface-3 hover, not white opacity
          "p-0.5 rounded-sm hover:bg-surface-3 opacity-0 group-hover:opacity-100 transition-opacity",
          isActive && "opacity-100"
        )}
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
};

export const TopNavigation = ({ 
  projectId
}: { 
  projectId: Id<"projects">
}) => {
  const { openTabs } = useEditor(projectId);

  return (
    <ScrollArea className="flex-1">
      {/* Praxiom — tab bar uses surface-1 (matches sidebar/top header level) */}
      <nav className="bg-surface-1 flex items-center h-8.75">
        {openTabs.map((fileId) => (
          <Tab
            key={fileId}
            fileId={fileId}
            projectId={projectId}
          />
        ))}
      </nav>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
};
