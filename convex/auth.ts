import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import type { GenericActionCtx } from "convex/server";
import { convex } from "@convex-dev/better-auth/plugins";
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { betterAuth } from "better-auth";
import { anonymous, magicLink } from "better-auth/plugins";
import { internal } from "./_generated/api";
import authConfig from "./auth.config";
import { getSiteUrl } from "@/lib/site-config";

const siteUrl = getSiteUrl();
if (!siteUrl) {
  throw new Error(
    "Missing site URL. " +
      "Set it with: npx convex env set SITE_URL http://localhost:3000"
  );
}

const authSecret = process.env.BETTER_AUTH_SECRET;
if (!authSecret) {
  throw new Error(
    "Missing BETTER_AUTH_SECRET environment variable. " +
      "Set it with: npx convex env set BETTER_AUTH_SECRET $(openssl rand -base64 32)"
  );
}

// The component client has methods needed for integrating Convex with Better Auth,
// as well as helper methods for general use.
export const authComponent = createClient<DataModel>(components.betterAuth);

// Google OAuth is optional — anonymous auth and magic links work without it
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleProvider =
  googleClientId && googleClientSecret
    ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
    : {};

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    baseURL: siteUrl,
    secret: authSecret,
    database: authComponent.adapter(ctx),
    socialProviders: googleProvider,
    session: {
      expiresIn: 60 * 60 * 24 * 365, // 1 year
      updateAge: 60 * 60 * 24 * 7,   // refresh weekly
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60, // Cache duration in seconds
      },
    },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google"],
      },
    },
    trustedOrigins: [
      siteUrl,
      "https://agilekit.app",
      "https://*.agilekit.app",
      "https://*.vercel.app", // Vercel preview deployments
    ],
    // Sync auth provider data to Convex users table
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            if (!("runMutation" in ctx)) return;
            const actionCtx = ctx as GenericActionCtx<DataModel>;

            // Skip anonymous users: a guest's Convex user record is made on
            // their first room write (model/users.ts findOrMakeUser).
            if ((user as Record<string, unknown>).isAnonymous) return;

            // Permanent account (Google OAuth, magic link): create Convex user
            // record. The users model fits the provider's name to the name
            // rule, or the email's local part when there is none (a magic link).
            await actionCtx.runMutation(
              internal.users.ensureGlobalUserFromAuth,
              {
                authUserId: user.id,
                name: user.name,
                email: user.email,
                avatarUrl: user.image ?? undefined,
              }
            );
          },
        },
        update: {
          after: async (user) => {
            if (user.image && "runMutation" in ctx) {
              const actionCtx = ctx as GenericActionCtx<DataModel>;
              await actionCtx.runMutation(internal.users.syncAvatarFromAuth, {
                authUserId: user.id,
                avatarUrl: user.image,
              });
            }
          },
        },
      },
    },
    plugins: [
      // The Convex plugin is required for Convex compatibility
      convex({ authConfig }),
      // Anonymous authentication plugin
      // BetterAuth HTTP handlers run as Convex actions, so ctx is always an ActionCtx
      anonymous({
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          if (!("runMutation" in ctx)) {
            throw new Error("onLinkAccount must run in an action context");
          }
          const actionCtx = ctx as GenericActionCtx<DataModel>;
          await actionCtx.runMutation(internal.users.linkAnonymousAccount, {
            oldAuthUserId: anonymousUser.user.id,
            newAuthUserId: newUser.user.id,
            email: newUser.user.email,
            name: newUser.user.name ?? undefined,
            avatarUrl: newUser.user.image ?? undefined,
          });
        },
      }),
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          if (!("runAction" in ctx)) {
            throw new Error("sendMagicLink must run in an action context");
          }
          const actionCtx = ctx as GenericActionCtx<DataModel>;
          await actionCtx.runAction(internal.email.sendMagicLinkEmail, {
            to: email,
            url,
          });
        },
        expiresIn: 60 * 10, // 10 minutes
      }),
    ],
  });
};

// Get the current authenticated user
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return authComponent.getAuthUser(ctx);
  },
});
