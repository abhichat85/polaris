import { ProjectSettingsView } from "@/features/projects/components/settings/project-settings-view"
import { Id } from "../../../../../../convex/_generated/dataModel"

const Page = async ({
  params,
}: {
  params: Promise<{ projectId: string }>
}) => {
  const { projectId } = await params
  return <ProjectSettingsView projectId={projectId as Id<"projects">} />
}

export default Page
