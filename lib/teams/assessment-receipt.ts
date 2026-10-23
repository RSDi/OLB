// The emails sent when a family signs up for an assessment: a confirmation
// to whoever filled the form in, and a short notice to the club's Gmail.
// Same voice and layout as the registration receipt. Plain module, pure,
// so tests can run it; lib/notifications/registration-receipt.ts sends.

import { SEASON_LABEL } from "./registration-form.ts"; // explicit extension so node --test can load this file
import { emailText, fillTokens, type EmailText } from "./registration-email-text.ts";
import { assessmentWhen, type Assessment } from "../onboarding/assessments.ts";
import { formatDisplayDate } from "../dates/display.ts";
import type { WaitlistInput } from "../onboarding/waitlist-form.ts";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function linkify(text: string): string {
  return esc(text).replace(/(https?:\/\/[^\s<]+)/g, (url) => {
    const trimmed = url.replace(/[).,;:!?]+$/, "");
    const tail = url.slice(trimmed.length);
    return `<a href="${trimmed}" style="color:#111;font-weight:700;word-break:break-all;">${trimmed}</a>${tail}`;
  });
}

const fullName = (first?: string, last?: string) => [first, last].map((s) => s?.trim()).filter(Boolean).join(" ");

export function assessmentVars(
  input: Pick<WaitlistInput, "parent_first" | "athlete_first">,
  assessment: Pick<Assessment, "name" | "starts_at" | "place" | "details">,
): Record<string, string> {
  return {
    parent: input.parent_first?.trim() || "",
    player: input.athlete_first?.trim() || "your player",
    assessment: assessment.name,
    date: assessmentWhen(assessment.starts_at),
    place: assessment.place?.trim() || "",
    details: assessment.details?.trim() || "",
    season: SEASON_LABEL,
  };
}

function words(input: Pick<WaitlistInput, "parent_first" | "athlete_first">, assessment: Assessment, t: EmailText) {
  const vars = assessmentVars(input, assessment);
  const fill = (s: string) => fillTokens(s, vars);
  const lines = (s: string) => fill(s).split("\n").map((l) => l.trim()).filter(Boolean);
  return {
    headline: fill(t["assessment.headline"]),
    intro: fill(t["assessment.intro"]),
    steps: lines(t["assessment.next_steps"]),
    closing: lines(t["assessment.closing"]),
    vars,
  };
}

export function assessmentSubject(
  input: Pick<WaitlistInput, "parent_first" | "athlete_first">,
  assessment: Pick<Assessment, "name" | "starts_at" | "place" | "details">,
  t: EmailText = emailText(),
): string {
  return fillTokens(t["assessment.subject"], assessmentVars(input, assessment));
}

const label = (text: string) =>
  `<div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#777;margin-bottom:10px;">${esc(text)}</div>`;

const step = (n: number, text: string) =>
  `<tr><td valign="top" style="width:30px;padding:4px 0;"><div style="width:22px;height:22px;border-radius:100px;background:#fbcb44;font-size:12px;font-weight:800;text-align:center;line-height:22px;">${n}</div></td>` +
  `<td style="padding:4px 0 10px;font-size:14.5px;line-height:1.55;color:#333;">${linkify(text)}</td></tr>`;

function introHtml(input: Pick<WaitlistInput, "parent_first" | "athlete_first">, assessment: Assessment, t: EmailText): string {
  const MARK = "\u0001";
  const vars = assessmentVars(input, assessment);
  const filled = fillTokens(t["assessment.intro"], { ...vars, player: MARK });
  return esc(filled)
    .split(MARK)
    .join(`<strong>${esc(vars.player)}</strong>`)
    .replace(/\n/g, "<br>");
}

function facts(assessment: Pick<Assessment, "starts_at" | "place" | "details">): { label: string; value: string }[] {
  const when = assessmentWhen(assessment.starts_at);
  const place = assessment.place?.trim() || "";
  const details = assessment.details?.trim() || "";
  return [
    when && { label: "When", value: when },
    place && { label: "Where", value: place },
    details && { label: "Details", value: details },
  ].filter((x): x is { label: string; value: string } => !!x);
}

