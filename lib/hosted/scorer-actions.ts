"use server";

// The scorer's table (0165): enter the tournament PIN once, then save each
// game's final from the court. No account: the PIN cookie is the check
// (./scorer.ts), and the writes run with the service role after it. Only
// the score of a game in that tournament with both teams set; winners move
// on and pool seats fill the same way as from the portal.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "../supabase/admin";
import { moveOn } from "./move-on";
import { SCORER_COOKIE, isScorer, pinLocked, readPin, recordPinFailure, samePin, scorerToken } from "./scorer";

type Result = { error?: string };
const UUID = /^[0-9a-f-]{36}$/i;

export async function enterScorerPin(weekendId: string, pin: string): Promise<Result> {
  if (!UUID.test(weekendId)) return { error: "This link isn't right. Scan the court card again." };
  const typed = (pin ?? "").replace(/\D/g, "");
  if (await pinLocked(weekendId)) return { error: "Too many wrong PINs. Wait 15 minutes, or ask the tournament desk." };
  const real = await readPin(weekendId);
  if (!real) return { error: "Score entry isn't open yet. Ask the tournament desk." };
  if (typed.length !== 6 || !samePin(typed, real)) {
    await recordPinFailure(weekendId);
    return { error: "That PIN isn't right. Check it with the tournament desk." };
  }
  (await cookies()).set(SCORER_COOKIE, `${weekendId}.${scorerToken(weekendId, real)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/shootout",
    maxAge: 60 * 60 * 24 * 4,
  });
  return {};
}

export async function leaveScorer(): Promise<void> {
  (await cookies()).delete({ name: SCORER_COOKIE, path: "/shootout" });
}

function points(n: unknown): number | null {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isInteger(v) && v >= 0 && v <= 300 ? v : null;
}

async function loadGame(weekendId: string, gameId: string) {
  const { data } = await createAdminClient()
    .from("hs_hosted_games")
    .select("id, home_team_id, away_team_id")
    .eq("id", gameId)
    .eq("weekend_id", weekendId)
    .maybeSingle();
  return data as { id: string; home_team_id: string | null; away_team_id: string | null } | null;
}

export async function saveTableScore(weekendId: string, gameId: string, home: number, away: number): Promise<Result> {
  if (!UUID.test(weekendId) || !UUID.test(gameId)) return { error: "That game isn't there." };
  if (!(await isScorer(weekendId))) return { error: "Enter the PIN again. It may have changed." };
  const h = points(home);
  const a = points(away);
  if (h == null || a == null) return { error: "Type both scores, 0 to 300." };
  if (h === a) return { error: "The scores are tied. Check the book for overtime." };
  const game = await loadGame(weekendId, gameId);
  if (!game) return { error: "That game isn't there any more. Refresh the page." };
  if (!game.home_team_id || !game.away_team_id) return { error: "This game's teams aren't set yet. Ask the tournament desk." };
  const db = createAdminClient();
  const { error } = await db.from("hs_hosted_games").update({ home_score: h, away_score: a }).eq("id", gameId).eq("weekend_id", weekendId);
  if (error) return { error: "Couldn't save. Try again." };
  await moveOn(db, weekendId);
  revalidatePath(`/portal/schedule/hosted/${weekendId}`);
  return {};
}

// Undo right after a save, or clear a score put in by mistake.
export async function clearTableScore(weekendId: string, gameId: string): Promise<Result> {
  if (!UUID.test(weekendId) || !UUID.test(gameId)) return { error: "That game isn't there." };
  if (!(await isScorer(weekendId))) return { error: "Enter the PIN again. It may have changed." };
  if (!(await loadGame(weekendId, gameId))) return { error: "That game isn't there any more." };
  const db = createAdminClient();
  const { error } = await db.from("hs_hosted_games").update({ home_score: null, away_score: null }).eq("id", gameId).eq("weekend_id", weekendId);
  if (error) return { error: "Couldn't undo. Try again." };
  await moveOn(db, weekendId);
  revalidatePath(`/portal/schedule/hosted/${weekendId}`);
  return {};
}
