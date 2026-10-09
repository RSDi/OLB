"use server";
// The roster, from the Directory: putting a player on a team, Edit player,
// and taking a player off the roster. For anyone with the Registrations
// permission (0102); RLS and remove_olb_player() check it again.

import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import { requireRegistrations } from "../auth/guards";
import { cleanPlayerEdit, type PlayerEdit } from "./roster-logic";
import { fromRoster, registrationFromPlayer, type RosterPlayerFull } from "./waitlist-player";

type Result = { error?: string };

function refresh() {
  revalidatePath("/portal/directory", "layout");
  revalidatePath("/portal/payments");
}

// Puts a player on a team, or back under No team yet (null).
export async function placePlayer(playerId: string, teamId: string | null): Promise<Result> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  const db = await createClient();
  const { data, error } = await db
    .from("olb_players")
    .update({ team_id: teamId || null, updated_at: new Date().toISOString() })
    .eq("id", playerId)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That player couldn't be moved. Refresh the page and try again." };
  refresh();
  return {};
}

export async function updatePlayer(playerId: string, input: PlayerEdit): Promise<Result> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  const clean = cleanPlayerEdit(input);
  if ("error" in clean) return { error: clean.error };
  const db = await createClient();
  const { data, error } = await db
    .from("olb_players")
    .update({ ...clean.value, updated_at: new Date().toISOString() })
    .eq("id", playerId)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That player couldn't be saved. Refresh the page and try again." };
  refresh();
  return {};
}

// Takes a player off the roster for good, with their parent links and
// requirement check-offs. Refused while they have charges or payments that
// aren't voided.
export async function removePlayer(playerId: string): Promise<Result> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  const db = await createClient();
  const { error } = await db.rpc("remove_olb_player", { p_player_id: playerId });
  if (error) return { error: error.message };
  refresh();
  return {};
}

// Off the roster and back onto the waitlist (Registrations → Waitlist), for a
// family that didn't show and lost their spot. Their registration goes back
// to waitlisted, or one is written from the roster for a player who came in
// from the spreadsheet. Notes and the emails sent to the family move with
// them. The registration fee Approve added comes off; a player with a
// payment, or any other charge that isn't voided, stays until the Treasurer
// sorts it out on the Payments page. Approve puts them back on the roster.
//
// The checks run with the caller's own access; the move itself touches
// registrations, notes, messages and Payments, so it runs with the service
// role.
export async function moveToWaitlist(playerId: string, note: string): Promise<Result> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  const db = await createClient();
  const { data: visible } = await db.from("olb_players").select("id").eq("id", playerId).maybeSingle();
  if (!visible) return { error: "That player isn't there any more. Refresh the page." };

  const admin = createAdminClient();
  const { data: player } = await admin
    .from("olb_players")
    .select(
      "id, board_id, full_name, dob, age_group, new_to_program, address_line1, address_line2, city, state, postal_code, phone, email, " +
        "registration_fee, payment_method, shirt_size, waiver_signed, waiver_signed_on, directory_optin, jersey_number, registered_at, " +
        "team:olb_teams(name, age_group), parents:olb_player_parents(relationship, member:members(full_name, email, phone, volunteer_interests))"
    )
    .eq("id", playerId)
    .maybeSingle();
  const p = player as unknown as RosterPlayerFull | null;
  if (!p) return { error: "That player isn't there any more. Refresh the page." };

  const [{ data: charges }, { data: payments }] = await Promise.all([
    admin.from("olb_charges").select("id, category").eq("player_id", playerId).is("voided_at", null),
    admin.from("olb_payments").select("id").eq("player_id", playerId).is("voided_at", null),
  ]);
  if ((payments ?? []).length > 0 || (charges ?? []).some((c) => c.category !== "registration")) {
    return {
      error: `${p.full_name} has payments or charges on the Payments page. The Treasurer refunds or voids them first, then you can move them to the waitlist.`,
    };
  }

  const now = new Date().toISOString();
  const cleanNote = note?.trim().slice(0, 500) || null;
  const { data: approved } = await admin
    .from("olb_registrations")
    .select("id, extra")
    .eq("player_id", playerId)
    .eq("status", "approved")
    .order("reviewed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let registrationId: string;
  let undo: () => Promise<unknown>;
  if (approved) {
    const { error } = await admin
      .from("olb_registrations")
      .update({
        status: "waitlisted",
        notes: cleanNote,
        reviewed_by: gate.userId,
        reviewed_at: now,
        contacted_at: null,
        contacted_by: null,
        extra: { ...((approved.extra as object | null) ?? {}), from_roster: fromRoster(p, now) },
      })
      .eq("id", approved.id);
    if (error) return { error: error.message };
    registrationId = approved.id;
    undo = async () =>
      admin.from("olb_registrations").update({ status: "approved", player_id: playerId, extra: approved.extra }).eq("id", approved.id);
  } else {
    const { data: created, error } = await admin
      .from("olb_registrations")
      .insert(registrationFromPlayer(p, cleanNote, gate.userId, now))
      .select("id")
      .single();
    if (error || !created) return { error: error?.message ?? "Moving to the waitlist didn't work. Try again." };
    registrationId = created.id;
    undo = async () => admin.from("olb_registrations").delete().eq("id", created.id);
  }

  // Notes and sent emails follow them to the registration.
  const { error: notesErr } = await admin.from("olb_player_notes").update({ registration_id: registrationId }).eq("player_id", playerId);
  if (notesErr) {
    await undo();
    return { error: notesErr.message };
  }
  const { data: sent } = await admin.from("olb_player_messages").select("subject, body, sent_to, sent_by, sent_at").eq("player_id", playerId);
  if ((sent ?? []).length > 0) {
    await admin.from("olb_registration_messages").insert((sent ?? []).map((m) => ({ ...m, registration_id: registrationId })));
  }

  // The registration fee (and anything already voided) goes with the player.
  await admin.from("olb_charges").delete().eq("player_id", playerId);
  await admin.from("olb_payments").delete().eq("player_id", playerId);
  const { error: delErr } = await admin.from("olb_players").delete().eq("id", playerId);
  if (delErr) {
    await undo();
    return { error: delErr.message };
  }
  refresh();
  return {};
}
