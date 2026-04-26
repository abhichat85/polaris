"use client"

/**
 * Push to GitHub. Authority: sub-plan 06 Task 15.
 *
 * Opens a small dialog with owner / repo / branch / commit-message inputs
 * (defaults pre-filled), POSTs /api/github/push, and on the secret-leak
 * error code surfaces SecretLeakWarning.
 */

import { useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { Upload, Loader2 } from "lucide-react"
import type { Id } from "../../../../convex/_generated/dataModel"
import { SecretLeakWarning, type SecretFinding } from "./secret-leak-warning"

interface Props {
  projectId: Id<"projects">
  defaultOwner?: string
  defaultRepo?: string
  defaultBranch?: string
}

export function PushButton({ projectId, defaultOwner, defaultRepo, defaultBranch }: Props) {
  const [open, setOpen] = useState(false)
  const [owner, setOwner] = useState(defaultOwner ?? "")
  const [repo, setRepo] = useState(defaultRepo ?? "")
  const [branch, setBranch] = useState(defaultBranch ?? "main")
  const [message, setMessage] = useState("Update from Polaris")
  const [pushing, setPushing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [leakFindings, setLeakFindings] = useState<SecretFinding[] | null>(null)

  const submit = async () => {
    setPushing(true)
    setError(null)
    try {
      const res = await fetch("/api/github/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          owner,
          repo,
          branch: branch || "main",
          commitMessage: message,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        findings?: SecretFinding[]
      }
      if (!res.ok) {
        if (data.error === "secret_leak" && data.findings) {
          setLeakFindings(data.findings)
        } else {
          setError(data.error ?? `http_${res.status}`)
        }
        return
      }
      setOpen(false)
    } finally {
      setPushing(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        <Upload className="size-4" />
        Push to GitHub
      </button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(440px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-surface-2 p-6 shadow-2xl">
            <Dialog.Title className="font-heading text-lg font-semibold tracking-tight text-foreground">
              Push to GitHub
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-muted-foreground">
              Polaris squashes everything into a single commit. The push is
              blocked if any file contains a secret.
            </Dialog.Description>

            <div className="mt-5 space-y-3">
              <Field label="Owner" value={owner} onChange={setOwner} placeholder="octocat" />
              <Field label="Repo"  value={repo}  onChange={setRepo}  placeholder="my-app" />
              <Field label="Branch" value={branch} onChange={setBranch} />
              <Field label="Commit message" value={message} onChange={setMessage} />
            </div>

            {error && (
              <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error.replace(/_/g, " ")}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pushing}
                className="rounded-md bg-surface-4 px-3.5 py-1.5 text-sm font-medium text-foreground hover:bg-surface-3"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pushing || !owner || !repo}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {pushing && <Loader2 className="size-4 animate-spin" />}
                {pushing ? "Pushing…" : "Push"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {leakFindings && (
        <SecretLeakWarning
          findings={leakFindings}
          onClose={() => setLeakFindings(null)}
        />
      )}
    </>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md bg-surface-3 px-3 py-2 text-sm text-foreground outline-none ring-primary/0 transition-shadow focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground"
      />
    </label>
  )
}
