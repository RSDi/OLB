// The emails sent when a family submits the registration form: a receipt to
// the person who filled it in (who registered, what it costs, how to pay,
// what happens next) and a short notice to the club's Gmail. Plain module,
// pure, so tests can run it; lib/notifications/registration-receipt.ts sends.

import { SEASON_LABEL, isHighSchoolTier, joinNames, tierParts, type RegistrationInput } from "./registration-form.ts"; // explicit extension so node --test can load this file
import type { RegistrationExtra } from "./roster-logic.ts";

export const VENMO_HANDLE = "OmahaLightning-Basketball";
export const VENMO_URL = `https://venmo.com/u/${VENMO_HANDLE}`;
// What the form tells families to make a check out to.
export const CHECK_PAYEE = "Omaha Lightning Basketball";

const EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
const clean = (e: string | null | undefined) => {
  const v = e?.trim().toLowerCase();
  return v && EMAIL.test(v) ? v : null;
};
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const fullName = (first?: string, last?: string) => [first, last].map((s) => s?.trim()).filter(Boolean).join(" ");

export interface Registrant {
  email: string;
  // First name for "Hi Anna,"; null when we can't tell who it was.
  first: string | null;
}

// Who filled the form in, and so gets the receipt: the email they confirmed
// with the code; without one, the parent who signed the waiver; failing
// that, the first parent email on the form. Never both parents.
export function registrant(input: RegistrationInput, confirmedEmail: string | null): Registrant | null {
  const parents = [
    { first: input.father_first?.trim() || null, name: fullName(input.father_first, input.father_last), email: clean(input.father_email) },
    { first: input.mother_first?.trim() || null, name: fullName(input.mother_first, input.mother_last), email: clean(input.mother_email) },
  ];
  const signer = norm(input.signature_mode === "type" && input.signature_name ? input.signature_name : input.printed_name);
  const signerFirst = (input.printed_name || input.signature_name || "").trim().split(/\s+/)[0] || null;

  const confirmed = clean(confirmedEmail);
  if (confirmed) {
    const parent = parents.find((p) => p.email === confirmed);
    return { email: confirmed, first: parent?.first ?? signerFirst };
  }
  const signed = signer ? parents.find((p) => p.email && norm(p.name) === signer) : undefined;
  if (signed) return { email: signed.email!, first: signed.first };
  const first = parents.find((p) => p.email);
  return first ? { email: first.email!, first: first.first } : null;
}

// A saved registration (olb_registrations) back as the form's answers, for
// sending its receipt again from the Registrations page.
export function savedInput(reg: { first_name: string; last_name: string; extra: RegistrationExtra | null }): RegistrationInput {
  const x = reg.extra ?? {};
  return {
    athlete_first: reg.first_name,
    athlete_last: reg.last_name,
    athlete_email: x.athlete_email ?? "",
    needs_uniform: x.needs_uniform ?? null,
    needs_grays: x.needs_grays ?? null,
    fee_tier: x.fee_tier ?? "",
    payment_option: x.payment_option ?? "",
    father_first: x.father?.first ?? "",
    father_last: x.father?.last ?? "",
    father_email: x.father?.email ?? "",
    father_phone: x.father?.phone ?? "",
    mother_first: x.mother?.first ?? "",
    mother_last: x.mother?.last ?? "",
    mother_email: x.mother?.email ?? "",
    mother_phone: x.mother?.phone ?? "",
    printed_name: x.printed_name ?? "",
    signature_mode: x.signature_name ? "type" : "draw",
    signature_name: x.signature_name ?? "",
  } as RegistrationInput;
}

// The emails on a registration: a receipt sent to one of these is the
// family's and is kept; anything else is a test.
export function registrationEmails(input: RegistrationInput, confirmedEmail: string | null): string[] {
  return [confirmedEmail, input.father_email, input.mother_email, input.athlete_email].map(clean).filter((e): e is string => !!e);
}

// "Hi Anna" for whichever parent owns the address; else the registrant's name.
export function greetingFor(input: RegistrationInput, email: string, fallback: string | null): string | null {
  const e = clean(email);
  if (e && clean(input.mother_email) === e) return input.mother_first?.trim() || fallback;
  if (e && clean(input.father_email) === e) return input.father_first?.trim() || fallback;
  return fallback;
}

export interface ReceiptPlayer {
  name: string;
  first: string;
  tier: string;
  cents: number;
  uniform: boolean | null;
  grays: boolean | null;
}

export interface Receipt {
  players: ReceiptPlayer[];
  totalCents: number;
  payment: string;
}

export function receipt(inputs: RegistrationInput[]): Receipt {
  const players = inputs.map((i) => {
    const t = tierParts(i.fee_tier ?? "");
    return {
      name: fullName(i.athlete_first, i.athlete_last),
      first: i.athlete_first?.trim() || "your player",
      tier: t?.label ?? (i.fee_tier ?? ""),
      cents: t ? Math.round(t.dollars * 100) : 0,
      uniform: i.needs_uniform ?? null,
      grays: isHighSchoolTier(i.fee_tier ?? "") ? i.needs_grays ?? null : null,
    };
  });
  return { players, totalCents: players.reduce((n, p) => n + p.cents, 0), payment: inputs[0]?.payment_option ?? "" };
}

