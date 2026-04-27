/**
 * Active-workspace cookie helpers. Authority: D-020.
 *
 * The `polaris_active_workspace` cookie carries the user's currently
 * selected workspace ID. The Convex queries default to "user's first
 * workspace" when no explicit `workspaceId` is supplied, so the cookie
 * is purely a client preference — it scopes the React hooks via the
 * `useActiveWorkspaceId()` reader.
 */

export const ACTIVE_WORKSPACE_COOKIE = "polaris_active_workspace";

const ONE_YEAR_SEC = 365 * 24 * 60 * 60;

export const setActiveWorkspaceCookie = (workspaceId: string): void => {
  if (typeof document === "undefined") return;
  // SameSite=Lax, max-age 1 year, path scope to entire site.
  document.cookie = `${ACTIVE_WORKSPACE_COOKIE}=${encodeURIComponent(workspaceId)}; path=/; max-age=${ONE_YEAR_SEC}; SameSite=Lax`;
};

export const clearActiveWorkspaceCookie = (): void => {
  if (typeof document === "undefined") return;
  document.cookie = `${ACTIVE_WORKSPACE_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
};

export const readActiveWorkspaceCookieFromDocument = (): string | null => {
  if (typeof document === "undefined") return null;
  const raw = document.cookie
    .split("; ")
    .find((p) => p.startsWith(`${ACTIVE_WORKSPACE_COOKIE}=`));
  if (!raw) return null;
  const value = decodeURIComponent(raw.slice(ACTIVE_WORKSPACE_COOKIE.length + 1));
  return value || null;
};
