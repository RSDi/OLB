"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import { requireRegistrations } from "../auth/guards";
import { applyRegistration, cleanName, type RegistrationRecord } from "./apply-registration";
import type { RegistrationExtra as Extra, RegistrationParentAnswers } from "./roster-logic";
import { registrationFeeCents, registrationTier } from "../finances/logic";
import { centralToday } from "../finances/data";

type RegistrationInput = {
  athlete_first: string;
  athlete_last: string;
  athlete_dob: string | null;
  first_season: boolean | null;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip: string;
  athlete_phone: string;
  athlete_email: string;
  homeschool_affirm: boolean | null;
  directory_optin: boolean;
  needs_uniform: boolean | null;
  needs_grays: boolean | null;
  father_first: string;
  father_last: string;
  father_email: string;
  father_phone: string;
  father_volunteer: string[];
  father_volunteer_other: string;
  mother_first: string;
  mother_last: string;
  mother_email: string;
  mother_phone: string;
  mother_volunteer: string[];
  mother_volunteer_other: string;
  waiver_agreed: boolean;
  printed_name: string;
  signature_mode: string;
  signature_name: string;
  signature_image: string;
  signature_date: string | null;
  fee_tier: string;
  donation_interest: boolean;
  payment_option: string;
};

// PUBLIC — no auth. Honeypot + validation guard the open endpoint. The full
// submission is stored in olb_registrations.extra (jsonb); core columns are
// populated for the Directory's New registrations page and Approve. Writes with the service
// role: the olb_ tables have no anon policies, so visitors can't read or
// write them directly — only through this action.
export async function createRegistration(input: RegistrationInput, honeypot: string): Promise<string | null> {
  if (honeypot && honeypot.trim()) return null; // bot
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

  const db = createAdminClient();
  const { data: board } = await db.from("olb_boards").select("id").eq("season", "2026-2027").maybeSingle();
  if (!board) return "Registration isn't open yet — please check back soon.";

  const fatherName = [input.father_first, input.father_last].map((s) => s?.trim()).filter(Boolean).join(" ");
  const motherName = [input.mother_first, input.mother_last].map((s) => s?.trim()).filter(Boolean).join(" ");
  const naless = (s: string) => (s && s.trim().toUpperCase() !== "N/A" ? s.trim() : "");

  const { error } = await db.from("olb_registrations").insert({
    board_id: board.id,
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
      signature_image: input.signature_image || null,
      signature_date: input.signature_date || null,
      fee_tier: input.fee_tier,
      donation_interest: input.donation_interest,
      payment_option: input.payment_option,
    },
  });
  if (error) return "Something went wrong saving your registration. Please try again.";
  return null;
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
    shirtSize: null,
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

// Not this season: the registration leaves the queue. Nothing is added to the
// roster or to Payments.
export async function rejectRegistration(id: string): Promise<{ error?: string }> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  const db = await createClient();
  const { data, error } = await db
    .from("olb_registrations")
    .update({ status: "rejected", reviewed_by: gate.userId, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That registration was already reviewed. Refresh the page." };
  refresh();
  return {};
}

function refresh() {
  revalidatePath("/portal/directory", "layout");
  revalidatePath("/portal/payments");
}
