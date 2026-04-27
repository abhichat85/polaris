"use client";

/**
 * useActiveWorkspaceId — current workspace selection from the cookie.
 * Falls back to the user's "first" workspace from `useCurrentWorkspace`
 * when no cookie is set. Authority: D-020.
 *
 * Setter writes the cookie + invalidates the project list (via the
 * `bumpScopeVersion` Zustand-style atom) so all `useProjectsScoped` hooks
 * re-read with the new scope.
 */

import { useEffect, useState } from "react";
import { create } from "zustand";

import {
  ACTIVE_WORKSPACE_COOKIE,
  setActiveWorkspaceCookie,
  readActiveWorkspaceCookieFromDocument,
} from "../lib/active-workspace-cookie";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useCurrentWorkspace } from "./use-workspaces";

interface ActiveScopeState {
  /** Bumps when the active workspace changes; project hooks re-read on it. */
  version: number;
  bump: () => void;
}

export const useActiveScope = create<ActiveScopeState>((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}));

export const useActiveWorkspaceId = (): Id<"workspaces"> | undefined => {
  // Re-render when the cookie changes via bump().
  useActiveScope((s) => s.version);
  const fallback = useCurrentWorkspace();
  const [cookie, setCookie] = useState<string | null>(null);

  useEffect(() => {
    setCookie(readActiveWorkspaceCookieFromDocument());
    // Subscribe to cookie changes — there's no native event, so we rely on
    // the bump() atom and a one-shot read on mount.
  }, []);

  if (cookie) return cookie as Id<"workspaces">;
  return fallback?._id;
};

export const useSetActiveWorkspace = () => {
  const bump = useActiveScope((s) => s.bump);
  return (workspaceId: Id<"workspaces">) => {
    setActiveWorkspaceCookie(workspaceId);
    bump();
  };
};

// Re-export for convenience.
export { ACTIVE_WORKSPACE_COOKIE };
