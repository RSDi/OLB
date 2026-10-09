// Server-only. When a family submits the registration form: the receipt to
// whoever filled it in, and a notice to the club's Gmail. Best effort: a
// missing RESEND_API_KEY or a refused send is logged, and the registration
// still counts.
//
//   MAIL_CHECK_ADDRESS  where checks are mailed, lines separated by "|"
//                       (e.g. "Jason Wesner|123 Main St|Omaha, NE 68000").
//                       Unset, the receipt says to reply for the address.
//   NEXT_PUBLIC_SITE_URL the site's address, for the logo and the portal link.

import { CLUB_EMAIL } from "../contact/message";
import { mailFrom, mailReplyTo } from "./mail";
import {
  clubNoticeSubject,
  clubNoticeText,
  receipt,
  receiptHtml,
  receiptSubject,
  receiptText,
  registrant,
} from "../teams/registration-receipt";
import type { RegistrationInput } from "../teams/registration-form";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function siteUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://omahalightningbasketball.com");
  return url.replace(/\/$/, "");
}

async function send(apiKey: string, payload: Record<string, unknown>, what: string): Promise<boolean> {
  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  }).catch(() => null);
  if (!res?.ok) {
    const text = res ? await res.text().catch(() => "") : "network error";
    console.error(`[notify] Resend ${what} failed (${res?.status ?? "-"}): ${text.slice(0, 300)}`);
    return false;
  }
  return true;
}

export async function sendRegistrationEmails(inputs: RegistrationInput[], confirmedEmail: string | null): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[notify] RESEND_API_KEY not set — skipping registration receipt and club notice");
    return;
  }
  const r = receipt(inputs);
  const who = registrant(inputs[0], confirmedEmail);
  const site = siteUrl();
  const checkAddress = (process.env.MAIL_CHECK_ADDRESS ?? "").split("|").map((s) => s.trim()).filter(Boolean);
  const from = mailFrom();

  await Promise.all([
    who
      ? send(
          apiKey,
          {
            from,
            to: [who.email],
            reply_to: mailReplyTo(),
            subject: receiptSubject(r),
            html: receiptHtml(r, who, { logoUrl: `${site}/email/olb-logo.png`, checkAddress }),
            text: receiptText(r, who, { checkAddress }),
          },
          "registration receipt"
        )
      : Promise.resolve(false),
    send(
      apiKey,
      {
        from,
        to: [CLUB_EMAIL],
        // Reply straight to the family.
        ...(who ? { reply_to: who.email } : {}),
        subject: clubNoticeSubject(r),
        text: clubNoticeText(r, inputs[0], who, !!confirmedEmail, `${site}/portal/directory/registrations`),
      },
      "registration notice"
    ),
  ]);
}