export const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const yesNo = (v: boolean | null) => (v === null ? null : v ? "yes" : "no");

function playerFacts(p: ReceiptPlayer): string {
  return [p.tier, yesNo(p.uniform) && `New uniform: ${yesNo(p.uniform)}`, yesNo(p.grays) && `Grays: ${yesNo(p.grays)}`].filter(Boolean).join(" · ");
}

export interface ReceiptOptions {
  // Absolute URL of the logo image.
  logoUrl: string;
  // Where checks are mailed, one line per entry; empty → "reply for it".
  checkAddress: string[];
}

export function receiptSubject(r: Receipt): string {
  return `You're registered: ${joinNames(r.players.map((p) => p.first))} for the ${SEASON_LABEL} season`;
}

// Gold label above a section, as on the site.
const label = (text: string) =>
  `<div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#777;margin-bottom:10px;">${esc(text)}</div>`;

const step = (n: number, text: string) =>
  `<tr><td valign="top" style="width:30px;padding:4px 0;"><div style="width:22px;height:22px;border-radius:100px;background:#fbcb44;font-size:12px;font-weight:800;text-align:center;line-height:22px;">${n}</div></td>` +
  `<td style="padding:4px 0 10px;font-size:14.5px;line-height:1.55;color:#333;">${text}</td></tr>`;

