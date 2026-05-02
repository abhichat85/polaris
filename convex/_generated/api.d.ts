/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as agent_checkpoints from "../agent_checkpoints.js";
import type * as agent_messages from "../agent_messages.js";
import type * as agent_plans from "../agent_plans.js";
import type * as agent_user_profiles from "../agent_user_profiles.js";
import type * as auth from "../auth.js";
import type * as buildPlans from "../buildPlans.js";
import type * as clerk_users from "../clerk_users.js";
import type * as constants from "../constants.js";
import type * as contract_results from "../contract_results.js";
import type * as conversations from "../conversations.js";
import type * as customers from "../customers.js";
import type * as deployments from "../deployments.js";
import type * as files from "../files.js";
import type * as files_by_path from "../files_by_path.js";
import type * as harness_telemetry from "../harness_telemetry.js";
import type * as hitl_checkpoints from "../hitl_checkpoints.js";
import type * as hooks from "../hooks.js";
import type * as integrations from "../integrations.js";
import type * as learned_preferences from "../learned_preferences.js";
import type * as mcp_servers from "../mcp_servers.js";
import type * as migrations_create_personal_workspaces from "../migrations/create_personal_workspaces.js";
import type * as migrations_verify_workspace_backfill from "../migrations/verify_workspace_backfill.js";
import type * as plans from "../plans.js";
import type * as projects from "../projects.js";
import type * as prompt_enrichment from "../prompt_enrichment.js";
import type * as response_feedback from "../response_feedback.js";
import type * as runtimeErrors from "../runtimeErrors.js";
import type * as sandboxes from "../sandboxes.js";
import type * as specs from "../specs.js";
import type * as steering from "../steering.js";
import type * as system from "../system.js";
import type * as usage from "../usage.js";
import type * as user_profiles from "../user_profiles.js";
import type * as waitlist from "../waitlist.js";
import type * as warm_sandboxes from "../warm_sandboxes.js";
import type * as webhook_events from "../webhook_events.js";
import type * as workspaces from "../workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  agent_checkpoints: typeof agent_checkpoints;
  agent_messages: typeof agent_messages;
  agent_plans: typeof agent_plans;
  agent_user_profiles: typeof agent_user_profiles;
  auth: typeof auth;
  buildPlans: typeof buildPlans;
  clerk_users: typeof clerk_users;
  constants: typeof constants;
  contract_results: typeof contract_results;
  conversations: typeof conversations;
  customers: typeof customers;
  deployments: typeof deployments;
  files: typeof files;
  files_by_path: typeof files_by_path;
  harness_telemetry: typeof harness_telemetry;
  hitl_checkpoints: typeof hitl_checkpoints;
  hooks: typeof hooks;
  integrations: typeof integrations;
  learned_preferences: typeof learned_preferences;
  mcp_servers: typeof mcp_servers;
  "migrations/create_personal_workspaces": typeof migrations_create_personal_workspaces;
  "migrations/verify_workspace_backfill": typeof migrations_verify_workspace_backfill;
  plans: typeof plans;
  projects: typeof projects;
  prompt_enrichment: typeof prompt_enrichment;
  response_feedback: typeof response_feedback;
  runtimeErrors: typeof runtimeErrors;
  sandboxes: typeof sandboxes;
  specs: typeof specs;
  steering: typeof steering;
  system: typeof system;
  usage: typeof usage;
  user_profiles: typeof user_profiles;
  waitlist: typeof waitlist;
  warm_sandboxes: typeof warm_sandboxes;
  webhook_events: typeof webhook_events;
  workspaces: typeof workspaces;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
