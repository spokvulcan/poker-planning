/**
 * The per-kind email templates (spec §16.1): `magicLink`, `retroOpen` and
 * `nudge` here; `ownerAssigned` and `dueToday` arrive with the reminders
 * (#298). Plain functions from resolved content to `{ subject, html }`,
 * with no I/O, so a test can read what a body says and what it never
 * says. Every value is escaped on the way in.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export interface EmailBody {
  subject: string;
  html: string;
}

/** The footer every non-magic-link email carries (spec §16.4). */
export interface UnsubscribeLinks {
  /** The `/unsubscribe?token=…` page. */
  pageUrl: string;
}

function layout(title: string, body: string, unsubscribe?: UnsubscribeLinks): string {
  const footer = unsubscribe
    ? `<p style="color: #999; font-size: 12px; margin-top: 32px;">
        You get these because you belong to a team on AgileKit.
        <a href="${escapeHtml(unsubscribe.pageUrl)}" style="color: #999;">Stop retro and action emails</a>.
      </p>`
    : "";
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="margin-bottom: 16px;">${escapeHtml(title)}</h2>
      ${body}
      ${footer}
    </div>
  `;
}

function button(url: string, label: string): string {
  return `<a href="${escapeHtml(url)}"
         style="display: inline-block; background: #18181b; color: #fff;
                padding: 12px 24px; border-radius: 8px; text-decoration: none;
                font-weight: 500;">
        ${escapeHtml(label)}
      </a>`;
}

function dateLine(at: number): string {
  return new Date(at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function magicLink(args: { url: string }): EmailBody {
  return {
    subject: "Sign in to AgileKit",
    html: layout(
      "Sign in to AgileKit",
      `<p style="color: #555; margin-bottom: 24px;">
        Click the button below to sign in. This link expires in 10 minutes.
      </p>
      ${button(args.url, "Sign in to AgileKit")}
      <p style="color: #999; font-size: 13px; margin-top: 24px;">
        If you didn't request this email, you can safely ignore it.
      </p>`
    ),
  };
}

/** What both retro emails carry (spec §16.2): facts about the retro, never about a person's cards. */
export interface RetroEmailArgs {
  retroName: string;
  teamName: string;
  formatName: string;
  cardCount: number;
  collectUntil?: number;
  senderName: string;
  /** Whether a reply reaches the sender (reply-to is set): the body says so only then. */
  canReply: boolean;
  roomUrl: string;
}

function retroFacts(args: RetroEmailArgs): string {
  const cards = args.cardCount === 1 ? "1 card so far" : `${args.cardCount} cards so far`;
  const due = args.collectUntil !== undefined ? ` · Cards due ${dateLine(args.collectUntil)}` : "";
  return `<p style="color: #555; margin-bottom: 8px;">
        ${escapeHtml(args.teamName)} · ${escapeHtml(args.formatName)}
      </p>
      <p style="color: #555; margin-bottom: 24px;">${escapeHtml(cards)}${escapeHtml(due)}</p>`;
}

export function retroOpen(args: RetroEmailArgs, unsubscribe: UnsubscribeLinks): EmailBody {
  return {
    subject: `${args.retroName} is open for cards`,
    html: layout(
      `${args.retroName} is open for cards`,
      `<p style="color: #555; margin-bottom: 16px;">
        ${escapeHtml(args.senderName)} started a retro for ${escapeHtml(args.teamName)}. Add your cards whenever suits you.
      </p>
      ${retroFacts(args)}
      ${button(args.roomUrl, "Open the retro")}`,
      unsubscribe
    ),
  };
}

export function nudge(args: RetroEmailArgs, unsubscribe: UnsubscribeLinks): EmailBody {
  return {
    subject: `${args.senderName} is asking for your cards in ${args.retroName}`,
    html: layout(
      `${args.retroName} is waiting for your cards`,
      `<p style="color: #555; margin-bottom: 16px;">
        ${escapeHtml(args.senderName)} is asking ${escapeHtml(args.teamName)} for cards.${args.canReply ? " Reply to this email to reach them." : ""}
      </p>
      ${retroFacts(args)}
      ${button(args.roomUrl, "Add your cards")}`,
      unsubscribe
    ),
  };
}
