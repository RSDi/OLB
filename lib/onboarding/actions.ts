"use server";

// The registration workflow's portal actions (0130), for whoever holds the
// Registrations permission: its settings and switches, the words of its
// emails, the emails held for Send, spot offers, coach notes on the waitlist
// and Announce teams. Each checks the permission first; the writes run with
// the service role.

import { revalidatePath } from "next/cache";
import { requireRegistrations } from "../auth/guards";
import { createAdminClient } from "../supabase/admin";
import { createClient } from "../supabase/server";
import { cleanSettings, modeOf, type OnboardingSettings } from "./automations";
import { cleanWords } from "./email-text";
import { compose, composeForRegistration } from "./compose";
import { deliver, send } from "./deliver";
import { loadFamilies } from "./family-data";
import { expiryWords } from "./offers";
import { loadSettings, loadWords, newToken, offerUrl, seasonBoardId } from "./server";
import { SEASON_LABEL } from "../teams/registration-form";
import { sendFamilyEmails } from "../notifications/registration-message";
import { messageHtml } from "../teams/family-mail";

type Result = { error?: string; notice?: string };

function refresh() {
  revalidatePath("/portal/directory", "layout");
  revalidatePath("/portal/settings");
}

async function board(): Promise<{ db: ReturnType<typeof createAdminClient>; boardId: string } | { error: string }> {
  const db = createAdminClient();
  const boardId = await seasonBoardId(db);
  if (!boardId) return { error: "This season's board isn't set up yet." };
  return { db, boardId };
}

// ─── Settings ───────────────────────────────────────────────────────────────

export async function saveOnboardingSettings(input: Partial<OnboardingSettings>): Promise<Result> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  const c = cleanSettings(input);
  if ("error" in c) return { error: c.error };
  const b = await board();
  if ("error" in b) return b;
  const { error } = await b.db
    .from("olb_onboarding_settings")
    .upsert({ board_id: b.boardId, ...c, updated_by: gate.userId, updated_at: new Date().toISOString() });
  if (error) return { error: error.message };
  refresh();
  return {};
}

export async function saveWorkflowWords(key: string, value: string): Promise<Result> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  const c = cleanWords(key, value);
  if ("error" in c) return { error: c.error };
  const db = await createClient();
  const { error } =
    c.value === null
      ? await db.from("olb_onboarding_email_text").delete().eq("key", key)
      : await db.from("olb_onboarding_email_text").upsert({ key, value: c.value, updated_by: gate.userId, updated_at: new Date().toISOString() });
  if (error) return { error: error.message };
  refresh();
  return {};
}

export async function resetWorkflowWords(key: string): Promise<Result> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  const db = await createClient();
  const { error } = await db.from("olb_onboarding_email_text").delete().eq("key", key);
  if (error) return { error: error.message };
  refresh();
  return {};
}

// ─── Emails held for Send ───────────────────────────────────────────────────

interface StoredEmail {
  id: string;
  status: string;
  to_emails: string[];
  subject: string;
  body: string;
  registration_ids: string[];
}

// Sends one held email (or tries a failed one again), with any edits made
// to its words first.
export async function sendHeldEmail(id: string, edits?: { subject: string; body: string }): Promise<Result> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  const db = createAdminClient();
  const { data } = await db.from("olb_onboarding_emails").select("id, status, to_emails, subject, body, registration_ids").eq("id", id).maybeSingle();
  const e = data as StoredEmail | null;
  if (!e || (e.status !== "waiting" && e.status !== "failed")) return { error: "That email was already sent or skipped. Refresh the page." };
  const subject = (edits?.subject ?? e.subject).trim().slice(0, 300);
  const body = (edits?.body ?? e.body).trim().slice(0, 8000);
  if (!subject || !body) return { error: "Add a subject and the email's words." };
  // Claim it, so two people pressing Send at once send it once.
  const { data: claimed } = await db.from("olb_onboarding_emails").update({ status: "sending", subject, body }).eq("id", id).eq("status", e.status).select("id");
  if (!claimed?.length) return { error: "Someone else just handled that email. Refresh the page." };
  const res = await send(db, id, { to: e.to_emails, subject, body, registrationIds: e.registration_ids }, gate.userId);
  refresh();
  return res === "sent" ? { notice: "Sent." } : { error: "The email didn't go through. Try again in a minute." };
}

export async function skipHeldEmail(id: string): Promise<Result> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  const db = createAdminClient();
  const { data } = await db
    .from("olb_onboarding_emails")
    .update({ status: "skipped", decided_by: gate.userId, decided_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["waiting", "failed"])
    .select("id");
  if (!data?.length) return { error: "That email was already sent or skipped. Refresh the page." };
  refresh();
  return {};
}

