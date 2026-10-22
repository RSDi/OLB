// Server-only. The registration workflow's daily run (0130), from
// /api/cron/onboarding. Does nothing for a season whose workflow is off; a
// paused one still checks Slack and offers but sends no email. Each email
// goes through deliver(), so its switch decides, and its dedupe key keeps
// it to once.
//
//   offers          a check-in two days before the link runs out; at the
//                   end, the spot goes back and the family gets a close-out
//   clinic invite   waitlisted families, once clinic details are set
//   open items      Mondays, to approved families with something to do
//   countdown       10 days and 1 day before the first practice
//   Slack           who has joined, by parent email (bot token)
//   assessment      a reminder two days before an open assessment, only
//                   at 9 AM America/Chicago (same hour as the rest)
//   reminders       a push to the Registrations permission: the Slack link
//                   running out, families nobody has answered, and on
//                   Mondays a summary of what's open

import { createAdminClient } from "../supabase/admin";
import { sendPushToPermission } from "../notifications/push";
import { modeOf, type OnboardingSettings } from "./automations";
import { compose, composeAssessmentEmail, composeForRegistration } from "./compose";
import { addDays, centralDay, centralHour, daysBetween, longDay, weekOf, weekday } from "./dates";
import { deliver } from "./deliver";
import { loadFamilies } from "./family-data";
import { openItems } from "./checklist";
import { expiryWords } from "./offers";
import { loadAssessments } from "./assessment-data";
import { loadSettings, loadWords, offerUrl, type Db } from "./server";

export interface DailySummary {
  boards: number;
  offersReminded: number;
  offersClosed: number;
  clinicInvites: number;
  openItems: number;
  countdown: number;
  slackChecked: number;
  assessmentReminders: number;
}

export async function runDaily(now: Date = new Date()): Promise<DailySummary> {
  const summary: DailySummary = { boards: 0, offersReminded: 0, offersClosed: 0, clinicInvites: 0, openItems: 0, countdown: 0, slackChecked: 0, assessmentReminders: 0 };
  // Two UTC crons (14:17 and 15:17) so 9 AM CT lands year-round. The other
  // fire would otherwise run checkSlack and the daily pushes twice.
  if (centralHour(now) !== 9) return summary;
  const db = createAdminClient();
  const { data: rows } = await db.from("olb_onboarding_settings").select("board_id").eq("enabled", true);
  for (const { board_id } of (rows as { board_id: string }[] | null) ?? []) {
    const settings = await loadSettings(db, board_id);
    if (!settings.enabled) continue;
    summary.boards++;
    const today = centralDay(now);
    const words = await loadWords(db);
    await offers(db, settings, words, now, summary);
    await clinicInvites(db, settings, words, summary);
    summary.slackChecked += await checkSlack(db, settings);
    const families = await loadFamilies(db, settings);

    if (weekday(today) === 1) {
      for (const f of families) {
        if (!f.registrations.some((r) => r.status === "approved")) continue;
        if (openItems(f.items).length === 0) continue;
        const r = await deliver(db, settings, "open_items", `open:${f.id}:${weekOf(today)}`, compose("open_items", f, settings, words));
        if (r === "sent" || r === "held") summary.openItems++;
      }
    }

    if (settings.first_practice_on) {
      const until = daysBetween(today, settings.first_practice_on);
      if (until === 10 || until === 1) {
        const when = until === 1 ? "tomorrow" : longDay(settings.first_practice_on);
        for (const f of families) {
          if (!f.registrations.some((r) => r.status === "approved")) continue;
          const r = await deliver(db, settings, "countdown", `countdown:${until}:${f.id}`, compose("countdown", f, settings, words, { when }));
          if (r === "sent" || r === "held") summary.countdown++;
        }
      }
    }

    await assessmentReminders(db, settings, words, today, summary);
    await reminders(db, settings, families, today);
  }
  return summary;
}

