"use client";

import { SparkleIcon, Wand2, Plus, Github } from "lucide-react";
import { FaGithub } from "react-icons/fa";
import {
  adjectives,
  animals,
  colors,
  uniqueNamesGenerator,
} from "unique-names-generator";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";

import { ProjectsList } from "./projects-list";
import { useCreateProject, useProjects } from "../hooks/use-projects";
import { ProjectsCommandDialog } from "./projects-command-dialog";
import { ProjectGeneratorDialog } from "./project-generator-dialog";
import { ImportDialog } from "./import-dialog";

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

      <div className="min-h-screen bg-surface-0 flex flex-col items-center justify-center p-6 md:p-16">
        <div className="w-full max-w-sm mx-auto flex flex-col gap-4 items-center">

          <div className="flex justify-between gap-4 w-full items-center">

            <div className="flex items-center gap-2 w-full group/logo">
              <img src="/logo.svg" alt="Polaris" className="size-[32px] md:size-[46px]" />
              {/* Praxiom §1.3 — wordmark uses Outfit (font-heading), tight tracking */}
              <h1 className="font-heading text-4xl md:text-5xl font-semibold tracking-[-0.02em] text-foreground">
                Polaris
              </h1>
            </div>

          </div>

          <div className="flex flex-col gap-4 w-full">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {/* Praxiom — borderless action cards on surface-2, hover lifts to surface-3 */}
              <Button
                variant="ghost"
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
                className="h-auto items-start justify-start p-4 bg-surface-2 hover:bg-surface-3 flex flex-col gap-6 rounded-lg text-foreground"
              >
                <div className="flex items-center justify-between w-full">
                  <SparkleIcon className="size-4 text-primary" />
                  <Kbd className="bg-surface-3 text-muted-foreground">
                    ⌘J
                  </Kbd>
                </div>
                <div>
                  <span className="text-sm font-medium">
                    New
                  </span>
                </div>
              </Button>
              <Button
                variant="ghost"
                onClick={() => setGeneratorOpen(true)}
                className="h-auto items-start justify-start p-4 bg-surface-2 hover:bg-surface-3 flex flex-col gap-6 rounded-lg text-foreground"
              >
                <div className="flex items-center justify-between w-full">
                  <Wand2 className="size-4 text-primary" />
                  <Kbd className="bg-surface-3 text-muted-foreground">
                    ⌘G
                  </Kbd>
                </div>
                <div>
                  <span className="text-sm font-medium">
                    Generate
                  </span>
                </div>
              </Button>
              <Button
                variant="ghost"
                onClick={() => setImportOpen(true)}
                className="h-auto items-start justify-start p-4 bg-surface-2 hover:bg-surface-3 flex flex-col gap-6 rounded-lg text-foreground"
              >
                <div className="flex items-center justify-between w-full">
                  <Github className="size-4 text-primary" />
                  <Kbd className="bg-surface-3 text-muted-foreground">
                    ⌘I
                  </Kbd>
                </div>
                <div>
                  <span className="text-sm font-medium">
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