export function receiptHtml(r: Receipt, who: Registrant, o: ReceiptOptions): string {
  const kids = esc(joinNames(r.players.map((p) => p.first)));
  const total = money(r.totalCents);
  const rows = r.players
    .map(
      (p) =>
        `<tr><td style="padding:14px 16px;border-bottom:1px solid #eeebe2;"><div style="font-size:16px;font-weight:800;">${esc(p.name)}</div>` +
        `<div style="font-size:13px;color:#666;margin-top:3px;">${esc(playerFacts(p))}</div></td>` +
        `<td align="right" valign="top" style="padding:14px 16px;border-bottom:1px solid #eeebe2;font-size:16px;font-weight:700;white-space:nowrap;">${money(p.cents)}</td></tr>`
    )
    .join("");
  const venmo = r.payment === "Venmo";
  const address = o.checkAddress.length
    ? `and mail it to:<br><span style="color:#111;">${o.checkAddress.map(esc).join("<br>")}</span>`
    : "and reply to this email for the mailing address.";
  const checkLine = `Make your check out to <strong>${esc(CHECK_PAYEE)}</strong> ${address}`;
  const venmoButton =
    `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#000;border-radius:100px;">` +
    `<a href="${VENMO_URL}" style="display:inline-block;padding:13px 24px;color:#fbcb44;font-size:15px;font-weight:800;text-decoration:none;">Pay @${VENMO_HANDLE} on Venmo</a></td></tr></table>`;
  const pay = venmo
    ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#333;">You chose <strong>Venmo</strong>. If you haven&rsquo;t paid yet, send <strong>${total}</strong> with ${kids}&rsquo;s ${r.players.length > 1 ? "names" : "name"} in the note.</p>${venmoButton}` +
      `<p style="margin:14px 0 0;font-size:13.5px;line-height:1.6;color:#555;">Paying by check instead? ${checkLine}</p>`
    : `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#333;">You chose <strong>check</strong>. If you haven&rsquo;t paid yet, send <strong>${total}</strong>. ${checkLine}</p>` +
      `<p style="margin:0;font-size:13.5px;line-height:1.6;color:#555;">Rather use Venmo? Send it to <a href="${VENMO_URL}" style="color:#111;font-weight:700;">@${VENMO_HANDLE}</a> with ${kids}&rsquo;s ${r.players.length > 1 ? "names" : "name"} in the note.</p>`;

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f1ea;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f1ea;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:Inter,-apple-system,'Helvetica Neue',Helvetica,Arial,sans-serif;color:#111;">
<tr><td align="center" style="padding:32px 32px 8px;"><img src="${esc(o.logoUrl)}" width="300" alt="Omaha Lightning Basketball" style="display:block;width:300px;max-width:100%;height:auto;"></td></tr>
<tr><td style="padding:24px 36px 8px;">
<div style="display:inline-block;background:#fbcb44;color:#000;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:6px 12px;border-radius:100px;">${esc(SEASON_LABEL)} season</div>
<h1 style="margin:16px 0 8px;font-size:30px;line-height:1.15;font-weight:800;">You&rsquo;re registered!</h1>
<p style="margin:0;font-size:16px;line-height:1.6;color:#333;">${who.first ? `Hi ${esc(who.first)}, thanks` : "Thanks"} for registering <strong>${kids}</strong> with Omaha Lightning Basketball. We&rsquo;ve got everything we need, and a coach will be in touch about team placement.</p>
</td></tr>
<tr><td style="padding:24px 36px 4px;">${label("Your registration")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e6e3d9;border-radius:12px;">${rows}
<tr><td style="padding:14px 16px;background:#000;color:#fbcb44;font-size:14px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;border-radius:0 0 0 11px;">${r.players.length > 1 ? "Total registration fees" : "Registration fee"}</td>
<td align="right" style="padding:14px 16px;background:#000;color:#fbcb44;font-size:20px;font-weight:800;border-radius:0 0 11px 0;">${total}</td></tr></table>
<p style="margin:10px 2px 0;font-size:12.5px;line-height:1.5;color:#777;">Uniform sizes and costs come separately, once teams are set.</p>
</td></tr>
<tr><td style="padding:24px 36px 4px;">${label("How to pay")}${pay}</td></tr>
<tr><td style="padding:24px 36px 8px;">${label("What happens next")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${step(1, `The club reviews your registration and places ${kids} on ${r.players.length > 1 ? "teams" : "a team"}.`)}
${step(2, "A board member will contact you with instructions for joining our team communication platform, Slack.")}
</table></td></tr>
<tr><td style="padding:12px 36px 32px;"><p style="margin:0;font-size:14.5px;line-height:1.6;color:#333;">Questions? Just reply to this email.<br><strong>Go Lightning!</strong></p></td></tr>
<tr><td style="background:#000;padding:22px 36px;"><div style="height:3px;background:#fbcb44;border-radius:2px;margin-bottom:14px;"></div>
<div style="font-size:13px;line-height:1.6;color:#d8d4c6;"><strong style="color:#fbcb44;">Omaha Lightning Basketball</strong><br>omahalightningbasketball.com &middot; You&rsquo;re getting this because you registered a player.</div></td></tr>
</table></td></tr></table></body></html>`;
}

export function receiptText(r: Receipt, who: Registrant, o: Pick<ReceiptOptions, "checkAddress">): string {
  const kids = joinNames(r.players.map((p) => p.first));
  const check = `make your check out to ${CHECK_PAYEE} and ${o.checkAddress.length ? `mail it to:\n${o.checkAddress.join("\n")}` : "reply to this email for the mailing address."}`;
  return [
    `${who.first ? `Hi ${who.first}, thanks` : "Thanks"} for registering ${kids} with Omaha Lightning Basketball for the ${SEASON_LABEL} season. A coach will be in touch about team placement.`,
    "",
    "YOUR REGISTRATION",
    ...r.players.map((p) => `${p.name}: ${playerFacts(p)}: ${money(p.cents)}`),
    `Total: ${money(r.totalCents)}`,
    "Uniform sizes and costs come separately, once teams are set.",
    "",
    "HOW TO PAY",
    r.payment === "Venmo"
      ? `You chose Venmo. If you haven't paid yet, send ${money(r.totalCents)} to @${VENMO_HANDLE} (${VENMO_URL}) with ${kids} in the note. Paying by check instead? ${check[0].toUpperCase()}${check.slice(1)}`
      : `You chose check. If you haven't paid yet, send ${money(r.totalCents)}: ${check}`,
    "",
    "WHAT HAPPENS NEXT",
    `1. The club reviews your registration and places ${kids} on ${r.players.length > 1 ? "teams" : "a team"}.`,
    "2. A board member will contact you with instructions for joining our team communication platform, Slack.",
    "",
    "Questions? Just reply to this email. Go Lightning!",
  ].join("\n");
}

// ─── The club's notice ──────────────────────────────────────────────────────

export function clubNoticeSubject(r: Receipt): string {
  const names = r.players.map((p) => p.name);
  return `New registration${names.length > 1 ? "s" : ""}: ${joinNames(names)}`;
}

export function clubNoticeText(r: Receipt, input: RegistrationInput, who: Registrant | null, confirmed: boolean, reviewUrl: string): string {
  const parent = (role: string, first?: string, last?: string, email?: string, phone?: string) => {
    const name = fullName(first, last);
    return name || email ? `${role}: ${[name, email?.trim(), phone?.trim()].filter(Boolean).join(" · ")}` : null;
  };
  return [
    `${r.players.length > 1 ? `${r.players.length} players were` : "A player was"} just registered on the website.`,
    "",
    ...r.players.map((p) => `• ${p.name} (${playerFacts(p)}): ${money(p.cents)}`),
    `Total: ${money(r.totalCents)} · Paying by ${r.payment || "—"}`,
    "",
    parent("Father", input.father_first, input.father_last, input.father_email, input.father_phone),
    parent("Mother", input.mother_first, input.mother_last, input.mother_email, input.mother_phone),
    `Registered by: ${who?.email ?? "no email on the form"}${confirmed ? " (email confirmed)" : ""}`,
    "",
    `Review it in the portal: ${reviewUrl}`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}
