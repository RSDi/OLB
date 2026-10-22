// Server-only. The workflow's emails (0130) written for one family: the
// saved words (or the originals) with the family's names, links and dates
// filled in.

import { SEASON_LABEL } from "../teams/registration-form";
import type { OnboardingSettings } from "./automations";
import { itemsText, openItems } from "./checklist";
import { longDay } from "./dates";
import type { DraftEmail } from "./deliver";
import { fill, wordsFor, type WorkflowEmail } from "./email-text";
import { assessmentEmailValues, assessmentEmailWords, type Assessment } from "./assessments";
import type { FamilyView } from "./family-data";
import { checklistUrl } from "./server";

export function familyValues(f: FamilyView, s: OnboardingSettings): Record<string, string> {
  const open = openItems(f.items);
  const player = f.players[0];
  return {
    parent: f.greeting,
    player: f.playerNames,
    season: SEASON_LABEL,
    checklist: checklistUrl(f.token),
    slack: s.slack_invite_url ?? "",
    meeting: s.parent_meeting || s.parent_meeting_on ? `Parent meeting: ${[s.parent_meeting_on && longDay(s.parent_meeting_on), s.parent_meeting].filter(Boolean).join(", ")}` : "",
    practice: s.first_practice_on ? `First practice: ${longDay(s.first_practice_on)}` : "",
    items: open.length ? itemsText(open) : "",
    team: [...new Set(f.players.map((p) => p.team).filter(Boolean))].join(" and "),
    coach: [...new Set(f.players.flatMap((p) => p.coaches))].join(", "),
    practice_times: player ? [...player.practiceTimes, player.practiceLocation].filter(Boolean).join(" · ") : "",
  };
}

export function compose(
  key: WorkflowEmail,
  f: FamilyView,
  s: OnboardingSettings,
  saved: Record<string, string>,
  more: Record<string, string> = {},
  regIds?: string[]
): DraftEmail {
  const words = wordsFor(key, saved);
  const values = { ...familyValues(f, s), ...more };
  return {
    to: f.emails,
    subject: fill(words.subject, values).replace(/\n/g, " "),
    body: fill(words.body, values),
    registrationIds: regIds ?? f.registrations.filter((r) => r.status !== "rejected").map((r) => r.id),
  };
}

// For one waitlisted registration, before there's a family: the waitlist
// reply, the clinic invite and the offer emails.
export function composeForRegistration(
  key: WorkflowEmail,
  reg: { id: string; first_name: string; parent_name: string | null; parent_email: string | null; extra: { father?: { email?: string }; mother?: { email?: string } } | null },
  saved: Record<string, string>,
  more: Record<string, string> = {}
): DraftEmail {
  const words = wordsFor(key, saved);
  const values = { parent: reg.parent_name?.trim().split(/\s+/)[0] || "there", player: reg.first_name.trim(), season: SEASON_LABEL, ...more };
  const to = [reg.parent_email, reg.extra?.father?.email, reg.extra?.mother?.email].map((e) => (e ?? "").trim().toLowerCase()).filter((e) => e.includes("@"));
  return {
    to: [...new Set(to)],
    subject: fill(words.subject, values).replace(/\n/g, " "),
    body: fill(words.body, values),
    registrationIds: [reg.id],
  };
}

export function composeAssessmentEmail(
  key: "assessment_thanks" | "assessment_reminder",
  reg: { id: string; first_name: string; parent_name: string | null; parent_email: string | null; extra: { father?: { email?: string }; mother?: { email?: string } } | null },
  assessment: Assessment,
  saved: Record<string, string>,
): DraftEmail {
  const base = wordsFor(key, saved);
  const over = assessmentEmailWords(key, assessment, {});
  return composeForRegistration(
    key,
    reg,
    { [`${key}.subject`]: over.subject || base.subject, [`${key}.body`]: over.body || base.body },
    assessmentEmailValues(assessment),
  );
}
