import { internalAction, internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import * as Users from "./model/users";
import * as Templates from "./model/emailTemplates";
import { mintUnsubscribeToken, requireUnsubscribeSecret } from "./model/unsubscribe";
import { resolveRetroSend, type ResolvedRetroSend } from "./model/retroNudge";

/**
 * The email channel (spec §16.1, ADR-0020): raw `fetch` to Resend, one
 * call per recipient, from "AgileKit". `send` is the one action; the
 * mutation that wants an email records its intent and schedules it with
 * `runAfter(0)`. Recipients are resolved here at send time through
 * `ctx.runQuery`, never carried in the job, so an account that opted out,
 * left the Team or was deleted in between is never emailed and no
 * reference to a deleted account is ever followed. No send log. The magic
 * link is transactional: no opt-out, no unsubscribe headers.
 */

const DEFAULT_FROM = "AgileKit <noreply@agilekit.app>";

function resendApiKey(): string {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "RESEND_API_KEY is not set. Emails cannot be sent. " +
        "Set it with: npx convex env set RESEND_API_KEY <your-key>"
    );
  }
  return key;
}

interface Message {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

/** One Resend call. Throws on a non-2xx answer so the scheduler surfaces it. */
async function deliver(message: Message): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey()}`,
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM_ADDRESS ?? DEFAULT_FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
      ...(message.replyTo !== undefined ? { reply_to: message.replyTo } : {}),
      headers: {
        "X-Entity-Ref-ID": crypto.randomUUID(),
        ...message.headers,
      },
    }),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send email: ${error}`);
  }
}

/** The app's public origin, for links in a body. */
function siteUrl(): string {
  return (process.env.SITE_URL ?? "https://agilekit.app").replace(/\/$/, "");
}

/** The deployment's HTTP origin, where the RFC 8058 route lives. Convex sets it; a test must too. */
function convexSiteUrl(): string {
  const url = process.env.CONVEX_SITE_URL;
  if (!url) throw new Error("CONVEX_SITE_URL is not set");
  return url.replace(/\/$/, "");
}

/**
 * The unsubscribe surfaces for one recipient (spec §16.4): the RFC 8058
 * header pair, pointing at the Convex HTTP route, and the footer page link.
 */
async function unsubscribeFor(userId: Id<"users">): Promise<{
  headers: Record<string, string>;
  links: Templates.UnsubscribeLinks;
}> {
  const token = encodeURIComponent(await mintUnsubscribeToken(userId, requireUnsubscribeSecret()));
  const routeUrl = `${convexSiteUrl()}/api/unsubscribe?token=${token}`;
  return {
    headers: {
      "List-Unsubscribe": `<${routeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    links: { pageUrl: `${siteUrl()}/unsubscribe?token=${token}` },
  };
}

/** The magic link (auth.ts): kept by name, now a thin wrapper over the channel. */
export const sendMagicLinkEmail = internalAction({
  args: { to: v.string(), url: v.string() },
  handler: async (_ctx, { to, url }) => {
    await deliver({ to, ...Templates.magicLink({ url }) });
  },
});

// A top-level args validator must be an object (Convex rejects a union at
// the top), so the kind is a field; the reminder kinds arrive with #298.
const sendArgs = {
  kind: v.union(v.literal("retroOpen"), v.literal("nudge")),
  roomId: v.id("rooms"),
  senderId: v.id("users"),
};

/** The send-time read behind `send`; a query, so it can never patch the room. */
export const resolveSend = internalQuery({
  args: sendArgs,
  handler: async (ctx, args) => {
    return await resolveRetroSend(ctx, args);
  },
});

/**
 * The one send action. Resolves the audience now, then one Resend call per
 * recipient with that person's unsubscribe headers and footer. A send that
 * resolves to nobody is a quiet no-op. One recipient's failure never costs
 * the rest theirs: every call is attempted, and the failures are thrown
 * together at the end so the scheduler's log names them. `lastNudge` is
 * already written, by design (the mutation records intent), so there is
 * no retry; the day passes.
 */
export const send = internalAction({
  args: sendArgs,
  handler: async (ctx, args) => {
    const resolved: ResolvedRetroSend | null = await ctx.runQuery(internal.email.resolveSend, args);
    if (!resolved) return;
    const { content, recipients } = resolved;
    const templateArgs: Templates.RetroEmailArgs = {
      retroName: content.retroName,
      teamName: content.teamName,
      formatName: content.formatName,
      cardCount: content.cardCount,
      ...(content.collectUntil !== undefined ? { collectUntil: content.collectUntil } : {}),
      senderName: content.senderName,
      canReply: content.senderEmail !== undefined,
      roomUrl: `${siteUrl()}/room/${content.roomId}`,
    };
    const failures: string[] = [];
    for (const recipient of recipients) {
      try {
        const unsubscribe = await unsubscribeFor(recipient.userId);
        const body =
          content.kind === "nudge"
            ? Templates.nudge(templateArgs, unsubscribe.links)
            : Templates.retroOpen(templateArgs, unsubscribe.links);
        await deliver({
          to: recipient.email,
          ...body,
          ...(content.senderEmail !== undefined ? { replyTo: content.senderEmail } : {}),
          headers: unsubscribe.headers,
        });
      } catch (error) {
        failures.push(`${recipient.userId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (failures.length > 0) {
      throw new Error(
        `${content.kind} for room ${content.roomId}: ${failures.length} of ${recipients.length} sends failed — ${failures.join("; ")}`
      );
    }
  },
});

/**
 * One-click unsubscribe (spec §16.4): the one mutation that deliberately
 * runs no auth guard, because the link in an email must work signed out.
 * The token's MAC is the authorization; a mismatch flips nothing. Returns
 * whether a flag was flipped. Reached from the `/unsubscribe` page and
 * from the RFC 8058 POST route in `http.ts`.
 */
export const unsubscribe = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    return await Users.unsubscribeByToken(ctx, args.token);
  },
});
