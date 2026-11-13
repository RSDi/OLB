"use server";

// The scorer's table (0165): enter the tournament PIN once, then save any
// game's final, fix or clear one, or move a game (day, time, court, teams). No account: the PIN cookie is the check
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
  if (typed.length < 4 || typed.length > 6 || !samePin(typed, real)) {
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

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d(:00)?$/;

// What the table can change about a game. A team picked by hand comes with
// its seat's from cleared (null), so results no longer replace it; Undo
// sends the old from back.
export interface TableGamePatch {
  plays_on?: string | null;
  starts_at?: string | null;
  court?: number | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_from?: string | null;
  away_from?: string | null;
}

export async function editTableGame(weekendId: string, gameId: string, patch: TableGamePatch): Promise<Result> {
  if (!UUID.test(weekendId) || !UUID.test(gameId)) return { error: "That game isn't there." };
  if (!(await isScorer(weekendId))) return { error: "Enter the PIN again. It may have changed." };
  const db = createAdminClient();
  const { data: g } = await db.from("hs_hosted_games").select("id, division_id, home_team_id, away_team_id").eq("id", gameId).eq("weekend_id", weekendId).maybeSingle();
  const game = g as { id: string; division_id: string | null; home_team_id: string | null; away_team_id: string | null } | null;
  if (!game) return { error: "That game isn't there any more. Refresh the page." };
  const row: Record<string, unknown> = {};
  if (patch.plays_on !== undefined) {
    if (patch.plays_on && !ISO_DAY.test(patch.plays_on)) return { error: "Pick a day." };
    row.plays_on = patch.plays_on || null;
  }
  if (patch.starts_at !== undefined) {
    if (patch.starts_at && !HHMM.test(patch.starts_at)) return { error: "Pick a time." };
    row.starts_at = patch.starts_at || null;
  }
  if (patch.court !== undefined) {
    if (patch.court != null && !(Number.isInteger(patch.court) && patch.court >= 1 && patch.court <= 20)) return { error: "Pick a court." };
    row.court = patch.court;
  }
  for (const side of ["home", "away"] as const) {
    const teamKey = `${side}_team_id` as const;
    const fromKey = `${side}_from` as const;
    const team = patch[teamKey];
    if (team !== undefined) {
      if (team && !UUID.test(team)) return { error: "Pick a team." };
      if (team) {
        const { data: t } = await db.from("hs_hosted_teams").select("id, division_id").eq("id", team).eq("weekend_id", weekendId).maybeSingle();
        const found = t as { id: string; division_id: string } | null;
        if (!found) return { error: "That team isn't in this tournament." };
        if (game.division_id && found.division_id !== game.division_id) return { error: "Pick a team from this game's division." };
      }
      row[teamKey] = team || null;
    }
    const from = patch[fromKey];
    if (from !== undefined) {
      if (from) {
        const seat = /^P:[1-8]:[1-9]$/.test(from);
        const fed = /^[WL]:[0-9a-f-]{36}$/i.test(from) && from.slice(2) !== gameId;
        if (!seat && !fed) return { error: "That seat isn't right. Refresh the page." };
        if (fed) {
          const { data: src } = await db.from("hs_hosted_games").select("id").eq("id", from.slice(2)).eq("weekend_id", weekendId).maybeSingle();
          if (!src) return { error: "That seat isn't right. Refresh the page." };
        }
      }
      row[fromKey] = from || null;
    }
  }
  const home = row.home_team_id !== undefined ? row.home_team_id : game.home_team_id;
  const away = row.away_team_id !== undefined ? row.away_team_id : game.away_team_id;
  if (home && home === away) return { error: "Pick two different teams." };
  if (Object.keys(row).length === 0) return {};
  const { error } = await db.from("hs_hosted_games").update(row).eq("id", gameId).eq("weekend_id", weekendId);
  if (error) return { error: "Couldn't save. Try again." };
  await moveOn(db, weekendId);
  revalidatePath(`/portal/schedule/hosted/${weekendId}`);
  return {};
}

// Two games trade their day, time and court ("Swap the two games").
export async function swapTableGames(weekendId: string, aId: string, bId: string): Promise<Result> {
  if (!UUID.test(weekendId) || !UUID.test(aId) || !UUID.test(bId) || aId === bId) return { error: "That game isn't there." };
  if (!(await isScorer(weekendId))) return { error: "Enter the PIN again. It may have changed." };
  const db = createAdminClient();
  const { data } = await db.from("hs_hosted_games").select("id, plays_on, starts_at, court").eq("weekend_id", weekendId).in("id", [aId, bId]);
  const rows = (data as { id: string; plays_on: string | null; starts_at: string | null; court: number | null }[] | null) ?? [];
  const a = rows.find((r) => r.id === aId);
  const b = rows.find((r) => r.id === bId);
  if (!a || !b) return { error: "That game isn't there any more. Refresh the page." };
  const [r1, r2] = await Promise.all([
    db.from("hs_hosted_games").update({ plays_on: b.plays_on, starts_at: b.starts_at, court: b.court }).eq("id", aId).eq("weekend_id", weekendId),
    db.from("hs_hosted_games").update({ plays_on: a.plays_on, starts_at: a.starts_at, court: a.court }).eq("id", bId).eq("weekend_id", weekendId),
  ]);
  if (r1.error || r2.error) return { error: "Couldn't swap. Try again." };
  revalidatePath(`/portal/schedule/hosted/${weekendId}`);
  return {};
}