// ─── Spot offers ────────────────────────────────────────────────────────────

// The offer email as it would go to this waitlisted family, to look over
// before sending.
export async function draftOffer(registrationId: string): Promise<{ to?: string[]; subject?: string; body?: string; expires?: string; error?: string }> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  const b = await board();
  if ("error" in b) return b;
  const settings = await loadSettings(b.db, b.boardId);
  if (!settings.enabled) return { error: "Turn on the registration workflow in Settings → Registration automations first." };
  const reg = await waitlisted(b.db, registrationId);
  if (!reg) return { error: "That family isn't on the waitlist any more. Refresh the page." };
  const expiresAt = new Date(Date.now() + settings.offer_days * 86_400_000).toISOString();
  const email = composeForRegistration("offer", reg, await loadWords(b.db), { link: "{link}", expires: expiryWords(expiresAt) });
  return { to: email.to, subject: email.subject, body: email.body, expires: expiryWords(expiresAt) };
}

// Offer a spot: a private registration link, good for the season's offer
// days, sent now. A person presses this, so it sends whatever the
// automatic emails' switches say; the check-in and close-out that follow
// are automatic and follow theirs.
export async function offerSpot(registrationId: string, subject: string, body: string): Promise<Result> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  const b = await board();
  if ("error" in b) return b;
  const settings = await loadSettings(b.db, b.boardId);
  if (!settings.enabled) return { error: "Turn on the registration workflow in Settings → Registration automations first." };
  const reg = await waitlisted(b.db, registrationId);
  if (!reg) return { error: "That family isn't on the waitlist any more. Refresh the page." };
  if (!body.includes("{link}")) return { error: "Keep {link} in the email: it becomes the family's registration link." };
  const to = composeForRegistration("offer", reg, {}).to;
  if (to.length === 0) return { error: "There's no email on this registration to send the offer to." };

  // One open offer at a time: a new one replaces any still open.
  await b.db.from("olb_onboarding_offers").update({ status: "withdrawn", closed_at: new Date().toISOString() }).eq("registration_id", registrationId).eq("status", "open");
  const token = newToken();
  const expiresAt = new Date(Date.now() + settings.offer_days * 86_400_000).toISOString();
  const { data: offer, error } = await b.db
    .from("olb_onboarding_offers")
    .insert({ board_id: b.boardId, registration_id: registrationId, token, sent_to: to, expires_at: expiresAt, created_by: gate.userId })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const filled = { subject: subject.trim().slice(0, 300), body: body.replace(/\{link\}/g, offerUrl(token)).trim().slice(0, 8000) };
  const { sent, error: sendError } = await sendFamilyEmails([{ to, subject: filled.subject, text: filled.body, html: messageHtml(filled.body) }]);
  if (!sent) {
    await b.db.from("olb_onboarding_offers").delete().eq("id", (offer as { id: string }).id);
    return { error: sendError ?? "The email didn't go through. Try again in a minute." };
  }
  const now = new Date().toISOString();
  await b.db.from("olb_registration_messages").insert({ registration_id: registrationId, subject: filled.subject, body: filled.body.slice(0, 5000), sent_to: to, sent_by: gate.userId, sent_at: now });
  await b.db.from("olb_registrations").update({ contacted_at: now, contacted_by: gate.userId }).eq("id", registrationId).is("contacted_at", null);
  refresh();
  return { notice: `Offer sent. The link is good until ${expiryWords(expiresAt)}.` };
}

export async function withdrawOffer(offerId: string): Promise<Result> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  const db = createAdminClient();
  const { data } = await db.from("olb_onboarding_offers").update({ status: "withdrawn", closed_at: new Date().toISOString() }).eq("id", offerId).eq("status", "open").select("id");
  if (!data?.length) return { error: "That offer isn't open any more. Refresh the page." };
  refresh();
  return {};
}

// More days on an open offer (or one that just ran out, back open).
export async function extendOffer(offerId: string, days: number): Promise<Result> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  if (!Number.isInteger(days) || days < 1 || days > 30) return { error: "Pick 1 to 30 days." };
  const db = createAdminClient();
  const { data: o } = await db.from("olb_onboarding_offers").select("status, expires_at, reg:olb_registrations(status)").eq("id", offerId).maybeSingle();
  const offer = o as unknown as { status: string; expires_at: string; reg: { status: string } | null } | null;
  if (!offer || offer.reg?.status !== "waitlisted" || (offer.status !== "open" && offer.status !== "expired")) return { error: "That offer can't be extended. Refresh the page." };
  const from = Math.max(Date.now(), new Date(offer.expires_at).getTime());
  const expiresAt = new Date(from + days * 86_400_000).toISOString();
  const { error } = await db.from("olb_onboarding_offers").update({ status: "open", expires_at: expiresAt, closed_at: null, reminded_at: null }).eq("id", offerId);
  if (error) return { error: error.message };
  refresh();
  return { notice: `The link now works until ${expiryWords(expiresAt)}.` };
}

