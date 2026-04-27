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
import type * as auth from "../auth.js";
import type * as constants from "../constants.js";
import type * as conversations from "../conversations.js";
import type * as customers from "../customers.js";
import type * as deployments from "../deployments.js";
import type * as files from "../files.js";
import type * as files_by_path from "../files_by_path.js";
import type * as integrations from "../integrations.js";
import type * as migrations_create_personal_workspaces from "../migrations/create_personal_workspaces.js";
import type * as plans from "../plans.js";
import type * as projects from "../projects.js";
import type * as specs from "../specs.js";
import type * as system from "../system.js";
import type * as usage from "../usage.js";
import type * as user_profiles from "../user_profiles.js";
import type * as waitlist from "../waitlist.js";
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
  auth: typeof auth;
  constants: typeof constants;
  conversations: typeof conversations;
  customers: typeof customers;
  deployments: typeof deployments;
  files: typeof files;
  files_by_path: typeof files_by_path;
  integrations: typeof integrations;
  "migrations/create_personal_workspaces": typeof migrations_create_personal_workspaces;
  plans: typeof plans;
  projects: typeof projects;
  specs: typeof specs;
  system: typeof system;
  usage: typeof usage;
  user_profiles: typeof user_profiles;
  waitlist: typeof waitlist;
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
