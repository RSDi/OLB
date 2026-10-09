"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import { requireRegistrations } from "../auth/guards";
import { applyRegistration, cleanName, type RegistrationRecord } from "./apply-registration";
import type { RegistrationExtra as Extra, RegistrationParentAnswers } from "./roster-logic";
import { MAX_PLAYERS, REGISTRATION_SEASON, looksLikeEmail, type FamilyPrefill, type RegistrationInput } from "./registration-form";
import { CODE_MINUTES, CODES_PER_HOUR, VERIFIED_HOURS, checkCode, hashCode, newCode, type CodeRow } from "./registration-codes";
import { findFamily } from "./registration-prefill";
import { sendRegistrationCode } from "../notifications/registration-code";
import { sendFamilyEmails } from "../notifications/registration-message";
import { sendRegistrationEmails } from "../notifications/registration-receipt";
import { ALL_RECIPIENTS, fillMessage, groupFamilies, messageHtml, type Recipient, type WaitlistRegistration } from "./waitlist";
import { registrationFeeCents, registrationTier } from "../finances/logic";
import { centralToday } from "../finances/data";

// ─── The public form ────────────────────────────────────────────────────────
//
// PUBLIC — no auth. The honeypot, validation and the code limits guard the
// open endpoints. Everything writes with the service role: the olb_ tables
// have no anon policies, so visitors only reach them through these actions.

// Step one: email a code to check the address (0103). The answer is the same
// whether or not the email is on file, so the form can't be used to find
// out who's registered. `sent: false` means we couldn't email it; the form
// then carries on without filling anything in.
export async function startRegistrationEmail(
  rawEmail: string,
  honeypot: string,
): Promise<{ sent: boolean; error?: string }> {
  if (honeypot && honeypot.trim()) return { sent: true }; // bot
  const email = rawEmail.trim().toLowerCase();
  if (!looksLikeEmail(email)) return { sent: false, error: "That email doesn't look right. Check it for typos." };

  const db = createAdminClient();
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db
    .from("olb_registration_codes")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", hourAgo);
  if ((count ?? 0) >= CODES_PER_HOUR) {
    return { sent: false, error: "We've sent a few codes to that email already. Check your inbox, or try again in an hour." };
  }

  const id = crypto.randomUUID();
  const code = newCode();
  const { error } = await db.from("olb_registration_codes").insert({
    id,
    email,
    code_hash: hashCode(id, code),
    expires_at: new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(),
  });
  if (error) {
    console.error(`[registrations] saving a registration code failed: ${error.message}`);
    return { sent: false };
  }
  const sent = await sendRegistrationCode({ to: email, code });
  if (!sent) await db.from("olb_registration_codes").delete().eq("id", id);
  // Codes older than a day are no use to anyone.
  await db.from("olb_registration_codes").delete().lt("created_at", new Date(Date.now() - 86_400_000).toISOString());
  return { sent };
}

// Step two: the code typed back. On a match, what we already know about the
// family (null for a new family).
export async function verifyRegistrationEmail(
  rawEmail: string,
  typed: string,
): Promise<{ ok: true; family: FamilyPrefill | null } | { ok: false; error: string }> {
  const email = rawEmail.trim().toLowerCase();
  const db = createAdminClient();
  const { data } = await db
    .from("olb_registration_codes")
    .select("id, code_hash, attempts, expires_at, verified_at")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as CodeRow | null;
  const result = checkCode(row, typed);
  if (result === "expired") return { ok: false, error: "That code has expired. Tap Send a new code." };
  if (result === "locked") return { ok: false, error: "Too many tries with that code. Tap Send a new code." };
  // Every try uses up one of the code's attempts before it counts, and only
  // one try can claim each attempt, so a burst of guesses at once still gets
  // just five.
  const { data: claimed } = await db
    .from("olb_registration_codes")
    .update({ attempts: row!.attempts + 1 })
    .eq("id", row!.id)
    .eq("attempts", row!.attempts)
    .is("verified_at", null)
    .select("id");
  if (!claimed?.length) return { ok: false, error: "That didn't go through. Try the code again." };
  if (result === "wrong") return { ok: false, error: "That code doesn't match. Check the email we sent and try again." };
  await db.from("olb_registration_codes").update({ verified_at: new Date().toISOString() }).eq("id", row!.id);
  const family = await findFamily(db, email);
  return { ok: true, family };
}

