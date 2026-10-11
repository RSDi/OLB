// The words of the registration workflow's emails (0130), in the club's
// voice: warm, plain, never pushy about money. Each email has a subject and
// a body with {tokens}; Settings → Registration automations changes them
// (olb_onboarding_email_text) and Reset puts these originals back. Plain
// module, pure, safe for client and server.

import type { AutomationKey } from "./automations.ts"; // explicit extension so node --test can load this file

// Every email the workflow writes: the automatic ones plus the spot offer a
// person sends.
export type WorkflowEmail = AutomationKey | "offer";

export interface WorkflowEmailDef {
  key: WorkflowEmail;
  label: string;
  tokens: string[];
  subject: string;
  body: string;
}

const SIGN = "Omaha Lightning Basketball";

export const WORKFLOW_EMAILS: WorkflowEmailDef[] = [
  {
    key: "waitlist_reply",
    label: "Waitlist reply",
    tokens: ["parent", "player", "season"],
    subject: "Thanks for reaching out about Omaha Lightning!",
    body: `Hi {parent},

Thank you for reaching out! We've added {player} to our waitlist for the {season} season.

Our elementary teams fill fast, and we fill open spots in the order families join. Summer clinic players get first look, so coming to clinics is the best way for our coaches to meet {player}.

We'll be in touch as soon as we have room. Questions? Just reply to this email.

${SIGN}`,
  },
  {
    key: "clinic_invite",
    label: "Clinic invite",
    tokens: ["parent", "player", "clinic"],
    subject: "Come to our clinics, on us",
    body: `Hi {parent},

While {player} is on our waitlist, we'd love to have him join us at clinics at no charge. It's the best way for our coaches to get to know him.

{clinic}

Just reply to let us know he's coming.

${SIGN}`,
  },
  {
    key: "offer",
    label: "Spot offer",
    tokens: ["parent", "player", "season", "link", "expires"],
    subject: "We have room for {player}!",
    body: `Hi {parent},

Great news! We have a spot for {player} for the {season} season.

This link is just for your family, and most of the form is already filled in. It's good until {expires}:
{link}

Please don't share it, since it holds {player}'s spot. Questions? Just reply. We'd love to have you!

${SIGN}`,
  },
  {
    key: "offer_reminder",
    label: "Offer check-in",
    tokens: ["parent", "player", "link", "expires"],
    subject: "Just checking in about {player}'s spot",
    body: `Hi {parent},

Just checking in! We're holding a spot for {player} until {expires}. Here's your family's link again:
{link}

If the timing doesn't work this year, no problem at all. Just reply and let us know.

${SIGN}`,
  },
  {
    key: "offer_closeout",
    label: "Offer close-out",
    tokens: ["parent", "player"],
    subject: "We hope to see your family next year",
    body: `Hi {parent},

We weren't able to hold {player}'s spot any longer, so we've offered it to the next family on our list.

We hope to see your family next year! If anything changes, just reply and we'll let you know if we have room.

${SIGN}`,
  },
  {
    key: "welcome",
    label: "You're in",
    tokens: ["parent", "player", "season", "checklist", "slack", "meeting", "practice"],
    subject: "You're in! Next steps for {player}",
    body: `Hi {parent},

We're so excited to have {player} with us for the {season} season!

Everything left to do is on your family's checklist:
{checklist}

All season news goes out on Slack, so please join us there:
{slack}

{meeting}
{practice}

Questions? Just reply to this email. Go Lightning!

${SIGN}`,
  },
  {
    key: "open_items",
    label: "Weekly open items",
    tokens: ["parent", "player", "items", "checklist"],
    subject: "A few quick things for {player}",
    body: `Hi {parent},

Just a friendly note. Here's what's still open for {player}:

{items}

Your checklist has the details and links:
{checklist}

If you'd like a payment plan or want to pay by check, just reply. We're happy to help.

${SIGN}`,
  },
  {
    key: "countdown",
    label: "Practice countdown",
    tokens: ["parent", "player", "when", "practice", "meeting", "items", "checklist"],
    subject: "First practice is {when}!",
    body: `Hi {parent},

First practice is {when}! We can't wait to see {player}.

{practice}
{meeting}

Bring clean basketball shoes, a water bottle, and a ball if he has one.

{items}

Your checklist: {checklist}

${SIGN}`,
  },
  {
    key: "team_announce",
    label: "Your team",
    tokens: ["parent", "player", "team", "coach", "practice_times", "checklist"],
    subject: "{player}'s team for this season",
    body: `Hi {parent},

Teams are set! {player} is on {team}.

Coach: {coach}
Practices: {practice_times}

Team news goes out on Slack from here on. Your checklist is here anytime:
{checklist}

Go Lightning!

${SIGN}`,
  },
];

export function emailDef(key: WorkflowEmail): WorkflowEmailDef {
  return WORKFLOW_EMAILS.find((e) => e.key === key)!;
}

// Saved words (olb_onboarding_email_text rows, "welcome.subject" → value)
// over the originals.
export function wordsFor(key: WorkflowEmail, saved: Record<string, string>): { subject: string; body: string } {
  const d = emailDef(key);
  return { subject: saved[`${key}.subject`] ?? d.subject, body: saved[`${key}.body`] ?? d.body };
}

export const SUBJECT_MAX = 200;
export const BODY_MAX = 4000;

export function cleanWords(key: string, value: string): { key: string; value: string | null } | { error: string } {
  const [email, part] = key.split(".");
  const d = WORKFLOW_EMAILS.find((e) => e.key === email);
  if (!d || (part !== "subject" && part !== "body")) return { error: "That isn't one of the workflow's emails." };
  const v = (value ?? "").replace(/\r\n/g, "\n").trim();
  if (!v) return { error: part === "subject" ? "Add a subject." : "Add the email's words." };
  if (part === "subject" && v.length > SUBJECT_MAX) return { error: `Keep the subject under ${SUBJECT_MAX} characters.` };
  if (part === "body" && v.length > BODY_MAX) return { error: `Keep the email under ${BODY_MAX} characters.` };
  // The original again: no saved change needed.
  return { key, value: v === (part === "subject" ? d.subject : d.body) ? null : v };
}

// {tokens} filled in. A token with no value is dropped, and a line left
// empty by it goes too, so "{meeting}" with no meeting set leaves no gap.
export function fill(text: string, values: Record<string, string | null | undefined>): string {
  const lines = text.split("\n").map((line) => {
    const hadToken = /\{[a-z_]+\}/i.test(line);
    const out = line.replace(/\{([a-z_]+)\}/gi, (_, k: string) => values[k.toLowerCase()]?.trim() ?? "");
    return hadToken && !out.trim() ? null : out;
  });
  return lines
    .filter((l): l is string => l !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
