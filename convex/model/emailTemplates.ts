/**
 * The email templates: plain functions from resolved content to
 * `{ subject, html }`, with no I/O. Every value is escaped on the way in.
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

function layout(title: string, body: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="margin-bottom: 16px;">${escapeHtml(title)}</h2>
      ${body}
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
