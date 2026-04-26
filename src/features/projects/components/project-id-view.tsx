"use client";

/**
 * ProjectIdView — center pane content for the project IDE.
 *
 * The 3-pane shell (`ProjectIdLayout`) owns the rail, file tree, and agent;
 * this view just renders the editor surface in the center pane. Preview is
 * a toggle inside `EditorView` itself (Praxiom — keep concerns local).
 */

import { EditorView } from "@/features/editor/components/editor-view";
import { Id } from "../../../../convex/_generated/dataModel";

export const ProjectIdView = ({
  projectId,
}: {
  projectId: Id<"projects">;
}) => {
  return <EditorView projectId={projectId} />;
};
