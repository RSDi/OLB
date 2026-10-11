// Server-only. Every automatic email of the registration workflow (0130)
// goes through here, so its switch decides: Off sends nothing and keeps no
// record; Ask me first holds it on the Onboarding tab until someone presses
// Send or Skip; On sends it. Each email has a dedupe key (the kind and who
// it's for, plus the week or date when it repeats), so it never goes twice.

import { sendFamilyEmails } from "../notifications/registration-message";
import { messageHtml } from "../teams/family-mail";
import { modeOf, type AutomationKey, type OnboardingSettings } from "./automations";
import type { Db } from "./server";

export interface DraftEmail {
  to: string[];
  subject: string;
  body: string;
  registrationIds: string[];
}

export type DeliverResult = "off" | "held" | "sent" | "failed" | "already";

export async function deliver(
  db: Db,
  settings: OnboardingSettings,
  kind: AutomationKey,
  dedupeKey: string,
  email: DraftEmail
): Promise<DeliverResult> {
  const mode = modeOf(settings, kind);
  if (mode === "off") return "off";
  const to = [...new Set(email.to.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (to.length === 0) return "off";
  const { data, error } = await db
    .from("olb_onboarding_emails")
    .insert({
      board_id: settings.board_id,
      kind,
      dedupe_key: dedupeKey.slice(0, 300),
      to_emails: to,
      subject: email.subject.slice(0, 300),
      body: email.body.slice(0, 8000),
      registration_ids: email.registrationIds,
      status: mode === "ask" ? "waiting" : "sending",
    })
    .select("id")
    .maybeSingle();
  // A unique-key clash: this one was already held or sent.
  if (error) return error.code === "23505" ? "already" : "failed";
  if (mode === "ask") return "held";
  return send(db, (data as { id: string }).id, { ...email, to }, null);
}

// Sends one stored email and records how it went (and who pressed Send, for
// a held one).
export async function send(db: Db, id: string, email: DraftEmail, userId: string | null): Promise<"sent" | "failed"> {
  const { sent, error } = await sendFamilyEmails([{ to: email.to, subject: email.subject, text: email.body, html: messageHtml(email.body) }]);
  const ok = sent > 0;
  const now = new Date().toISOString();
  await db
    .from("olb_onboarding_emails")
    .update({
      status: ok ? "sent" : "failed",
      sent_at: ok ? now : null,
      error: ok ? null : (error ?? "It didn't go through.").slice(0, 300),
      ...(userId ? { decided_by: userId, decided_at: now } : {}),
    })
    .eq("id", id);
  if (ok && email.registrationIds.length) {
    // A copy on each registration, under Messages sent, like every other
    // email the club sends a family.
    const { error: logError } = await db.from("olb_registration_messages").insert(
      email.registrationIds.map((rid) => ({
        registration_id: rid,
        subject: email.subject.slice(0, 200),
        body: email.body.slice(0, 5000),
        sent_to: email.to,
        sent_by: userId,
        sent_at: now,
      }))
    );
    if (logError) console.warn(`[onboarding] keeping a copy of an email failed: ${logError.message}`);
  }
  return ok ? "sent" : "failed";
}
