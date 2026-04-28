import { useEffect, useRef, useState } from "react"
import { ChevronRightIcon, CopyMinusIcon, FilePlusCornerIcon, FolderPlusIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useMutation } from "convex/react"
import { api } from "../../../../../convex/_generated/api"

import { useProject } from "../../hooks/use-projects"
import { Id } from "../../../../../convex/_generated/dataModel"
import {
  useCreateFile,
  useCreateFolder,
  useFolderContents
} from "../../hooks/use-files"
import { CreateInput } from "./create-input"
import { LoadingRow } from "./loading-row"
import { Tree } from "./tree"

export const FileExplorer = ({
  projectId
}: {
  projectId: Id<"projects">
}) => {
  const [isOpen, setIsOpen] = useState(true);
  // Backfill once per project mount: moves orphaned flat files into their proper
  // folder hierarchy. Safe to call repeatedly — already-correct rows are skipped.
  const backfillFilePaths = useMutation(api.files_by_path.backfillFilePaths);
  const backfillRan = useRef(false);
  useEffect(() => {
    if (backfillRan.current) return;
    backfillRan.current = true;
    backfillFilePaths({ projectId }).catch(() => { /* non-critical */ });
  }, [projectId, backfillFilePaths]);
  const [collapseKey, setCollapseKey] = useState(0);
  const [creating, setCreating] = useState<"file" | "folder" | null>(
    null
  );

  const project = useProject(projectId);
  const rootFiles = useFolderContents({
    projectId,
    enabled: isOpen,
  });

  const createFile = useCreateFile();
  const createFolder = useCreateFolder();
  const handleCreate = (name: string) => {
    setCreating(null);

    if (creating === "file") {
      createFile({
        projectId,
        name,
        content: "",
        parentId: undefined,
      });
    } else {
      createFolder({
        projectId,
        name,
        parentId: undefined,
      });
    }
  };

  return (
    // Praxiom — file pane sits one level lighter than editor canvas (surface-1 vs surface-0)
    <div className="h-full bg-surface-1 flex flex-col">
      <div className="h-10 px-3 flex items-center justify-between shrink-0 border-b border-surface-3/60">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/50">
          Explorer
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setIsOpen(true);
              setCreating("file");
            }}
            variant="highlight"
            size="icon-xs"
          >
            <FilePlusCornerIcon className="size-3.5" />
          </Button>
          <Button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setIsOpen(true);
              setCreating("folder");
            }}
            variant="highlight"
            size="icon-xs"
          >
            <FolderPlusIcon className="size-3.5" />
          </Button>
          <Button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setCollapseKey((prev) => prev + 1);
            }}
            variant="highlight"
            size="icon-xs"
          >
            <CopyMinusIcon className="size-3.5" />
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div
          role="button"
          onClick={() => setIsOpen((value) => !value)}
          className="cursor-pointer w-full text-left flex items-center gap-1.5 h-7 px-3 hover:bg-surface-2 transition-colors"
        >
          <ChevronRightIcon
            className={cn(
              "size-3 shrink-0 text-muted-foreground/50 transition-transform",
              isOpen && "rotate-90"
            )}
          />
          <p className="text-xs font-medium tracking-[-0.01em] line-clamp-1 text-foreground/80">
            {project?.name ?? "Loading..."}
          </p>
        </div>
        {isOpen && (
          <>
            {rootFiles === undefined && <LoadingRow level={0} />}
            {creating && (
              <CreateInput
                type={creating}
                level={0}
                onSubmit={handleCreate}
                onCancel={() => setCreating(null)}
              />
            )}
            {rootFiles?.map((item) => (
              <Tree
                key={`${item._id}-${collapseKey}`}
                item={item}
                level={0}
                projectId={projectId}
              />
            ))}
          </>
        )}
      </ScrollArea>
    </div>
  )
}