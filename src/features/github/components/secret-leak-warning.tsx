"use client"

/**
 * SecretLeakWarning. Authority: sub-plan 06 Task 15, CONSTITUTION §13.3.
 *
 * Modal shown when push is aborted because the secret-scan found findings.
 * Lists each finding with file path + line + category. There is NO override —
 * the user must clean up the offending file and try again.
 */

import * as Dialog from "@radix-ui/react-dialog"
import { ShieldAlert } from "lucide-react"

export interface SecretFinding {
  path: string
  line: number
  column: number
  category: string
  preview: string
}

interface Props {
  findings: SecretFinding[]
  onClose: () => void
}

const CATEGORY_LABEL: Record<string, string> = {
  aws_access_key: "AWS Access Key",
  aws_secret_key: "AWS Secret Key (heuristic)",
  github_token: "GitHub Token",
  stripe_key: "Stripe Key",
  openai_key: "OpenAI Key",
  anthropic_key: "Anthropic Key",
  google_api_key: "Google API Key",
  private_key: "PEM Private Key",
  slack_token: "Slack Token",
  jwt: "JSON Web Token",
}

export function SecretLeakWarning({ findings, onClose }: Props) {
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-surface-2 p-6 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="mt-1 inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-destructive/15">
              <ShieldAlert className="size-5 text-destructive" />
            </div>
            <div className="min-w-0">
              <Dialog.Title className="font-heading text-lg font-semibold tracking-tight text-foreground">
                Push blocked — possible secrets detected
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                Polaris found {findings.length}{" "}
                potential secret{findings.length === 1 ? "" : "s"} in the files
                queued for push. Remove or rotate them, then push again. There is
                no override.
              </Dialog.Description>
            </div>
          </div>

          <div className="mt-5 max-h-72 overflow-y-auto rounded-md bg-surface-3 p-1">
            {findings.map((f, idx) => (
              <div
                key={`${f.path}:${f.line}:${idx}`}
                className="flex items-start gap-3 rounded-md px-3 py-2.5 hover:bg-surface-4"
              >
                <span className="mt-1 inline-flex size-1.5 shrink-0 rounded-full bg-destructive" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs text-foreground">
                    {f.path}
                    <span className="text-muted-foreground">:{f.line}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] uppercase tracking-widest text-muted-foreground/70">
                    {CATEGORY_LABEL[f.category] ?? f.category}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              I&apos;ll clean these up
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