// Offer check-ins and close-outs. A close-out also tells the Registrations
// permission, so the spot goes to the next family.
async function offers(db: Db, settings: OnboardingSettings, words: Record<string, string>, now: Date, summary: DailySummary) {
  const { data } = await db
    .from("olb_onboarding_offers")
    .select("id, token, expires_at, reminded_at, reg:olb_registrations(id, first_name, parent_name, parent_email, status, extra)")
    .eq("board_id", settings.board_id)
    .eq("status", "open");
  type Row = {
    id: string;
    token: string;
    expires_at: string;
    reminded_at: string | null;
    reg: { id: string; first_name: string; parent_name: string | null; parent_email: string | null; status: string; extra: { father?: { email?: string }; mother?: { email?: string } } | null } | null;
  };
  for (const o of (data as unknown as Row[] | null) ?? []) {
    if (!o.reg || o.reg.status !== "waitlisted") {
      await db.from("olb_onboarding_offers").update({ status: o.reg ? "used" : "withdrawn", closed_at: now.toISOString() }).eq("id", o.id);
      continue;
    }
    const left = new Date(o.expires_at).getTime() - now.getTime();
    if (left <= 0) {
      await db.from("olb_onboarding_offers").update({ status: "expired", closed_at: now.toISOString() }).eq("id", o.id);
      await deliver(db, settings, "offer_closeout", `closeout:${o.id}`, composeForRegistration("offer_closeout", o.reg, words));
      await sendPushToPermission("registrations", {
        title: `${o.reg.first_name}'s offer ran out`,
        body: "The spot is open again. Offer it to the next family on the waitlist.",
        url: "/portal/directory/registrations?tab=waitlist",
        tag: `offer-${o.id}`,
      });
      summary.offersClosed++;
    } else if (!o.reminded_at && left <= 2 * 86_400_000 + 3_600_000) {
      const r = await deliver(
        db,
        settings,
        "offer_reminder",
        `reminder:${o.id}`,
        composeForRegistration("offer_reminder", o.reg, words, { link: offerUrl(o.token), expires: expiryWords(o.expires_at) })
      );
      if (r !== "off") await db.from("olb_onboarding_offers").update({ reminded_at: now.toISOString() }).eq("id", o.id);
      if (r === "sent" || r === "held") summary.offersReminded++;
    }
  }
}

// Assessment reminder: waitlisted sign-ups, two calendar days before an
// open assessment. Only reached when runDaily already saw 9 AM Chicago.
async function assessmentReminders(
  db: Db,
  settings: OnboardingSettings,
  words: Record<string, string>,
  today: string,
  summary: DailySummary,
) {
  if (modeOf(settings, "assessment_reminder") === "off") return;
  const loaded = await loadAssessments();
  if (!loaded.fromTable) return;
  const due = loaded.assessments.filter((a) => !a.id.startsWith("builtin-") && a.open && a.starts_at && daysBetween(today, centralDay(new Date(a.starts_at))) === 2);
  if (!due.length) return;
  const { data } = await db
    .from("olb_registrations")
    .select("id, first_name, parent_name, parent_email, extra")
    .eq("board_id", settings.board_id)
    .eq("status", "waitlisted");
  type Row = { id: string; first_name: string; parent_name: string | null; parent_email: string | null; extra: { assessment_id?: string; assessment_slug?: string; father?: { email?: string }; mother?: { email?: string } } | null };
  for (const a of due) {
    for (const reg of (data as Row[] | null) ?? []) {
      const extra = reg.extra;
      if (extra?.assessment_id !== a.id && extra?.assessment_slug !== a.slug) continue;
      const r = await deliver(db, settings, "assessment_reminder", `assessment_reminder:${a.id}:${reg.id}`, composeAssessmentEmail("assessment_reminder", reg, a, words));
      if (r === "sent" || r === "held") summary.assessmentReminders++;
    }
  }
}

// The free clinic invite, once per waitlisted family, when there are
// clinic details to share.
async function clinicInvites(db: Db, settings: OnboardingSettings, words: Record<string, string>, summary: DailySummary) {
  if (!settings.clinic_info || modeOf(settings, "clinic_invite") === "off") return;
  const { data } = await db
    .from("olb_registrations")
    .select("id, first_name, parent_name, parent_email, extra")
    .eq("board_id", settings.board_id)
    .eq("status", "waitlisted");
  for (const reg of (data as { id: string; first_name: string; parent_name: string | null; parent_email: string | null; extra: { father?: { email?: string }; mother?: { email?: string } } | null }[] | null) ?? []) {
    const r = await deliver(db, settings, "clinic_invite", `clinic:${reg.id}`, composeForRegistration("clinic_invite", reg, words, { clinic: settings.clinic_info }));
    if (r === "sent" || r === "held") summary.clinicInvites++;
  }
}

