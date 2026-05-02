"use client"

import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { api } from "../../../../../convex/_generated/api"
import type { Id } from "../../../../../convex/_generated/dataModel"

type HookEvent =
  | "pre_tool_call"
  | "post_tool_call"
  | "iteration_start"
  | "agent_done"

const EVENT_LABELS: Record<HookEvent, string> = {
  pre_tool_call: "Before tool call",
  post_tool_call: "After tool call",
  iteration_start: "Iteration start",
  agent_done: "Agent done",
}

interface Props {
  projectId: Id<"projects">
}

export const HooksPane = ({ projectId }: Props) => {
  const hooks = useQuery(api.hooks.listForProject, { projectId })
  const setEnabled = useMutation(api.hooks.setEnabled)
  const remove = useMutation(api.hooks.remove)
  const [createOpen, setCreateOpen] = useState(false)

  if (hooks === undefined) {
    return <div className="text-sm text-muted-foreground">Loading…</div>
  }

  return (
    <div className="flex flex-col gap-4">
      {hooks.length === 0 ? (
        <div className="rounded-lg bg-surface-2 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No hooks configured for this project yet.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-surface-3">
          {hooks.map((h) => (
            <li
              key={h._id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium">
                    {h.hookId}
                  </span>
                  <Badge variant="outline">
                    {EVENT_LABELS[h.event as HookEvent]}
                  </Badge>
                  {h.failMode === "closed" && (
                    <Badge variant="destructive">fail-closed</Badge>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {h.target.url}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={h.enabled}
                  onCheckedChange={async (v) => {
                    try {
                      await setEnabled({ id: h._id, enabled: v })
                    } catch (e) {
                      toast.error(
                        `Failed to update hook: ${e instanceof Error ? e.message : "unknown error"}`,
                      )
                    }
                  }}
                  aria-label="Enable hook"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={async () => {
                    if (!confirm(`Delete hook "${h.hookId}"?`)) return
                    try {
                      await remove({ id: h._id })
                      toast.success("Hook deleted")
                    } catch (e) {
                      toast.error(
                        `Failed to delete: ${e instanceof Error ? e.message : "unknown"}`,
                      )
                    }
                  }}
                  aria-label="Delete hook"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="self-start">
            <Plus className="size-4" /> Add hook
          </Button>
        </DialogTrigger>
        <CreateHookDialog
          projectId={projectId}
          onClose={() => setCreateOpen(false)}
        />
      </Dialog>
    </div>
  )
}

interface CreateProps {
  projectId: Id<"projects">
  onClose: () => void
}

const CreateHookDialog = ({ projectId, onClose }: CreateProps) => {
  const create = useMutation(api.hooks.create)
  const [hookId, setHookId] = useState("")
  const [event, setEvent] = useState<HookEvent>("pre_tool_call")
  const [url, setUrl] = useState("")
  const [failMode, setFailMode] = useState<"open" | "closed">("open")
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!hookId.trim() || !url.trim()) {
      toast.error("hookId and URL are required")
      return
    }
    if (!/^https?:\/\//.test(url)) {
      toast.error("URL must start with http:// or https://")
      return
    }
    setSubmitting(true)
    try {
      await create({
        projectId,
        hookId: hookId.trim(),
        event,
        target: { url: url.trim() },
        failMode,
        enabled: true,
      })
      toast.success(`Hook "${hookId}" created`)
      onClose()
    } catch (e) {
      toast.error(
        `Failed to create hook: ${e instanceof Error ? e.message : "unknown"}`,
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add hook</DialogTitle>
        <DialogDescription>
          Register an HTTP endpoint to intercept agent tool calls.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4 py-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hookId">Hook ID</Label>
          <Input
            id="hookId"
            placeholder="my-policy-check"
            value={hookId}
            onChange={(e) => setHookId(e.target.value)}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Stable identifier used in audit logs. Must be unique per project.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="event">Event</Label>
          <Select
            value={event}
            onValueChange={(v) => setEvent(v as HookEvent)}
          >
            <SelectTrigger id="event">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(EVENT_LABELS) as HookEvent[]).map((e) => (
                <SelectItem key={e} value={e}>
                  {EVENT_LABELS[e]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="url">URL</Label>
          <Input
            id="url"
            type="url"
            placeholder="https://hooks.example.com/policy"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="failMode">On failure</Label>
          <Select
            value={failMode}
            onValueChange={(v) => setFailMode(v as "open" | "closed")}
          >
            <SelectTrigger id="failMode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">
                Open — continue (default)
              </SelectItem>
              <SelectItem value="closed">
                Closed — deny tool call
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            What happens if the hook errors or times out. Use
            &quot;closed&quot; for hard policy gates where uncertainty
            must NOT silently allow agent actions.
          </p>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={submitting}>
          {submitting ? "Creating…" : "Create"}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
