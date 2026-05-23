/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as analytics from "../analytics.js";
import type * as auth from "../auth.js";
import type * as canvas from "../canvas.js";
import type * as cleanup from "../cleanup.js";
import type * as cleanupDemo from "../cleanupDemo.js";
import type * as constants from "../constants.js";
import type * as crons from "../crons.js";
import type * as email from "../email.js";
import type * as http from "../http.js";
import type * as integrations from "../integrations.js";
import type * as integrations_jira from "../integrations/jira.js";
import type * as integrations_jiraClient from "../integrations/jiraClient.js";
import type * as issues from "../issues.js";
import type * as lib_encryption from "../lib/encryption.js";
import type * as maintenance from "../maintenance.js";
import type * as model_analytics from "../model/analytics.js";
import type * as model_auth from "../model/auth.js";
import type * as model_canvas from "../model/canvas.js";
import type * as model_cleanup from "../model/cleanup.js";
import type * as model_countdown from "../model/countdown.js";
import type * as model_issues from "../model/issues.js";
import type * as model_permissions from "../model/permissions.js";
import type * as model_roles from "../model/roles.js";
import type * as model_rooms from "../model/rooms.js";
import type * as model_timer from "../model/timer.js";
import type * as model_users from "../model/users.js";
import type * as model_votes from "../model/votes.js";
import type * as model_votingRound from "../model/votingRound.js";
import type * as permissions from "../permissions.js";
import type * as presence from "../presence.js";
import type * as roles from "../roles.js";
import type * as rooms from "../rooms.js";
import type * as scales from "../scales.js";
import type * as summarize from "../summarize.js";
import type * as timer from "../timer.js";
import type * as users from "../users.js";
import type * as votes from "../votes.js";
import type * as votingRound from "../votingRound.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  analytics: typeof analytics;
  auth: typeof auth;
  canvas: typeof canvas;
  cleanup: typeof cleanup;
  cleanupDemo: typeof cleanupDemo;
  constants: typeof constants;
  crons: typeof crons;
  email: typeof email;
  http: typeof http;
  integrations: typeof integrations;
  "integrations/jira": typeof integrations_jira;
  "integrations/jiraClient": typeof integrations_jiraClient;
  issues: typeof issues;
  "lib/encryption": typeof lib_encryption;
  maintenance: typeof maintenance;
  "model/analytics": typeof model_analytics;
  "model/auth": typeof model_auth;
  "model/canvas": typeof model_canvas;
  "model/cleanup": typeof model_cleanup;
  "model/countdown": typeof model_countdown;
  "model/issues": typeof model_issues;
  "model/permissions": typeof model_permissions;
  "model/roles": typeof model_roles;
  "model/rooms": typeof model_rooms;
  "model/timer": typeof model_timer;
  "model/users": typeof model_users;
  "model/votes": typeof model_votes;
  "model/votingRound": typeof model_votingRound;
  permissions: typeof permissions;
  presence: typeof presence;
  roles: typeof roles;
  rooms: typeof rooms;
  scales: typeof scales;
  summarize: typeof summarize;
  timer: typeof timer;
  users: typeof users;
  votes: typeof votes;
  votingRound: typeof votingRound;
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

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  presence: import("@convex-dev/presence/_generated/component.js").ComponentApi<"presence">;
};