// Step three: one registration per player, saved together. The full
// submission goes in olb_registrations.extra (jsonb); the core columns feed
// the Directory's New registrations page and Approve. `verifiedEmail` marks
// the rows "email confirmed" when its code was typed back in the last few
// hours.
export async function createRegistrations(
  inputs: RegistrationInput[],
  honeypot: string,
  verifiedEmail: string | null,
): Promise<string | null> {
  if (honeypot && honeypot.trim()) return null; // bot
  if (!Array.isArray(inputs) || inputs.length === 0) return "Add a player to register.";
  if (inputs.length > MAX_PLAYERS) return `Please register up to ${MAX_PLAYERS} players at a time.`;
  for (const input of inputs) {
    const problem = inputProblem(input);
    if (problem) return inputs.length > 1 && input.athlete_first?.trim() ? `${input.athlete_first.trim()}: ${problem}` : problem;
  }

  const db = createAdminClient();
  const { data: board } = await db.from("olb_boards").select("id").eq("season", REGISTRATION_SEASON).maybeSingle();
  if (!board) return "Registration isn't open yet — please check back soon.";

  let confirmed: string | null = null;
  const checked = verifiedEmail?.trim().toLowerCase();
  if (checked) {
    const { data: code } = await db
      .from("olb_registration_codes")
      .select("id")
      .eq("email", checked)
      .gte("verified_at", new Date(Date.now() - VERIFIED_HOURS * 3600_000).toISOString())
      .limit(1)
      .maybeSingle();
    if (code) confirmed = checked;
  }

  // Marked confirmed only where that email is one of the registration's own.
  const onIt = (input: RegistrationInput) =>
    confirmed && [input.father_email, input.mother_email, input.athlete_email].some((e) => e?.trim().toLowerCase() === confirmed)
      ? confirmed
      : null;
  const { data: saved, error } = await db
    .from("olb_registrations")
    .insert(inputs.map((input) => toRow(board.id, input, onIt(input))))
    .select("id");
  if (error) return "Something went wrong saving your registration. Please try again.";
  // The receipt to whoever filled the form in, and a notice to the club.
  // Best effort: the registration is saved either way. A copy of the receipt
  // is kept on each registration, under Messages sent (sent_by empty: the
  // website sent it), and shows on the player's page once approved.
  const sent = await sendRegistrationEmails(inputs, confirmed).catch((e) => {
    console.error("[notify] registration emails failed", e);
    return null;
  });
  const ids = ((saved as { id: string }[] | null) ?? []).map((r) => r.id);
  if (sent && ids.length) {
    const now = new Date().toISOString();
    const { error: logError } = await db.from("olb_registration_messages").insert(
      ids.map((id) => ({ registration_id: id, subject: sent.subject.slice(0, 200), body: sent.text.slice(0, 5000), sent_to: [sent.to], sent_by: null, sent_at: now }))
    );
    if (logError) console.warn(`[registrations] keeping a copy of the receipt failed: ${logError.message}`);
  }
  return null;
}

function inputProblem(input: RegistrationInput): string | null {
  if (!input.athlete_first?.trim() || !input.athlete_last?.trim()) return "Athlete first and last name are required.";
  if (!input.waiver_agreed) return "Please check the box agreeing to the Accident Waiver.";
  // The form signs by drawing (the default) or by typing a name.
  const signed =
    input.signature_mode === "draw"
      ? /^data:image\/png;base64,/.test(input.signature_image ?? "")
      : !!input.signature_name?.trim();
  if (!signed) return "Please sign the Accident Waiver — draw your signature or type your full name.";
  if (!input.fee_tier) return "Please select a registration fee.";
  if (!input.payment_option) return "Please choose a payment option.";
  return null;
}