// Who has joined Slack, for each family's parents, with the bot token
// (users:read.email). Asks again each day until they've joined.
export async function checkSlack(db: Db, settings: OnboardingSettings): Promise<number> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return 0;
  const families = await loadFamilies(db, settings);
  const emails = [...new Set(families.filter((f) => f.registrations.some((r) => r.status === "approved")).flatMap((f) => f.emails))];
  if (emails.length === 0) return 0;
  const { data: known } = await db.from("olb_onboarding_slack").select("email, joined").in("email", emails);
  const joined = new Set(((known as { email: string; joined: boolean }[] | null) ?? []).filter((k) => k.joined).map((k) => k.email));
  let checked = 0;
  for (const email of emails) {
    if (joined.has(email)) continue;
    const res = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
    const body = res ? ((await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; user?: { id?: string; deleted?: boolean } }) : {};
    if (!res?.ok || (body.ok === false && body.error !== "users_not_found")) {
      console.warn(`[onboarding] Slack lookup stopped: ${body.error ?? res?.status ?? "network error"}`);
      break;
    }
    const isIn = body.ok === true && !!body.user?.id && !body.user.deleted;
    await db.from("olb_onboarding_slack").upsert({ email, slack_user_id: isIn ? body.user!.id : null, joined: isIn, checked_at: new Date().toISOString() });
    checked++;
  }
  return checked;
}

async function reminders(db: Db, settings: OnboardingSettings, families: Awaited<ReturnType<typeof loadFamilies>>, today: string) {
  // The Slack link, a week before it runs out (and the day it does).
  if (settings.slack_invite_url && settings.slack_invite_expires_on) {
    const left = daysBetween(today, settings.slack_invite_expires_on);
    if (left === 7 || left === 0) {
      await sendPushToPermission("registrations", {
        title: left === 0 ? "The Slack invite link runs out today" : "The Slack invite link runs out in a week",
        body: "Make a new invite link in Slack and paste it in Settings → Registration automations.",
        url: "/portal/settings?tab=registration_automations",
        tag: "slack-link",
      });
    }
  }

  // Families from the waitlist form nobody has answered in three days.
  const { data: quiet } = await db
    .from("olb_registrations")
    .select("id, first_name, created_at, contacted_at, extra")
    .eq("board_id", settings.board_id)
    .eq("status", "waitlisted")
    .is("contacted_at", null)
    .lte("created_at", new Date(Date.parse(`${addDays(today, -3)}T12:00:00Z`)).toISOString());
  const unanswered = ((quiet as { extra: { source?: string } | null }[] | null) ?? []).filter((r) => r.extra?.source === "waitlist_form");
  if (unanswered.length) {
    await sendPushToPermission("registrations", {
      title: unanswered.length === 1 ? "A waitlist family hasn't heard from us" : `${unanswered.length} waitlist families haven't heard from us`,
      body: "They joined three or more days ago. Send a message or mark them contacted.",
      url: "/portal/directory/registrations?tab=waitlist",
      tag: "waitlist-quiet",
    });
  }

  // Mondays: what's open across the families, in one line.
  if (weekday(today) === 1) {
    const approved = families.filter((f) => f.registrations.some((r) => r.status === "approved"));
    const count = (key: string) => approved.filter((f) => openItems(f.items).some((i) => i.key === key)).length;
    const parts = [
      [count("fee"), "owe fees"],
      [count("handbook"), "haven't signed the handbook"],
      [count("slack"), "aren't on Slack"],
      [count("sizes"), "are missing uniform sizes"],
    ]
      .filter(([n]) => (n as number) > 0)
      .map(([n, what]) => `${n} ${what}`);
    if (parts.length) {
      await sendPushToPermission("registrations", {
        title: "This week's open items",
        body: `Families: ${parts.join(", ")}.`,
        url: "/portal/directory/registrations?tab=onboarding",
        tag: "onboarding-weekly",
      });
    }
  }
}
