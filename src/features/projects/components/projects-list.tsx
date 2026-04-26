import Link from "next/link";
import { FaGithub } from "react-icons/fa";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  GlobeIcon,
  Loader2Icon,
} from "lucide-react";

import { Spinner } from "@/components/ui/spinner";
import { Kbd } from "@/components/ui/kbd";

import { Doc } from "../../../../convex/_generated/dataModel";

import { useProjectsPartial } from "../hooks/use-projects";

const formatTimestamp = (timestamp: number) =>
  formatDistanceToNow(new Date(timestamp), { addSuffix: true });

const getProjectIcon = (project: Doc<"projects">) => {
  if (project.importStatus === "completed") {
    return <FaGithub className="size-3.5 text-muted-foreground" />;
  }
  if (project.importStatus === "failed") {
    return <AlertCircleIcon className="size-3.5 text-muted-foreground" />;
  }
  if (project.importStatus === "importing") {
    return (
      <Loader2Icon className="size-3.5 text-muted-foreground animate-spin" />
    );
  }
  return <GlobeIcon className="size-3.5 text-muted-foreground" />;
};

interface ProjectsListProps {
  onViewAll: () => void;
}

const ProjectRow = ({ data }: { data: Doc<"projects"> }) => (
  <Link
    href={`/projects/${data._id}`}
    className="group flex items-center justify-between gap-3 px-3 py-2 -mx-3 rounded-md hover:bg-surface-2 transition-colors"
  >
    <div className="flex items-center gap-2.5 min-w-0">
      {getProjectIcon(data)}
      <span className="text-sm font-medium text-foreground truncate">
        {data.name}
      </span>
    </div>
    <div className="flex items-center gap-2 shrink-0">
      <span className="text-xs text-muted-foreground/70">
        {formatTimestamp(data.updatedAt)}
      </span>
      <ArrowRightIcon className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
    </div>
  </Link>
);

export const ProjectsList = ({ onViewAll }: ProjectsListProps) => {
  const projects = useProjectsPartial(6);

  if (projects === undefined) {
    return (
      <div className="flex justify-center">
        <Spinner className="size-4 text-ring" />
      </div>
    );
  }

  if (projects.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          Recent
        </span>
        <button
          type="button"
          onClick={onViewAll}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View all
          <Kbd className="bg-surface-3 text-muted-foreground">⌘K</Kbd>
        </button>
      </div>
      <ul className="flex flex-col">
        {projects.map((project) => (
          <li key={project._id}>
            <ProjectRow data={project} />
          </li>
        ))}
      </ul>
    </div>
  );
};
