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

type Transport = "stdio" | "http" | "sse"

interface Props {
  projectId: Id<"projects">
}

export const McpServersPane = ({ projectId }: Props) => {
  const servers = useQuery(api.mcp_servers.listForProject, { projectId })
  const setEnabled = useMutation(api.mcp_servers.setEnabled)
  const remove = useMutation(api.mcp_servers.remove)
  const [createOpen, setCreateOpen] = useState(false)

  if (servers === undefined) {
    return <div className="text-sm text-muted-foreground">Loading…</div>
  }

  return (
    <div className="flex flex-col gap-4">
      {servers.length === 0 ? (
        <div className="rounded-lg bg-surface-2 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No MCP servers registered for this project yet.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-surface-3">
          {servers.map((s) => (
            <li
              key={s._id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium">
                    {s.name}
                  </span>
                  <Badge variant="outline">{s.transport.type}</Badge>
                  {s.toolAllowlist && s.toolAllowlist.length > 0 && (
                    <Badge variant="secondary">
                      {s.toolAllowlist.length} tool
                      {s.toolAllowlist.length === 1 ? "" : "s"}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                  {transportSummary(s.transport)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={s.enabled}
                  onCheckedChange={async (v) => {
                    try {
                      await setEnabled({ id: s._id, enabled: v })
                    } catch (e) {
                      toast.error(
                        `Failed: ${e instanceof Error ? e.message : "unknown"}`,
                      )
                    }
                  }}
                  aria-label="Enable server"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={async () => {
                    if (!confirm(`Delete MCP server "${s.name}"?`)) return
                    try {
                      await remove({ id: s._id })
                      toast.success("Server deleted")
                    } catch (e) {
                      toast.error(
                        `Failed: ${e instanceof Error ? e.message : "unknown"}`,
                      )
                    }
                  }}
                  aria-label="Delete server"
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
            <Plus className="size-4" /> Add MCP server
          </Button>
        </DialogTrigger>
        <CreateMcpDialog
          projectId={projectId}
          onClose={() => setCreateOpen(false)}
        />
      </Dialog>
    </div>
  )
}

function transportSummary(t: {
  type: string
  command?: string
  args?: string[]
  url?: string
}): string {
  if (t.type === "stdio") {
    return `${t.command ?? ""}${t.args && t.args.length > 0 ? " " + t.args.join(" ") : ""}`
  }
  return t.url ?? ""
}

interface CreateProps {
  projectId: Id<"projects">
  onClose: () => void
}

const CreateMcpDialog = ({ projectId, onClose }: CreateProps) => {
  const create = useMutation(api.mcp_servers.create)
  const [name, setName] = useState("")
  const [transport, setTransport] = useState<Transport>("stdio")
  const [command, setCommand] = useState("")
  const [args, setArgs] = useState("")
  const [url, setUrl] = useState("")
  const [allowlist, setAllowlist] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Name is required")
      return
    }
    if (!/^[a-z0-9_-]+$/i.test(name.trim())) {
      toast.error("Name must be alphanumeric (a-z, 0-9, _, -)")
      return
    }
    if (transport === "stdio" && !command.trim()) {
      toast.error("Command is required for stdio transport")
      return
    }
    if (transport !== "stdio" && !url.trim()) {
      toast.error("URL is required for http/sse transport")
      return
    }

    const argsArr = args
      .trim()
      .split(/\s+/)
      .filter((s) => s.length > 0)
    const allowlistArr = allowlist
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    setSubmitting(true)
    try {
      const transportPayload =
        transport === "stdio"
          ? {
              type: "stdio" as const,
              command: command.trim(),
              args: argsArr.length > 0 ? argsArr : undefined,
            }
          : {
              type: transport,
              url: url.trim(),
            }
      await create({
        projectId,
        name: name.trim(),
        transport: transportPayload,
        toolAllowlist: allowlistArr.length > 0 ? allowlistArr : undefined,
        enabled: true,
      })
      toast.success(`MCP server "${name}" created`)
      onClose()
    } catch (e) {
      toast.error(
        `Failed to create: ${e instanceof Error ? e.message : "unknown"}`,
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add MCP server</DialogTitle>
        <DialogDescription>
          Register a Model Context Protocol server. Tools from the server
          will appear in the agent&apos;s catalog as{" "}
          <code>mcp__&lt;name&gt;__&lt;tool&gt;</code>.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4 py-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            placeholder="github"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Becomes the prefix on every tool from this server. Lowercase
            alphanumeric, with <code>_</code> or <code>-</code> separators.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="transport">Transport</Label>
          <Select
            value={transport}
            onValueChange={(v) => setTransport(v as Transport)}
          >
            <SelectTrigger id="transport">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stdio">
                stdio — subprocess (recommended)
              </SelectItem>
              <SelectItem value="http">http — remote endpoint</SelectItem>
              <SelectItem value="sse">sse — server-sent events</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            HTTP/SSE transports are stored but not yet wired in this build —
            stdio is the supported path.
          </p>
        </div>
        {transport === "stdio" ? (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="command">Command</Label>
              <Input
                id="command"
                placeholder="node"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="args">Arguments (optional)</Label>
              <Input
                id="args"
                placeholder="server.js"
                value={args}
                onChange={(e) => setArgs(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Space-separated. Quote values with spaces using single quotes.
              </p>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="url">URL</Label>
            <Input
              id="url"
              type="url"
              placeholder="https://mcp.example.com/sse"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="allowlist">Tool allowlist (optional)</Label>
          <Input
            id="allowlist"
            placeholder="search,fetch_doc"
            value={allowlist}
            onChange={(e) => setAllowlist(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Comma-separated. When set, only these tools are exposed to the
            agent. Leave empty to expose all of the server&apos;s tools.
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