function toRow(boardId: string, input: RegistrationInput, confirmedEmail: string | null) {
  const fatherName = [input.father_first, input.father_last].map((s) => s?.trim()).filter(Boolean).join(" ");
  const motherName = [input.mother_first, input.mother_last].map((s) => s?.trim()).filter(Boolean).join(" ");
  const naless = (s: string) => (s && s.trim().toUpperCase() !== "N/A" ? s.trim() : "");
  return {
    board_id: boardId,
    first_name: input.athlete_first.trim(),
    last_name: input.athlete_last.trim(),
    dob: input.athlete_dob || null,
    parent_name: naless(fatherName) || naless(motherName) || null,
    parent_email: naless(input.father_email) || naless(input.mother_email) || null,
    parent_phone: naless(input.father_phone) || naless(input.mother_phone) || null,
    status: "pending",
    extra: {
      first_season: input.first_season,
      address: { line1: input.address_line1, line2: input.address_line2, city: input.city, state: input.state, zip: input.zip },
      athlete_phone: input.athlete_phone || null,
      athlete_email: input.athlete_email || null,
      homeschool_affirm: input.homeschool_affirm,
      directory_optin: input.directory_optin,
      needs_uniform: input.needs_uniform,
      needs_grays: input.needs_grays,
      father: { first: input.father_first, last: input.father_last, email: input.father_email, phone: input.father_phone, volunteer: input.father_volunteer, volunteer_other: input.father_volunteer_other },
      mother: { first: input.mother_first, last: input.mother_last, email: input.mother_email, phone: input.mother_phone, volunteer: input.mother_volunteer, volunteer_other: input.mother_volunteer_other },
      waiver_agreed: input.waiver_agreed,
      printed_name: input.printed_name?.trim() || null,
      signature_mode: input.signature_mode,
      signature_name: input.signature_name.trim(),
      signature_image: input.signature_mode === "draw" ? input.signature_image || null : null,
      signature_date: input.signature_date || null,
      fee_tier: input.fee_tier,
      donation_interest: input.donation_interest,
      payment_option: input.payment_option,
      email_confirmed: confirmedEmail,
    },
  };
}

// The public form's answers (olb_registrations.extra) as a registration to
// apply to the board.
function toRecord(reg: { first_name: string; last_name: string; dob: string | null; extra: Extra | null }): RegistrationRecord {
  const x = reg.extra ?? {};
  const blank = (s: string | null | undefined) => s?.trim() || null;
  const parent = (relationship: "father" | "mother", p?: RegistrationParentAnswers) => ({
    relationship,
    fullName: cleanName(p?.first, p?.last),
    email: blank(p?.email),
    phone: blank(p?.phone),
    volunteerInterests: [...(p?.volunteer ?? []), p?.volunteer_other?.trim()].filter(Boolean).join(", ") || null,
  });
  return {
    firstName: reg.first_name,
    lastName: reg.last_name,
    dob: reg.dob,
    ageGroup: null,
    newToProgram: x.first_season === true,
    addressLine1: blank(x.address?.line1),
    addressLine2: blank(x.address?.line2),
    city: blank(x.address?.city),
    state: blank(x.address?.state),
    postalCode: blank(x.address?.zip),
    phone: blank(x.athlete_phone),
    email: blank(x.athlete_email),
    registrationFee: blank(x.fee_tier),
    paymentMethod: blank(x.payment_option),
    // Back from the roster: the shirt size they had (lib/teams/waitlist-player.ts).
    shirtSize: blank(x.from_roster?.shirt_size),
    waiverSigned: x.waiver_agreed === true,
    waiverSignedOn: x.signature_date || null,
    directoryOptin: x.directory_optin !== false,
    parents: [parent("father", x.father), parent("mother", x.mother)],
  };
}

