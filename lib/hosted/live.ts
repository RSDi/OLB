// The public live page for a tournament we host (0165): /shootout, reached
// from the QR code on the signs. No login, so it's read with the service
// role and names every column it takes: never the scorer PIN, fees, notes,
// contacts or money. Only a tournament a planner has turned on
// (hs_hosted.live_public) shows.

import { createAdminClient } from "../supabase/admin";
import { churchToday } from "../dates/today";
import type { HostedDivision, HostedGame, HostedTeam } from "./types";

export type LiveTeam = Pick<HostedTeam, "id" | "division_id" | "name" | "code" | "pool" | "ours" | "sort_order">;
export type LiveDivision = Pick<HostedDivision, "id" | "name" | "code" | "format" | "sort_order">;

export interface LiveData {
  weekendId: string;
  event: string;
  startsOn: string;
  endsOn: string;
  facility: string | null;
  admission: string | null;
  concessions: string | null;
  courts: number;
  gameMinutes: number;
  divisions: LiveDivision[];
  teams: LiveTeam[];
  games: HostedGame[];
}

const LIVE_GAME_COLUMNS =
  "id, weekend_id, division_id, game_no, round, label, home_team_id, away_team_id, home_from, away_from, plays_on, starts_at, court, home_score, away_score";

// The tournament to show: the public one happening now or next, else the
// last one played. Null when none is turned on (or 0165 isn't in).
// evenIfOff: any tournament we host, for the admission screen (prices only).
export async function findLiveWeekendId(evenIfOff = false): Promise<string | null> {
  const db = createAdminClient();
  let q = db.from("hs_hosted").select("weekend_id, weekend:hs_weekends(starts_on, ends_on)").eq("hosted", true);
  if (!evenIfOff) q = q.eq("live_public", true);
  const { data, error } = await q;
  if (error || !data) return null;
  const rows = (data as unknown as { weekend_id: string; weekend: { starts_on: string; ends_on: string } | { starts_on: string; ends_on: string }[] | null }[])
    .map((r) => ({ id: r.weekend_id, w: Array.isArray(r.weekend) ? r.weekend[0] : r.weekend }))
    .filter((r): r is { id: string; w: { starts_on: string; ends_on: string } } => !!r.w);
  if (rows.length === 0) return null;
  const today = churchToday();
  const ahead = rows.filter((r) => r.w.ends_on >= today).sort((a, b) => a.w.starts_on.localeCompare(b.w.starts_on));
  if (ahead.length) return ahead[0].id;
  return rows.sort((a, b) => b.w.ends_on.localeCompare(a.w.ends_on))[0].id;
}

export async function loadLive(weekendId?: string | null): Promise<LiveData | null> {
  const id = weekendId ?? (await findLiveWeekendId());
  if (!id) return null;
  return loadWeekend(id, false);
}

// What the admission screen shows: the event, its dates and the prices.
// Shown whether or not the live page is on; nothing on it is private.
export interface AdmissionData {
  event: string;
  startsOn: string;
  endsOn: string;
  gameDays: string[];
  facility: string | null;
  admission: string | null;
}

export async function loadAdmission(): Promise<AdmissionData | null> {
  const id = await findLiveWeekendId(true);
  if (!id) return null;
  const d = await loadWeekend(id, true);
  if (!d) return null;
  const gameDays = [...new Set(d.games.map((g) => g.plays_on).filter((x): x is string => !!x))].sort();
  return { event: d.event, startsOn: d.startsOn, endsOn: d.endsOn, gameDays, facility: d.facility, admission: d.admission };
}

async function loadWeekend(id: string, evenIfOff: boolean): Promise<LiveData | null> {
  const db = createAdminClient();
  const [{ data: plan }, { data: w }, { data: divisions }, { data: teams }, { data: games }] = await Promise.all([
    db.from("hs_hosted").select("weekend_id, hosted, live_public, courts, game_minutes, facility, admission, concessions").eq("weekend_id", id).maybeSingle(),
    db.from("hs_weekends").select("id, event, starts_on, ends_on").eq("id", id).maybeSingle(),
    db.from("hs_hosted_divisions").select("id, name, code, format, sort_order").eq("weekend_id", id).order("sort_order"),
    db.from("hs_hosted_teams").select("id, division_id, name, code, pool, ours, sort_order").eq("weekend_id", id).order("sort_order"),
    db.from("hs_hosted_games").select(LIVE_GAME_COLUMNS).eq("weekend_id", id),
  ]);
  const p = plan as { hosted: boolean; live_public: boolean; courts: number; game_minutes: number; facility: string | null; admission: string | null; concessions: string | null } | null;
  const wk = w as { id: string; event: string; starts_on: string; ends_on: string } | null;
  if (!p || !p.hosted || (!p.live_public && !evenIfOff) || !wk) return null;
  return {
    weekendId: id,
    event: wk.event || "Our tournament",
    startsOn: wk.starts_on,
    endsOn: wk.ends_on,
    facility: p.facility,
    admission: p.admission,
    concessions: p.concessions,
    courts: p.courts,
    gameMinutes: p.game_minutes,
    divisions: (divisions as LiveDivision[] | null) ?? [],
    teams: ((teams as LiveTeam[] | null) ?? []).filter((t) => t.division_id),
    games: ((games as HostedGame[] | null) ?? []).map((g) => ({ ...g, starts_at: g.starts_at ? g.starts_at.slice(0, 5) : null })),
  };
}
