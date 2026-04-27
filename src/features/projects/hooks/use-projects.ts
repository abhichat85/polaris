/* eslint-disable react-hooks/purity */

import { useMutation, useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useActiveWorkspaceId } from "@/features/workspaces/hooks/use-active-workspace";

export const useProject = (projectId: Id<"projects">) => {
  return useQuery(api.projects.getById, { id: projectId });
};

export const useProjects = () => {
  // D-020 — scope by active-workspace cookie when set. The Convex query
  // falls back to ownerId when workspaceId is undefined, preserving the
  // legacy behavior for users without a workspace yet.
  const workspaceId = useActiveWorkspaceId();
  return useQuery(api.projects.get, workspaceId ? { workspaceId } : {});
};

export const useProjectsPartial = (limit: number) => {
  const workspaceId = useActiveWorkspaceId();
  return useQuery(
    api.projects.getPartial,
    workspaceId ? { limit, workspaceId } : { limit },
  );
};

export const useCreateProject = () => {
  return useMutation(api.projects.create).withOptimisticUpdate(
    (localStore, args) => {
      const existingProjects = localStore.getQuery(api.projects.get, {});

      if (existingProjects !== undefined) {
        const now = Date.now();
        const newProject = {
          _id: crypto.randomUUID() as Id<"projects">,
          _creationTime: now,
          name: args.name,
          ownerId: "anonymous",
          updatedAt: now,
        };

        localStore.setQuery(api.projects.get, {}, [
          newProject,
          ...existingProjects,
        ]);
      }
    }
  )
};

export const useRenameProject = () => {
  return useMutation(api.projects.rename).withOptimisticUpdate(
    (localStore, args) => {
      const existingProject = localStore.getQuery(
        api.projects.getById,
        { id: args.id }
      );

      if (existingProject !== undefined  && existingProject !== null) {
        localStore.setQuery(
          api.projects.getById,
          { id: args.id },
          {
            ...existingProject,
            name: args.name,
            updatedAt: Date.now(),
          }
        );
      }

      const existingProjects = localStore.getQuery(api.projects.get, {});

      if (existingProjects !== undefined) {
        localStore.setQuery(
          api.projects.get,
          {},
          existingProjects.map((project) => {
            return project._id === args.id
              ? { ...project, name: args.name, updatedAt: Date.now() }
              : project
          })
        );
      }
    }
  )
};
