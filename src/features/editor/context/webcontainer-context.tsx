"use client";

import {
    createContext,
    useContext,
    useEffect,
    useState,
    useRef,
} from "react";
import { WebContainer } from "@webcontainer/api";
import { toast } from "sonner";
import { Id } from "../../../../convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";

interface WebContainerContextType {
    webcontainer: WebContainer | null;
    isLoading: boolean;
    error: Error | null;
    serverUrl: string | null;
}

const WebContainerContext = createContext<WebContainerContextType | null>(null);

export const useWebContainer = () => {
    const context = useContext(WebContainerContext);
    if (!context) {
        throw new Error(
            "useWebContainer must be used within a WebContainerProvider"
        );
    }
    return context;
};

interface WebContainerProviderProps {
    children: React.ReactNode;
    projectId: Id<"projects">;
}

export const WebContainerProvider = ({
    children,
    projectId,
}: WebContainerProviderProps) => {
    const [webcontainer, setWebcontainer] = useState<WebContainer | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [serverUrl, setServerUrl] = useState<string | null>(null);

    const bootedRef = useRef(false);
    const files = useQuery(api.system.getProjectFilesInternal, { projectId });

    useEffect(() => {
        const boot = async () => {
            // Wait for files to load before booting
            if (bootedRef.current || !files) return;

            try {
                setIsLoading(true);
                console.log("Booting WebContainer...");

                const instance = await WebContainer.boot();
                bootedRef.current = true;

                const fileMap = new Map<string, typeof files>();
                const filesByParent = new Map<string | undefined, typeof files>();

                for (const file of files) {
                    fileMap.set(file._id, file);
                    const pid = file.parentId ?? undefined;
                    if (!filesByParent.has(pid)) {
                        filesByParent.set(pid, []);
                    }
                    filesByParent.get(pid)!.push(file);
                }

                const buildTree = (parentId: string | undefined): Record<string, any> => {
                    const children = filesByParent.get(parentId) || [];
                    const tree: Record<string, any> = {};

                    for (const child of children) {
                        if (child.type === "folder") {
                            tree[child.name] = {
                                directory: buildTree(child._id)
                            };
                        } else {
                            tree[child.name] = {
                                file: {
                                    contents: child.content || ""
                                }
                            };
                        }
                    }
                    return tree;
                };

                const fileSystem = buildTree(undefined);

                await instance.mount(fileSystem);
                console.log("Files mounted");

                instance.on("server-ready", (port, url) => {
                    console.log("Server ready at", url);
                    setServerUrl(url);
                    toast.success("Dev server started");
                });

                instance.on("error", (err) => {
                    console.error("WebContainer error:", err);
                    toast.error("WebContainer error occurred");
                });

                setWebcontainer(instance);
            } catch (err) {
                console.error("Failed to boot WebContainer:", err);
                setError(err instanceof Error ? err : new Error("Failed to boot"));
                toast.error("Failed to start development environment");
            } finally {
                setIsLoading(false);
            }
        };

        boot();
    }, [files]);

    return (
        <WebContainerContext.Provider
            value={{
                webcontainer,
                isLoading,
                error,
                serverUrl,
            }}
        >
            {children}
        </WebContainerContext.Provider>
    );
};