export function assessmentHtml(
  input: Pick<WaitlistInput, "parent_first" | "athlete_first">,
  assessment: Assessment,
  logoUrl: string,
  t: EmailText = emailText(),
): string {
  const w = words(input, assessment, t);
  const rows = facts(assessment)
    .map(
      (f) =>
        `<tr><td style="padding:14px 16px;border-bottom:1px solid #eeebe2;"><div style="font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#777;">${esc(f.label)}</div>` +
        `<div style="font-size:14.5px;line-height:1.55;color:#333;margin-top:4px;">${esc(f.value).replace(/\n/g, "<br>")}</div></td></tr>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f1ea;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f1ea;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:Inter,-apple-system,'Helvetica Neue',Helvetica,Arial,sans-serif;color:#111;">
<tr><td align="center" style="padding:32px 32px 8px;"><img src="${esc(logoUrl)}" width="300" alt="Omaha Lightning Basketball" style="display:block;width:300px;max-width:100%;height:auto;"></td></tr>
<tr><td style="padding:24px 36px 8px;">
<div style="display:inline-block;background:#fbcb44;color:#000;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:6px 12px;border-radius:100px;">${esc(assessment.name)}</div>
<h1 style="margin:16px 0 8px;font-size:30px;line-height:1.15;font-weight:800;">${esc(w.headline)}</h1>
<p style="margin:0;font-size:16px;line-height:1.6;color:#333;">${introHtml(input, assessment, t)}</p>
</td></tr>
${rows ? `<tr><td style="padding:24px 36px 4px;">${label("The assessment")}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e6e3d9;border-radius:12px;">${rows}</table></td></tr>` : ""}
<tr><td style="padding:24px 36px 8px;">${label("What happens next")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${w.steps.map((line, i) => step(i + 1, line)).join("\n")}
</table></td></tr>
<tr><td style="padding:12px 36px 32px;"><p style="margin:0;font-size:14.5px;line-height:1.6;color:#333;">${w.closing.map((l, i) => (i === w.closing.length - 1 && i > 0 ? `<strong>${esc(l)}</strong>` : esc(l))).join("<br>")}</p></td></tr>
<tr><td style="background:#000;padding:22px 36px;"><div style="height:3px;background:#fbcb44;border-radius:2px;margin-bottom:14px;"></div>
<div style="font-size:13px;line-height:1.6;color:#d8d4c6;"><strong style="color:#fbcb44;">Omaha Lightning Basketball</strong><br>omahalightningbasketball.com &middot; You&rsquo;re getting this because you signed a player up for an assessment.</div></td></tr>
</table></td></tr></table></body></html>`;
}

export function assessmentText(
  input: Pick<WaitlistInput, "parent_first" | "athlete_first">,
  assessment: Assessment,
  t: EmailText = emailText(),
): string {
  const w = words(input, assessment, t);
  const factLines = facts(assessment).map((f) => `${f.label}: ${f.value}`);
  return [
    w.intro,
    "",
    ...(factLines.length ? ["THE ASSESSMENT", ...factLines, ""] : []),
    "WHAT HAPPENS NEXT",
    ...w.steps.map((l, i) => `${i + 1}. ${l}`),
    "",
    ...w.closing,
  ].join("\n");
}

export function assessmentNoticeSubject(playerName: string): string {
  return `New assessment: ${playerName}`;
}

// Same parent line as the registration club notice.
function parentLine(role: string, first?: string, last?: string, email?: string, phone?: string): string | null {
  const name = fullName(first, last);
  return name || email || phone?.trim()
    ? `${role}: ${[name, email?.trim(), phone?.trim()].filter(Boolean).join(" · ")}`
    : null;
}

export function assessmentNoticeText(
  input: WaitlistInput,
  assessment: Pick<Assessment, "name" | "level" | "slug">,
  reviewUrl: string,
): string {
  const player = fullName(input.athlete_first, input.athlete_last) || "A player";
  const born = formatDisplayDate(input.athlete_dob);
  const answers = [
    input.homeschooled === true ? "Homeschooled: yes" : input.homeschooled === false ? "Homeschooled: no" : null,
    input.experience?.trim() && `Experience: ${input.experience.trim()}`,
    input.grade?.trim() && `Grade: ${input.grade.trim()}`,
    input.friends?.trim() && `Friends: ${input.friends.trim()}`,
    input.heard_from?.trim() && `Heard from: ${input.heard_from.trim()}`,
    input.notes?.trim() && `Notes: ${input.notes.trim()}`,
  ].filter((l): l is string => !!l);
  return [
    `${player} just signed up for an assessment on the website.`,
    "",
    `Player: ${player}`,
    born && `Birthday: ${born}`,
    `Assessment: ${assessment.name}`,
    assessment.level && `Level: ${assessment.level}`,
    "",
    parentLine("Parent", input.parent_first, input.parent_last, input.email, input.phone),
    "",
    ...(answers.length ? ["Answers:", ...answers.map((a) => `• ${a}`), ""] : []),
    `Review it in the portal: ${reviewUrl}`,
  ]
    .filter((l): l is string => l !== null && l !== false)
    .join("\n");
}
