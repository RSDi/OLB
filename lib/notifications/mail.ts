// Who the site's emails (sent through Resend) come from, and where replies
// go. Server-only. Blank settings count as unset.
//
//   MAIL_FROM      the sender, on a domain verified in Resend, e.g.
//                  "Omaha Lightning Basketball <registration@omahalightningbasketball.com>".
//                  The domain needs no mailbox of its own.
//   MAIL_REPLY_TO  where a reply lands. Defaults to the club's Gmail, since
//                  the sending domain has no inbox.

import { CLUB_EMAIL } from "../contact/message.ts"; // explicit extension so node --test can load this file

export function mailFrom(name = "Omaha Lightning Basketball", env: Record<string, string | undefined> = process.env): string {
  return env.MAIL_FROM?.trim() || `${name} <onboarding@resend.dev>`;
}

export function mailReplyTo(env: Record<string, string | undefined> = process.env): string {
  return env.MAIL_REPLY_TO?.trim() || CLUB_EMAIL;
}
