/**
 * Deployments CRUD. Authority: sub-plan 07.
 *
 * The Inngest pipeline calls these mutations through internal-key auth so it
 * can update state from the server. The UI reads via `listByProject` /
 * `getById` queries.
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

const STATUS_VALIDATOR = v.union(
  v.literal("provisioning_db"),
  v.literal("running_migrations"),
  v.literal("env_capture"),
  v.literal("deploying"),
  v.literal("succeeded"),
  v.literal("failed"),
)

function validateInternalKey(key: string) {
  const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY
  if (!internalKey) {
    throw new Error("POLARIS_CONVEX_INTERNAL_KEY is not configured")
  }
  if (key !== internalKey) {
    throw new Error("Invalid internal key")
  }
}

export const create = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    userId: v.string(),
    currentStep: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey)
    return await ctx.db.insert("deployments", {
      projectId: args.projectId,
      userId: args.userId,
      status: "provisioning_db",
      currentStep: args.currentStep,
      startedAt: Date.now(),
    })
  },
})

export const updateStep = mutation({
  args: {
    internalKey: v.string(),
    deploymentId: v.id("deployments"),
    status: STATUS_VALIDATOR,
    currentStep: v.string(),
    vercelDeploymentId: v.optional(v.string()),
    supabaseProjectRef: v.optional(v.string()),
    liveUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey)
    const patch: Record<string, unknown> = {
      status: args.status,
      currentStep: args.currentStep,
    }
    if (args.vercelDeploymentId !== undefined) {
      patch.vercelDeploymentId = args.vercelDeploymentId
    }
    if (args.supabaseProjectRef !== undefined) {
      patch.supabaseProjectRef = args.supabaseProjectRef
    }
    if (args.liveUrl !== undefined) patch.liveUrl = args.liveUrl
    await ctx.db.patch(args.deploymentId, patch)
  },
})

export const markFailed = mutation({
  args: {
    internalKey: v.string(),
    deploymentId: v.id("deployments"),
    currentStep: v.string(),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey)
    await ctx.db.patch(args.deploymentId, {
      status: "failed",
      currentStep: args.currentStep,
      errorMessage: args.errorMessage,
      completedAt: Date.now(),
    })
  },
})

export const markSucceeded = mutation({
  args: {
    internalKey: v.string(),
    deploymentId: v.id("deployments"),
    liveUrl: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey)
    await ctx.db.patch(args.deploymentId, {
      status: "succeeded",
      currentStep: "Deployed",
      liveUrl: args.liveUrl,
      completedAt: Date.now(),
    })
  },
})

export const getById = query({
  args: { deploymentId: v.id("deployments") },
  handler: async (ctx, args) => ctx.db.get(args.deploymentId),
})

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("deployments")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect()
  },
})