// Approve → apply the registration to the board: a player under No team yet
// (or the matching one already there) with the form's details, linked to the
// parents as members so they can sign in, and the registration fee on their
// Payments account. Linked back to the registration.
//
// The registration is read with the caller's own access, so only someone
// with the Registrations permission gets it back (0102). Applying it creates
// and updates parents' member rows and adds a Payments charge, which only the
// server may do for someone who isn't a super-admin, so those run with the
// service role.
export async function approveRegistration(id: string): Promise<{ error?: string }> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  const db = await createClient();
  const { data: reg } = await db.from("olb_registrations").select("*").eq("id", id).maybeSingle();
  if (!reg) return { error: "That registration isn't there any more. Refresh the page." };
  if (reg.status === "approved") return {};

  const admin = createAdminClient();
  let playerId: string;
  try {
    const applied = await applyRegistration(admin, reg.board_id, toRecord(reg));
    playerId = applied.playerId;
    for (const note of applied.notes) console.warn(`[registrations] registration ${id}: ${note}`);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Approving didn't work. Try again." };
  }

  const { error } = await db
    .from("olb_registrations")
    .update({ status: "approved", reviewed_by: gate.userId, reviewed_at: new Date().toISOString(), player_id: playerId })
    .eq("id", id);
  if (error) return { error: error.message };

  await chargeRegistrationFee(admin, reg.board_id, playerId, (reg.extra as Extra | null)?.fee_tier ?? null, gate.userId);
  // Notes written while they were on the waitlist (0124) follow them onto the roster.
  await admin.from("olb_player_notes").update({ player_id: playerId }).eq("registration_id", id);
  refresh();
  return {};
}

// Puts the registration fee on the new player's Payments account (0101), once.
// Best-effort: the approval stands if this fails, and the Treasurer's
// "Add registration fees" catches anyone missed.
async function chargeRegistrationFee(
  db: ReturnType<typeof createAdminClient>,
  boardId: string,
  playerId: string,
  feeTier: string | null,
  userId: string,
) {
  const cents = registrationFeeCents(feeTier);
  if (cents == null || cents <= 0) return;
  const { data: existing, error: findErr } = await db
    .from("olb_charges")
    .select("id")
    .eq("player_id", playerId)
    .eq("category", "registration")
    .is("voided_at", null)
    .limit(1);
  if (findErr || (existing ?? []).length > 0) return;
  const tier = registrationTier(feeTier);
  const { error } = await db.from("olb_charges").insert({
    board_id: boardId,
    player_id: playerId,
    kind: "charge",
    category: "registration",
    description: tier ? `Registration fee (${tier})` : "Registration fee",
    amount_cents: cents,
    entry_date: centralToday(),
    created_by: userId,
  });
  if (error) console.warn(`[registrations] registration fee for player ${playerId}: ${error.message}`);
}

// ─── The waitlist (0115) ────────────────────────────────────────────────────

type Result = { error?: string };

// Waiting → Waitlist: not on the roster yet, but kept, with an optional note
// on why, so the board can reach the family and approve them when a spot
// opens. Nothing is added to the roster or to Payments.
export async function waitlistRegistration(id: string, note: string): Promise<Result> {
  return setStatus(id, "pending", { status: "waitlisted", notes: cleanNote(note) }, true);
}

export async function updateRegistrationNote(id: string, note: string): Promise<Result> {
  return setStatus(id, "waitlisted", { notes: cleanNote(note) }, false);
}

// Back to New, to review again (Approve works from the Waitlist too).
export async function moveRegistrationToWaiting(id: string): Promise<Result> {
  return setStatus(id, "waitlisted", { status: "pending" }, false);
}

// To the Removed tab: a test, or a family that withdrew. Approve or Move to
// the waitlist brings it back.
export async function removeRegistration(id: string): Promise<Result> {
  return setStatus(id, ["pending", "waitlisted"], { status: "rejected" }, true);
}

// Removed → Waitlist.
export async function restoreToWaitlist(id: string): Promise<Result> {
  return setStatus(id, "rejected", { status: "waitlisted" }, true);
}

