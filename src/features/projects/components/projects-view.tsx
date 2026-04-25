"use client";

import { Poppins } from "next/font/google";
import { SparkleIcon, Wand2, Plus, Github } from "lucide-react";
import { FaGithub } from "react-icons/fa";
import {
  adjectives,
  animals,
  colors,
  uniqueNamesGenerator,
} from "unique-names-generator";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";

import { ProjectsList } from "./projects-list";
import { useCreateProject, useProjects } from "../hooks/use-projects";
import { ProjectsCommandDialog } from "./projects-command-dialog";
import { ProjectGeneratorDialog } from "./project-generator-dialog";
import { ImportDialog } from "./import-dialog";

const font = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

export const ProjectsView = () => {
  const createProject = useCreateProject();

  const [commandDialogOpen, setCommandDialogOpen] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === "k") {
          e.preventDefault();
          setCommandDialogOpen(true);
        } else if (e.key === "g") {
          e.preventDefault();
          setGeneratorOpen(true);
        } else if (e.key === "i") {
          e.preventDefault();
          setImportOpen(true);
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <ProjectsCommandDialog
        open={commandDialogOpen}
        onOpenChange={setCommandDialogOpen}
      />
      <ProjectGeneratorDialog
        open={generatorOpen}
        onOpenChange={setGeneratorOpen}
      />
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
      />

      <div className="min-h-screen bg-sidebar flex flex-col items-center justify-center p-6 md:p-16">
        <div className="w-full max-w-sm mx-auto flex flex-col gap-4 items-center">

          <div className="flex justify-between gap-4 w-full items-center">

            <div className="flex items-center gap-2 w-full group/logo">
              <img src="/logo.svg" alt="Polaris" className="size-[32px] md:size-[46px]" />
              <h1 className={cn(
                "text-4xl md:text-5xl font-semibold",
                font.className,
              )}>
                Polaris
              </h1>
            </div>

          </div>

          <div className="flex flex-col gap-4 w-full">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const projectName = uniqueNamesGenerator({
                    dictionaries: [
                      adjectives,
                      animals,
                      colors,
                    ],
                    separator: "-",
                    length: 3,
                  });

                  createProject({
                    name: projectName,
                  });
                }}
                className="h-full items-start justify-start p-4 bg-background border flex flex-col gap-6 rounded-none"
              >
                <div className="flex items-center justify-between w-full">
                  <SparkleIcon className="size-4" />
                  <Kbd className="bg-accent border">
                    ⌘J
                  </Kbd>
                </div>
                <div>
                  <span className="text-sm">
                    New
                  </span>
                </div>
              </Button>
              <Button
                variant="outline"
                onClick={() => setGeneratorOpen(true)}
                className="h-full items-start justify-start p-4 bg-background border flex flex-col gap-6 rounded-none"
              >
                <div className="flex items-center justify-between w-full">
                  <Wand2 className="size-4" />
                  <Kbd className="bg-accent border">
                    ⌘G
                  </Kbd>
                </div>
                <div>
                  <span className="text-sm">
                    Generate
                  </span>
                </div>
              </Button>
              <Button
                variant="outline"
                onClick={() => setImportOpen(true)}
                className="h-full items-start justify-start p-4 bg-background border flex flex-col gap-6 rounded-none"
              >
                <div className="flex items-center justify-between w-full">
                  <Github className="size-4" />
                  <Kbd className="bg-accent border">
                    ⌘I
                  </Kbd>
                </div>
                <div>
                  <span className="text-sm">
                    Import
                  </span>
                </div>
              </Button>
            </div>

            <ProjectsList onViewAll={() => setCommandDialogOpen(true)} />

          </div>

        </div>
      </div>
    </>
  );
};
