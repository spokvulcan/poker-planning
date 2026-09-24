import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import * as Templates from "./model/emailTemplates";

/**
 * The email channel: raw `fetch` to Resend, from "AgileKit". The only email
 * AgileKit sends is the sign-in magic link, which is transactional: no
 * opt-out, no unsubscribe headers.
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
      headers: { "X-Entity-Ref-ID": crypto.randomUUID() },
    }),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send email: ${error}`);
  }
}

/** The magic link (auth.ts). */
export const sendMagicLinkEmail = internalAction({
  args: { to: v.string(), url: v.string() },
  handler: async (_ctx, { to, url }) => {
    await deliver({ to, ...Templates.magicLink({ url }) });
  },
});