// "Contacted Oct 3 by Rachel", or cleared.
export async function setRegistrationContacted(id: string, contacted: boolean): Promise<Result> {
  return setStatus(
    id,
    "waitlisted",
    (userId) => (contacted ? { contacted_at: new Date().toISOString(), contacted_by: userId } : { contacted_at: null, contacted_by: null }),
    false
  );
}

const NOTE_MAX = 500;
function cleanNote(note: string): string | null {
  return note?.trim().slice(0, NOTE_MAX) || null;
}

async function setStatus(
  id: string,
  from: string | string[],
  patch: Record<string, unknown> | ((userId: string) => Record<string, unknown>),
  review: boolean
): Promise<Result> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  const db = await createClient();
  const fields = typeof patch === "function" ? patch(gate.userId) : patch;
  const q = db
    .from("olb_registrations")
    .update({ ...fields, ...(review ? { reviewed_by: gate.userId, reviewed_at: new Date().toISOString() } : {}) })
    .eq("id", id);
  const { data, error } = await (Array.isArray(from) ? q.in("status", from) : q.eq("status", from)).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That registration has changed since you opened the page. Refresh the page." };
  refresh();
  return {};
}

// A message to one family or everyone on the waitlist, sent from the club's
// address with replies to the club's Gmail, to the dads, moms and players
// picked (all three to start). Brothers and sisters get one email between
// them. {player} becomes the family's players' first names. Each email is
// kept on its registrations, and they're marked contacted.
export async function sendRegistrationMessage(
  ids: string[],
  subject: string,
  body: string,
  recipients: Recipient[] = ALL_RECIPIENTS
): Promise<{ sent?: number; skipped?: string[]; error?: string }> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  const title = subject?.trim();
  const text = body?.trim();
  if (!title || title.length > 200) return { error: "Add a subject (up to 200 characters)." };
  if (!text || text.length > 4000) return { error: "Add a message (up to 4,000 characters)." };
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 300) return { error: "Pick who to send it to." };
  const roles = ALL_RECIPIENTS.filter((r) => Array.isArray(recipients) && recipients.includes(r));
  if (roles.length === 0) return { error: "Pick at least one person to send it to." };

  // Read under the caller's own access (0102): only registrations they may see.
  const db = await createClient();
  const { data } = await db
    .from("olb_registrations")
    .select("id, first_name, last_name, dob, created_at, parent_email, extra, contacted_at")
    .in("id", ids)
    .eq("status", "waitlisted");
  const regs = (data as (WaitlistRegistration & { contacted_at: string | null })[] | null) ?? [];
  if (regs.length === 0) return { error: "Those registrations aren't on the waitlist any more. Refresh the page." };

  const { groups, noEmail } = groupFamilies(regs, roles);
  const emails = groups.map((g) => {
    const filled = fillMessage(text, g.players);
    return { to: g.emails, subject: fillMessage(title, g.players), text: filled, html: messageHtml(filled) };
  });
  const { sent, error } = emails.length ? await sendFamilyEmails(emails) : { sent: 0, error: undefined };

  // Keep a copy on each registration that was emailed, and mark it contacted.
  const done = groups.slice(0, sent);
  if (done.length) {
    const now = new Date().toISOString();
    const rows = done.flatMap((g, i) =>
      g.players.map((r) => ({
        registration_id: r.id,
        subject: emails[i].subject,
        body: emails[i].text,
        sent_to: g.emails,
        sent_by: gate.userId,
        sent_at: now,
      }))
    );
    const { error: logError } = await db.from("olb_registration_messages").insert(rows);
    if (logError) console.warn(`[registrations] keeping a copy of a message failed: ${logError.message}`);
    const fresh = done.flatMap((g) => g.players.filter((r) => !r.contacted_at).map((r) => r.id));
    if (fresh.length) {
      await db.from("olb_registrations").update({ contacted_at: now, contacted_by: gate.userId }).in("id", fresh);
    }
  }
  refresh();
  return { sent, skipped: noEmail.map((r) => `${r.first_name} ${r.last_name}`.trim()), ...(error ? { error } : {}) };
}

function refresh() {
  revalidatePath("/portal/directory", "layout");
  revalidatePath("/portal/payments");
}
