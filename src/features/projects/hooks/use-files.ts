import { useMutation, useQuery } from "convex/react";
import { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";

/**
 * D-016 — Optimistic mutations for file ops.
 *
 * Convex's `withOptimisticUpdate` lets us apply the local-store change
 * immediately so the file tree feels instant; the real mutation reconciles
 * (and any conflict invalidates the optimistic state automatically).
 *
 * Each optimistic update synthesizes a temporary `_id`, sets `_creationTime`
 * to now, and writes the same shape into `getFolderContents` for the
 * matching (projectId, parentId) tuple.
 */

export const useFile = (fileId: Id<"files"> | null) => {
  return useQuery(api.files.getFile, fileId ? { id: fileId } : "skip");
};

export const useFilePath = (fileId: Id<"files"> | null) => {
  return useQuery(api.files.getFilePath, fileId ? { id: fileId } : "skip");
};

export const useUpdateFile = () => {
  return useMutation(api.files.updateFile);
};

const synthId = (): Id<"files"> =>
  (`optimistic-${crypto.randomUUID()}`) as unknown as Id<"files">;

export const useCreateFile = () => {
  return useMutation(api.files.createFile).withOptimisticUpdate(
    (localStore, args) => {
      const key = { projectId: args.projectId, parentId: args.parentId };
      const existing = localStore.getQuery(api.files.getFolderContents, key);
      if (existing === undefined) return;
      const now = Date.now();
      const optimistic = {
        _id: synthId(),
        _creationTime: now,
        projectId: args.projectId,
        parentId: args.parentId,
        name: args.name,
        type: "file" as const,
        content: args.content,
        updatedAt: now,
      };
      localStore.setQuery(api.files.getFolderContents, key, [
        ...existing,
        optimistic,
      ]);
    },
  );
};

export const useCreateFolder = () => {
  return useMutation(api.files.createFolder).withOptimisticUpdate(
    (localStore, args) => {
      const key = { projectId: args.projectId, parentId: args.parentId };
      const existing = localStore.getQuery(api.files.getFolderContents, key);
      if (existing === undefined) return;
      const now = Date.now();
      const optimistic = {
        _id: synthId(),
        _creationTime: now,
        projectId: args.projectId,
        parentId: args.parentId,
        name: args.name,
        type: "folder" as const,
        updatedAt: now,
      };
      localStore.setQuery(api.files.getFolderContents, key, [
        ...existing,
        optimistic,
      ]);
    },
  );
};

export const useRenameFile = () => {
  return useMutation(api.files.renameFile).withOptimisticUpdate(
    (localStore, args) => {
      // We don't know the parentId from args alone, so patch every cached
      // folder query that contains this file. Convex's local store is
      // small per-session, so the scan is cheap.
      const allQueries = localStore.getAllQueries(api.files.getFolderContents);
      for (const q of allQueries) {
        if (!q.value) continue;
        const next = q.value.map((f) =>
          f._id === args.id ? { ...f, name: args.newName, updatedAt: Date.now() } : f,
        );
        localStore.setQuery(api.files.getFolderContents, q.args, next);
      }
    },
  );
};

export const useDeleteFile = () => {
  return useMutation(api.files.deleteFile).withOptimisticUpdate(
    (localStore, args) => {
      const allQueries = localStore.getAllQueries(api.files.getFolderContents);
      for (const q of allQueries) {
        if (!q.value) continue;
        const next = q.value.filter((f) => f._id !== args.id);
        if (next.length !== q.value.length) {
          localStore.setQuery(api.files.getFolderContents, q.args, next);
        }
      }
    },
  );
};

export const useFolderContents = ({
  projectId,
  parentId,
  enabled = true,
}: {
  projectId: Id<"projects">;
  parentId?: Id<"files">;
  enabled?: boolean;
}) => {
  return useQuery(
    api.files.getFolderContents,
    enabled ? { projectId, parentId } : "skip",
  );
};
