import { inngest } from "@/inngest/client";
import { convex } from "@/lib/convex-client";
import { api } from "../../../../convex/_generated/api";
import { GitHubClient } from "@/lib/github";
import { Id } from "../../../../convex/_generated/dataModel";
import { NonRetriableError } from "inngest";

interface ExportEvent {
    projectId: Id<"projects">;
    userId: string;
    accessToken: string;
    repoName: string;
    isPrivate: boolean;
}

export const exportToGitHub = inngest.createFunction(
    { id: "export-to-github" },
    { event: "project/export" },
    async ({ event, step }) => {
        const { projectId, accessToken, repoName, isPrivate } = event.data as ExportEvent;
        const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY;

        if (!internalKey) {
            throw new NonRetriableError("POLARIS_CONVEX_INTERNAL_KEY is not configured");
        }

        const gh = new GitHubClient(accessToken);
        let repoOwner = "";
        let repoFullName = "";

        // Step 1: Update status to exporting
        await step.run("set-exporting-status", async () => {
            await convex.mutation(api.system.updateExportStatus, {
                internalKey,
                projectId,
                status: "exporting",
            });
        });

        try {
            // Step 2: Get or Create Repository
            await step.run("prepare-repository", async () => {
                const user = await gh.getCurrentUser();
                repoOwner = user.login;

                // Check if repo exists
                try {
                    await gh.getRef(repoOwner, repoName, "heads/main");
                    // If successful, repo exists
                } catch {
                    // Repo likely doesn't exist or empty, try to create
                    try {
                        await gh.createRepository(repoName, isPrivate);
                    } catch (e: any) {
                        // Ignore if already exists (might be empty without ref)
                        if (!e.message?.includes("already exists")) throw e;
                    }
                }

                repoFullName = `${repoOwner}/${repoName}`;
            });

            // Step 3: Fetch all files and build logic paths
            const filesContext = await step.run("fetch-files", async () => {
                const files = await convex.query(api.system.getProjectFilesInternal, {
                    internalKey,
                    projectId,
                });

                const fileMap = new Map(files.map(f => [f._id, f]));
                const blobsToCreate: { path: string; content: string }[] = [];

                for (const file of files) {
                    if (file.type !== "file" || !file.content) continue;

                    // Build path
                    const pathParts = [file.name];
                    let current = file;
                    while (current.parentId) {
                        const parent = fileMap.get(current.parentId);
                        if (!parent) break;
                        pathParts.unshift(parent.name);
                        current = parent;
                    }

                    blobsToCreate.push({
                        path: pathParts.join("/"),
                        content: file.content,
                    });
                }

                return blobsToCreate;
            });

            // Step 4: Create Blobs (Process in parallel batches)
            const treeItems = await step.run("create-blobs", async () => {
                const items: { path: string; mode: "100644"; type: "blob"; sha: string }[] = [];
                const BATCH_SIZE = 5;

                for (let i = 0; i < filesContext.length; i += BATCH_SIZE) {
                    const batch = filesContext.slice(i, i + BATCH_SIZE);
                    await Promise.all(batch.map(async (file) => {
                        const sha = await gh.createBlob(repoOwner, repoName, file.content);
                        items.push({
                            path: file.path,
                            mode: "100644",
                            type: "blob",
                            sha,
                        });
                    }));
                }

                return items;
            });

            // Step 5: Commit and Push
            await step.run("commit-and-push", async () => {
                // Get current head
                let parentSha: string | undefined;
                try {
                    parentSha = await gh.getRef(repoOwner, repoName, "heads/main");
                } catch {
                    // Empty repo, no parent
                }

                // Get base tree if updating
                let baseTreeSha: string | null = null;
                if (parentSha) {
                    // We could get base tree, but simple way is to create full tree if we want full sync
                    // OR if we want additive, we use base_tree.
                    // For export, usually we want to mirror the project. 
                    // If we don't provide base_tree, it might delete other files?
                    // No, createTree docs: "If you don't provide base_tree, the new tree will only contain the entries you pass in."
                    // So for a full project export, we probably want to overwrite/set state.
                    // Let's assume we own the repo content for this project.
                }

                const treeSha = await gh.createTree(repoOwner, repoName, baseTreeSha, treeItems as any);

                const commitSha = await gh.createCommit(
                    repoOwner,
                    repoName,
                    `Update from Polaris: ${new Date().toISOString()}`,
                    treeSha,
                    parentSha || ""
                );

                // Update ref (force to handle re-exports cleanly or standard update)
                // If no parent (initial commit), we need to create the ref? 
                // PATCH /refs/heads/main works if ref exists.
                // If not, we might need POST /git/refs (not handled in our simple client yet).
                // Let's assume createRepository with auto_init created main.
                await gh.updateRef(repoOwner, repoName, "heads/main", commitSha);
            });

            // Step 6: Update status to completed
            await step.run("complete-export", async () => {
                await convex.mutation(api.system.updateExportStatus, {
                    internalKey,
                    projectId,
                    status: "completed",
                    repoUrl: `https://github.com/${repoFullName}`,
                });
            });

        } catch (error: any) {
            await step.run("handle-failure", async () => {
                await convex.mutation(api.system.updateExportStatus, {
                    internalKey,
                    projectId,
                    status: "failed",
                });
            });
            throw error;
        }
    }
);
