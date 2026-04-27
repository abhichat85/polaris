"use client";

/**
 * WebContainerProvider — owns the in-browser sandbox lifecycle.
 *
 * WebContainer.boot() is a process-wide singleton: only ONE instance can
 * exist per browser tab. The previous implementation guarded with a ref
 * that was set *after* await — strict-mode double-invocation and HMR
 * remounts both raced past it and triggered "Only a single WebContainer
 * instance can be booted".
 *
 * Fix: hoist the boot promise to module scope and reuse it. Across
 * remounts, navigations, and strict-mode double effects the same pending
 * promise is returned. Teardown happens on hard unmount only (real route
 * change away from a project IDE).
 *
 * Authority: Constitution §III (architectural — sandbox lifecycle is
 * single-owner) and the WebContainer error referenced in commit
 * bf335b9.
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { WebContainer } from "@webcontainer/api";
import { toast } from "sonner";
import { useQuery } from "convex/react";

import { Id } from "../../../../convex/_generated/dataModel";
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
      "useWebContainer must be used within a WebContainerProvider",
    );
  }
  return context;
};

// ---------------------------------------------------------------------------
// Module-scope singleton. WebContainer is per-tab, so this lives outside React.
// ---------------------------------------------------------------------------
let bootPromise: Promise<WebContainer> | null = null;
let activeInstance: WebContainer | null = null;

/**
 * Cross-Origin Isolation is set at the *initial document load* via the
 * COOP/COEP headers in src/proxy.ts. Next.js Link clicks are client-side
 * navigations (RSC fetch) which do NOT re-establish the browsing context,
 * so a tab that loaded a non-COI page first (e.g. `/`) and then clicked
 * a Link into `/projects/[id]` will have `crossOriginIsolated === false`
 * and `WebContainer.boot()` will fail with:
 *   DataCloneError: SharedArrayBuffer transfer requires self.crossOriginIsolated
 *
 * Fix: detect the missing isolation and force a real navigation. The
 * sessionStorage guard prevents an infinite reload loop in the unlikely
 * case the proxy isn't actually serving the headers (e.g. caching proxy
 * upstream stripping them).
 */
const COI_RELOAD_KEY = "polaris:coi-reload-attempted";

const ensureCrossOriginIsolated = (): boolean => {
  if (typeof window === "undefined") return true; // SSR — skip
  if (window.crossOriginIsolated) {
    // We're isolated. Clear any stale reload flag so future SPA navigations
    // (which CAN preserve isolation if the source page was also COI) work.
    try {
      window.sessionStorage.removeItem(COI_RELOAD_KEY);
    } catch {
      /* private browsing — ignore */
    }
    return true;
  }
  let attempted = false;
  try {
    attempted = window.sessionStorage.getItem(COI_RELOAD_KEY) === "1";
  } catch {
    /* ignore */
  }
  if (attempted) {
    // We already tried reload and isolation still didn't take. Surface the
    // error rather than loop. Most likely cause: proxy.ts headers being
    // stripped by an upstream layer (Vercel edge, CF tunnel, etc.).
    return false;
  }
  try {
    window.sessionStorage.setItem(COI_RELOAD_KEY, "1");
  } catch {
    /* ignore */
  }
  // Replace (not reload) so the back-button history isn't polluted.
  window.location.replace(window.location.href);
  return false;
};

const getOrBootWebContainer = (): Promise<WebContainer> => {
  if (activeInstance) return Promise.resolve(activeInstance);
  if (!ensureCrossOriginIsolated()) {
    return Promise.reject(
      new Error(
        "Cross-Origin Isolation not active on this page. proxy.ts must " +
          "send Cross-Origin-Opener-Policy: same-origin and " +
          "Cross-Origin-Embedder-Policy: credentialless on /projects/*. " +
          "If those headers are present in the network tab and this still " +
          "fires, check that no upstream proxy is stripping them.",
      ),
    );
  }
  if (!bootPromise) {
    bootPromise = WebContainer.boot()
      .then((instance) => {
        activeInstance = instance;
        return instance;
      })
      .catch((err) => {
        // Reset so a future retry can attempt again.
        bootPromise = null;
        throw err;
      });
  }
  return bootPromise;
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
interface WebContainerProviderProps {
  children: React.ReactNode;
  projectId: Id<"projects">;
}

export const WebContainerProvider = ({
  children,
  projectId,
}: WebContainerProviderProps) => {
  const [webcontainer, setWebcontainer] = useState<WebContainer | null>(
    activeInstance,
  );
  const [isLoading, setIsLoading] = useState(!activeInstance);
  const [error, setError] = useState<Error | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);

  const filesMountedRef = useRef(false);
  const files = useQuery(api.system.getProjectFiles, { projectId });

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      // Wait until Convex has hydrated the file list before mounting.
      if (!files) return;

      try {
        const instance = await getOrBootWebContainer();
        if (cancelled) return;

        // Mount files exactly once per provider instance. Subsequent file
        // edits flow via per-file writes from the editor, not full remounts.
        if (!filesMountedRef.current) {
          // Local type alias avoids `any` while keeping the recursive shape readable.
          type WCFile = NonNullable<typeof files>[number];
          const filesByParent = new Map<string | undefined, WCFile[]>();
          for (const file of files) {
            const pid = file.parentId ?? undefined;
            if (!filesByParent.has(pid)) filesByParent.set(pid, []);
            filesByParent.get(pid)!.push(file);
          }

          type WCEntry =
            | { directory: Record<string, WCEntry> }
            | { file: { contents: string } };

          const buildTree = (
            parentId: string | undefined,
          ): Record<string, WCEntry> => {
            const tree: Record<string, WCEntry> = {};
            for (const child of filesByParent.get(parentId) ?? []) {
              if (child.type === "folder") {
                tree[child.name] = { directory: buildTree(child._id) };
              } else {
                tree[child.name] = {
                  file: { contents: child.content ?? "" },
                };
              }
            }
            return tree;
          };

          await instance.mount(buildTree(undefined));
          filesMountedRef.current = true;

          // Server-ready and error handlers are attached once per instance.
          instance.on("server-ready", (_port, url) => {
            if (!cancelled) {
              setServerUrl(url);
              toast.success("Dev server started");
            }
          });
          instance.on("error", (err) => {
            console.error("WebContainer error:", err);
            toast.error("WebContainer error occurred");
          });
        }

        setWebcontainer(instance);
        setError(null);
      } catch (err) {
        console.error("Failed to boot WebContainer:", err);
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error("Failed to boot"));
          toast.error("Failed to start development environment");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void boot();

    return () => {
      cancelled = true;
    };
  }, [files]);

  // No explicit teardown: WebContainer is a tab-scoped singleton. Browser
  // navigation/close releases it. Switching projects reuses the same
  // instance — agent file mutations replay onto it via Convex sync.

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
