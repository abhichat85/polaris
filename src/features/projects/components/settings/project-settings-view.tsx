"use client"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Id } from "../../../../../convex/_generated/dataModel"
import { HooksPane } from "./hooks-pane"
import { McpServersPane } from "./mcp-servers-pane"

interface Props {
  projectId: Id<"projects">
}

/**
 * Project-scoped settings page. Tabs for each integration surface
 * (hooks, MCP servers, future: env, deploy keys, etc.).
 */
export const ProjectSettingsView = ({ projectId }: Props) => {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-8 flex flex-col gap-1">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Project settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure agent extensions for this project. Changes apply to
          subsequent agent runs only.
        </p>
      </div>

      <Tabs defaultValue="hooks" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="hooks">Hooks</TabsTrigger>
          <TabsTrigger value="mcp">MCP servers</TabsTrigger>
        </TabsList>

        <TabsContent value="hooks">
          <Card>
            <CardHeader>
              <CardTitle>Hooks</CardTitle>
              <CardDescription>
                HTTP endpoints called before / after each agent tool call.
                Use them to deny destructive operations, log to a SIEM, or
                transform tool inputs/outputs. Hard timeout: 5s per hook.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <HooksPane projectId={projectId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mcp">
          <Card>
            <CardHeader>
              <CardTitle>MCP servers</CardTitle>
              <CardDescription>
                Model Context Protocol servers to register with the agent.
                Their tools are merged into the agent&apos;s catalog with the
                prefix <code>mcp__&lt;server&gt;__&lt;tool&gt;</code>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <McpServersPane projectId={projectId} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
