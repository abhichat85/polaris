/**
 * Workspaces hooks. Authenticated wrappers around Convex queries/mutations.
 * Components MUST guard for `undefined` (loading) — `null` is a valid result
 * meaning "user has no workspace yet".
 *
 * Authority: CONSTITUTION D-020.
 */

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";

export const useCurrentWorkspace = () => {
  return useQuery(api.workspaces.getCurrent, {});
};

export const useWorkspaces = () => {
  return useQuery(api.workspaces.listForUser, {});
};

export const useWorkspaceMembers = (
  workspaceId:
    | import("../../../../convex/_generated/dataModel").Id<"workspaces">
    | null,
) => {
  return useQuery(
    api.workspaces.listMembers,
    workspaceId ? { workspaceId } : "skip",
  );
};

export const useCreateWorkspace = () => {
  return useMutation(api.workspaces.create);
};

export const useInviteMember = () => {
  return useMutation(api.workspaces.invite);
};

export const useUpdateMemberRole = () => {
  return useMutation(api.workspaces.updateRole);
};

export const useRemoveMember = () => {
  return useMutation(api.workspaces.removeMember);
};
