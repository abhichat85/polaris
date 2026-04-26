"use client";

/**
 * ProjectsView — Polaris landing.
 *
 * Praxiom-aligned design: the prompt is the centerpiece. Spec-driven
 * engineering is Polaris's differentiator vs. generic AI coding agents,
 * so the entry surface is a textarea with optional spec attachment.
 *
 * Submitting:
 *   1. createProject → projectId
 *   2. createConversation(projectId)
 *   3. POST /api/messages with the prompt (spec text appended if uploaded)
 *   4. router.push(`/projects/<projectId>`)
 *
 * Secondary affordances (blank, GitHub import, search) live below as
 * lightweight text actions — they are escape hatches, not equal peers
 * to the prompt.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  ArrowUp,
  FileText,
  Github,
  Loader2,
  Paperclip,
  Plus,
  Search,
  Settings,
  X,
} from "lucide-react";
import {
  adjectives,
  animals,
  colors,
  uniqueNamesGenerator,
} from "unique-names-generator";
import ky from "ky";
import { toast } from "sonner";

import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

import { ProjectsList } from "./projects-list";
import { useCreateProject } from "../hooks/use-projects";
import { useCreateConversation } from "../../conversations/hooks/use-conversations";
import { ProjectsCommandDialog } from "./projects-command-dialog";
import { ProjectGeneratorDialog } from "./project-generator-dialog";
import { ImportDialog } from "./import-dialog";
import { PROJECT_TEMPLATES } from "../lib/templates";

// Quick framework chips. Order matches PROJECT_TEMPLATES; ids must stay in sync.
const FRAMEWORK_CHIPS: { id: string; label: string }[] = [
  { id: "nextjs", label: "Next.js" },
  { id: "react-vite", label: "Vite" },
  { id: "python-flask", label: "Flask" },
];

export const ProjectsView = () => {
  const router = useRouter();
  const createProject = useCreateProject();
  const createConversation = useCreateConversation();

  const [commandDialogOpen, setCommandDialogOpen] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Hero state
  const [prompt, setPrompt] = useState("");
  const [framework, setFramework] = useState<string | null>(null);
  const [specName, setSpecName] = useState<string | null>(null);
  const [specBody, setSpecBody] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Global hotkeys (⌘K command, ⌘G generator dialog, ⌘I import, ⌘J blank)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "k") {
        e.preventDefault();
        setCommandDialogOpen(true);
      } else if (e.key === "g") {
        e.preventDefault();
        setGeneratorOpen(true);
      } else if (e.key === "i") {
        e.preventDefault();
        setImportOpen(true);
      } else if (e.key === "j") {
        e.preventDefault();
        void handleCreateBlank();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateBlank = async () => {
    const projectName = uniqueNamesGenerator({
      dictionaries: [adjectives, animals, colors],
      separator: "-",
      length: 3,
    });
    await createProject({ name: projectName });
  };

  const handleSpecUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 200_000) {
      toast.error("Spec too large — keep it under 200 KB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSpecBody(String(reader.result ?? ""));
      setSpecName(file.name);
    };
    reader.onerror = () => toast.error("Could not read spec file");
    reader.readAsText(file);
    // Reset input so re-selecting the same file fires the change handler.
    e.target.value = "";
  };

  const buildPrompt = () => {
    const parts: string[] = [];

    if (framework) {
      const tpl = PROJECT_TEMPLATES.find((t) => t.id === framework);
      if (tpl) {
        parts.push(`Use the ${tpl.name} stack as the foundation.`);
      }
    }

    if (specBody) {
      parts.push(
        `<spec source="${specName ?? "spec.md"}">\n${specBody}\n</spec>`,
      );
    }

    if (prompt.trim()) parts.push(prompt.trim());

    return parts.join("\n\n");
  };

  const canSubmit = !submitting && (prompt.trim().length > 0 || !!specBody);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    try {
      const projectName = uniqueNamesGenerator({
        dictionaries: [adjectives, animals, colors],
        separator: "-",
        length: 3,
      });

      const projectId = await createProject({ name: projectName });
      if (!projectId) throw new Error("Project creation failed");

      const conversationId = await createConversation({
        projectId,
        title: prompt.trim().slice(0, 60) || specName || "New build",
      });
      if (!conversationId) throw new Error("Conversation creation failed");

      await ky.post("/api/messages", {
        json: {
          conversationId,
          message: buildPrompt(),
        },
      });

      router.push(`/projects/${projectId}`);
    } catch (err) {
      console.error(err);
      toast.error("Could not start build — try again");
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // ⌘↵ / Ctrl+↵ submits. Plain Enter inserts newline (textarea default).
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    }
  };

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
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />

      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.txt,.markdown,.spec,.yaml,.yml,application/json"
        className="hidden"
        onChange={handleSpecUpload}
      />

      <div className="min-h-screen bg-surface-0 flex flex-col items-center justify-center p-6 md:p-12 relative">
        {/* Quiet top-right utility cluster: settings + identity */}
        <div className="absolute top-4 right-4 flex items-center gap-1.5">
          <Link
            href="/settings"
            className="inline-flex items-center justify-center size-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
            aria-label="Settings"
          >
            <Settings className="size-4" />
          </Link>
          <UserButton
            appearance={{ elements: { avatarBox: "size-7" } }}
          />
        </div>

        <div className="w-full max-w-2xl mx-auto flex flex-col gap-8">
          {/* Wordmark */}
          <div className="flex items-center gap-2.5 self-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Polaris" className="size-9" />
            <h1 className="font-heading text-3xl font-semibold tracking-[-0.02em] text-foreground">
              Polaris
            </h1>
          </div>

          {/* Tagline */}
          <p className="text-center text-sm text-muted-foreground -mt-4">
            The spec-driven AI coding agent.
            <span className="text-muted-foreground/60">
              {" "}
              Drop a spec, write a prompt, ship.
            </span>
          </p>

          {/* Hero prompt — the centerpiece */}
          <div
            className={cn(
              "rounded-xl bg-surface-2 transition-colors",
              "[box-shadow:inset_0_0_0_1px_hsl(var(--surface-3))]",
              "focus-within:[box-shadow:inset_0_0_0_1px_hsl(235_100%_65%_/_0.45)]",
            )}
          >
            {/* Spec attachment chip */}
            {specName && (
              <div className="flex items-center gap-2 px-4 pt-3">
                <div className="inline-flex items-center gap-2 rounded-md bg-primary/10 px-2.5 py-1 text-xs text-primary">
                  <FileText className="size-3.5" />
                  <span className="font-medium">{specName}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSpecBody(null);
                      setSpecName(null);
                    }}
                    className="opacity-70 hover:opacity-100"
                    aria-label="Remove spec"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe what you want to build, or attach a spec…"
              rows={4}
              disabled={submitting}
              className={cn(
                "w-full resize-none bg-transparent outline-none",
                "px-4 pt-4 pb-2 text-sm text-foreground leading-relaxed",
                "placeholder:text-muted-foreground/55",
                "disabled:opacity-60",
              )}
            />

            {/* Toolbar */}
            <div className="flex items-center justify-between gap-2 px-3 py-2.5">
              <div className="flex items-center gap-1.5">
                {/* Spec upload */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs",
                    "text-muted-foreground hover:bg-surface-3 hover:text-foreground transition-colors",
                  )}
                  title="Attach a spec (Markdown, YAML, JSON)"
                >
                  <Paperclip className="size-3.5" />
                  Spec
                </button>

                <span className="h-4 w-px bg-surface-3 mx-0.5" />

                {/* Framework chips */}
                {FRAMEWORK_CHIPS.map((c) => {
                  const active = framework === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setFramework(active ? null : c.id)}
                      className={cn(
                        "rounded-md px-2 py-1 text-xs transition-colors",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-surface-3 hover:text-foreground",
                      )}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!canSubmit}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5",
                  "text-xs font-medium transition-colors",
                  canSubmit
                    ? "bg-primary text-primary-foreground hover:opacity-90"
                    : "bg-surface-3 text-muted-foreground/60 cursor-not-allowed",
                )}
              >
                {submitting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ArrowUp className="size-3.5" />
                )}
                Build
                <Kbd
                  className={cn(
                    "ml-0.5 px-1.5",
                    canSubmit
                      ? "bg-primary-foreground/15 text-primary-foreground"
                      : "bg-surface-4 text-muted-foreground/60",
                  )}
                >
                  ⌘↵
                </Kbd>
              </button>
            </div>
          </div>

          {/* Secondary actions — escape hatches, not peers */}
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={() => void handleCreateBlank()}
              className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              <Plus className="size-3.5" />
              Blank project
              <Kbd className="bg-surface-3 text-muted-foreground">⌘J</Kbd>
            </button>
            <span className="text-surface-4 select-none">·</span>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              <Github className="size-3.5" />
              Import from GitHub
              <Kbd className="bg-surface-3 text-muted-foreground">⌘I</Kbd>
            </button>
            <span className="text-surface-4 select-none">·</span>
            <button
              type="button"
              onClick={() => setCommandDialogOpen(true)}
              className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              <Search className="size-3.5" />
              Search
              <Kbd className="bg-surface-3 text-muted-foreground">⌘K</Kbd>
            </button>
          </div>

          {/* Recent projects */}
          <div className="mt-2">
            <ProjectsList onViewAll={() => setCommandDialogOpen(true)} />
          </div>
        </div>
      </div>
    </>
  );
};