async function waitlisted(db: ReturnType<typeof createAdminClient>, id: string) {
  const { data } = await db.from("olb_registrations").select("id, first_name, parent_name, parent_email, status, extra").eq("id", id).maybeSingle();
  const reg = data as { id: string; first_name: string; parent_name: string | null; parent_email: string | null; status: string; extra: { father?: { email?: string }; mother?: { email?: string } } | null } | null;
  return reg?.status === "waitlisted" ? reg : null;
}

// ─── Coach notes on the waitlist ────────────────────────────────────────────

export async function setWaitlistMark(registrationId: string, mark: { clinicSeen?: boolean; coachOk?: boolean }): Promise<Result> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  const db = createAdminClient();
  const patch: Record<string, unknown> = { registration_id: registrationId };
  if (mark.clinicSeen !== undefined) patch.clinic_seen_on = mark.clinicSeen ? new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }) : null;
  if (mark.coachOk !== undefined) {
    patch.coach_ok_at = mark.coachOk ? new Date().toISOString() : null;
    patch.coach_ok_by = mark.coachOk ? gate.userId : null;
  }
  const { error } = await db.from("olb_onboarding_waitlist").upsert(patch);
  if (error) return { error: error.message };
  refresh();
  return {};
}

// ─── Announce teams ─────────────────────────────────────────────────────────

// Each family whose players are all on a team gets "Your team" (if its
// switch is on, or held for Send under Ask me first). A family is told once
// per team; moving a player to another team tells them again.
export async function announceTeams(): Promise<Result> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  const b = await board();
  if ("error" in b) return b;
  const settings = await loadSettings(b.db, b.boardId);
  const mode = modeOf(settings, "team_announce");
  if (mode === "off") return { error: "Your team is turned off. Turn it on (or to Ask me first) in Settings → Registration automations." };
  const [families, words] = await Promise.all([loadFamilies(b.db, settings), loadWords(b.db)]);
  let sent = 0;
  let held = 0;
  let waiting = 0;
  for (const f of families) {
    const live = f.registrations.filter((r) => r.status === "approved");
    if (live.length === 0) continue;
    if (f.players.length < live.length || f.players.some((p) => !p.teamId)) {
      waiting++;
      continue;
    }
    const teams = f.players.map((p) => p.teamId).sort().join(",");
    const r = await deliver(b.db, settings, "team_announce", `team:${f.id}:${teams}`, compose("team_announce", f, settings, words));
    if (r === "sent") sent++;
    if (r === "held") held++;
  }
  refresh();
  const parts = [sent && `${sent} sent`, held && `${held} waiting for you on the Onboarding tab`, waiting && `${waiting} families not on a team yet`].filter(Boolean);
  return { notice: parts.length ? `Announce teams: ${parts.join(", ")}.` : "Every family on a team already heard about it." };
}

// ─── Loading the settings tab ───────────────────────────────────────────────

export interface AutomationsTab {
  settings: OnboardingSettings;
  words: Record<string, string>;
  // Per email, over the last 30 days.
  counts: Record<string, { sent: number; waiting: number }>;
  season: string;
}

export async function loadAutomationsTab(): Promise<AutomationsTab | { error: string }> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  const b = await board();
  if ("error" in b) return b;
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [settings, words, { data: emails }, { data: waiting }] = await Promise.all([
    loadSettings(b.db, b.boardId),
    loadWords(b.db),
    b.db.from("olb_onboarding_emails").select("kind, status").eq("board_id", b.boardId).eq("status", "sent").gte("created_at", since),
    b.db.from("olb_onboarding_emails").select("kind, status").eq("board_id", b.boardId).eq("status", "waiting"),
  ]);
  const counts: AutomationsTab["counts"] = {};
  for (const e of [...((emails as { kind: string; status: string }[] | null) ?? []), ...((waiting as { kind: string; status: string }[] | null) ?? [])]) {
    const c = (counts[e.kind] ??= { sent: 0, waiting: 0 });
    if (e.status === "sent") c.sent++;
    else c.waiting++;
  }
  return { settings, words, counts, season: SEASON_LABEL };
}
