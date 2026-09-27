"use server";
import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import { requireTeamManager } from "./guard";

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
// populated for the manager view + approval flow. Writes with the service
// role: the olb_ tables have no anon policies, so visitors can't read or
// write them directly — only through this action.
export async function createRegistration(input: RegistrationInput, honeypot: string): Promise<string | null> {
  if (honeypot && honeypot.trim()) return null; // bot
  if (!input.athlete_first?.trim() || !input.athlete_last?.trim()) return "Athlete first and last name are required.";
  if (!input.waiver_agreed || !input.signature_name?.trim()) return "Please type your name to sign the Accident Waiver.";
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

// Approve → create an Unassigned player linked back to the registration.
export async function approveRegistration(id: string): Promise<void> {
  const userId = await requireTeamManager();
  const db = await createClient();
  const { data: reg } = await db.from("olb_registrations").select("*").eq("id", id).maybeSingle();
  if (!reg) throw new Error("Registration not found.");
  if (reg.status === "approved") return;

  const full_name = `${reg.first_name} ${reg.last_name}`.trim();
  const { data: player, error: pe } = await db
    .from("olb_players")
    .insert({ board_id: reg.board_id, team_id: null, full_name, dob: reg.dob, grade: reg.grade })
    .select("id")
    .single();
  if (pe || !player) throw new Error(pe?.message ?? "Could not create player.");

  const { error } = await db
    .from("olb_registrations")
    .update({ status: "approved", reviewed_by: userId, reviewed_at: new Date().toISOString(), player_id: player.id })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function rejectRegistration(id: string): Promise<void> {
  const userId = await requireTeamManager();
  const db = await createClient();
  const { error } = await db
    .from("olb_registrations")
    .update({ status: "rejected", reviewed_by: userId, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
