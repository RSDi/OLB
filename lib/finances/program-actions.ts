"use server";

// The public clinic and workout sign-up (0131). Anyone can send it while the
// program is open. A player on this season's roster gets the fee as a
// 'program' charge on the family's Payments account; anyone else is paid on
// the sign-up. Runs with the service role, so it checks everything itself.

import { createAdminClient } from "../supabase/admin";
import { sendPushToPermission } from "../notifications/push";
import { centralToday } from "./data";
import { formatAmount } from "./logic";
import { latestBoard, loadFinanceSettings } from "./club-data";
import { levelsFrom } from "./club-logic";
import { nameKey, priceFor, signupProblem, type SignupInput } from "./program-signup";

export async function signUpForProgram(
  programId: string,
  input: SignupInput,
  submissionKey: string,
  honeypot: string
): Promise<{ error?: string; total?: number; onAccount?: number }> {
  if (honeypot && honeypot.trim()) return {}; // bot
  const db = createAdminClient();
  const board = await latestBoard(db);
  if (!board || !(await loadFinanceSettings(db, board.id)).enabled) return { error: "Sign-up isn't open right now." };
  const { data: row } = await db
    .from("olb_programs")
    .select("id, name, levels, open, capacity, archived_at")
    .eq("id", programId)
    .eq("board_id", board.id)
    .maybeSingle();
  const program = row as { id: string; name: string; levels: unknown; open: boolean; capacity: number | null; archived_at: string | null } | null;
  if (!program || !program.open || program.archived_at) return { error: "Sign-up for this one is closed. Email lightningbasketballomaha@gmail.com and we'll help." };
  const levels = levelsFrom(program.levels);
  const problem = signupProblem(input, levels);
  if (problem) return { error: problem };
  const key = submissionKey.trim();
  if (key.length < 8 || key.length > 80) return { error: "Something went wrong. Please reload the page and try again." };

  // Sent twice (a double tap): the first one stands.
  const { data: again } = await db.from("olb_program_signups").select("id").like("submission_key", `${key}:%`).limit(1);
  if ((again ?? []).length > 0) return {};

  const email = input.email.trim().toLowerCase();
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count: recent } = await db.from("olb_program_signups").select("id", { count: "exact", head: true }).eq("parent_email", email).gte("created_at", hourAgo);
  if ((recent ?? 0) >= 12) return { error: "We've had a lot from this email already. Try again in an hour, or email us." };

  const { data: existing } = await db.from("olb_program_signups").select("child_first, child_last, child_dob").eq("program_id", program.id).is("cancelled_at", null);
  const taken = (existing as { child_first: string; child_last: string; child_dob: string | null }[] | null) ?? [];
  const already = new Set(taken.map((t) => `${nameKey(t.child_first, t.child_last)}|${t.child_dob ?? ""}`));
  const kids = input.kids.filter((k) => !already.has(`${nameKey(k.first, k.last)}|${k.dob}`));
  if (kids.length === 0) return {};
  if (program.capacity && taken.length + kids.length > program.capacity) {
    const left = Math.max(0, program.capacity - taken.length);
    return { error: left ? `There's room for ${left} more. Please sign up fewer players, or email us.` : "It's full. Email lightningbasketballomaha@gmail.com to ask about a spot." };
  }

  // Players already on this season's roster, by name and birthday.
  const { data: roster } = await db.from("olb_players").select("id, full_name, dob").eq("board_id", board.id);
  const onRoster = new Map(
    ((roster as { id: string; full_name: string; dob: string | null }[] | null) ?? []).map((p) => [`${p.full_name.trim().toLowerCase().replace(/\s+/g, " ")}|${p.dob ?? ""}`, p.id])
  );

  let total = 0;
  let onAccount = 0;
  for (const [i, k] of kids.entries()) {
    const price = priceFor(levels, k.level);
    const first = k.first.trim().slice(0, 60);
    const last = k.last.trim().slice(0, 60);
    const playerId = onRoster.get(`${nameKey(first, last)}|${k.dob}`) ?? null;
    let charge_id: string | null = null;
    if (playerId && price.cents > 0) {
      const { data: charge } = await db
        .from("olb_charges")
        .insert({
          board_id: board.id,
          player_id: playerId,
          kind: "charge",
          category: "program",
          description: `${program.name}${levels.length > 1 && price.label ? ` (${price.label})` : ""}`.slice(0, 120),
          amount_cents: price.cents,
          entry_date: centralToday(),
        })
        .select("id")
        .single();
      charge_id = (charge as { id: string } | null)?.id ?? null;
      if (charge_id) onAccount += price.cents;
    }
    const { error } = await db.from("olb_program_signups").insert({
      board_id: board.id,
      program_id: program.id,
      player_id: playerId,
      child_first: first,
      child_last: last,
      child_dob: k.dob,
      level: price.label,
      price_cents: price.cents,
      parent_name: input.parent_name.trim().slice(0, 120),
      parent_email: email.slice(0, 200),
      parent_phone: input.phone.trim().slice(0, 40) || null,
      note: input.note.trim().slice(0, 500) || null,
      charge_id,
      submission_key: `${key}:${i}`,
    });
    if (error) {
      if (charge_id) await db.from("olb_charges").update({ voided_at: new Date().toISOString() }).eq("id", charge_id);
      return { error: "Something went wrong saving that. Please try again." };
    }
    total += price.cents;
  }

  await sendPushToPermission("payments", {
    title: `${program.name}: ${kids.map((k) => k.first.trim()).join(", ")} signed up`,
    body: `From ${input.parent_name.trim()}, ${formatAmount(total)}.`,
    url: "/portal/payments?tab=programs",
  }).catch(() => {});
  return { total, onAccount };
}
