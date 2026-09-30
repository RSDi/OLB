"use server";

// Server actions for the HS Schedule. Coaches and the board (requireHsPlanner,
// and RLS from 0108); adding or deleting a whole season is the board's.
//
// The grid saves as people click (a team's games, who's coming, on the fence
// or not), so these return the saved row for the page to show, without
// re-rendering the whole schedule. Only the season-level actions revalidate.

import { revalidatePath } from "next/cache";
import { requireStaff } from "../auth/guards";
import { createClient } from "../supabase/server";
import { requireHsPlanner } from "./guard";
import { carryWeekend, isOpponentStatus, isWeekendStatus, isYmd, daysBetween } from "./logic";
import type {
  HsGames,
  HsLevel,
  HsLevelInput,
  HsOpponent,
  HsOpponentInput,
  HsOpponentStatus,
  HsWeekend,
  HsWeekendInput,
} from "./types";

type Result<T> = { error?: string; data?: T };

const WEEKEND_COLUMNS =
  "id, season_id, starts_on, ends_on, event, details, location, trip, status, notes, facility_contact_id, sort_order, updated_at, updated_by";
const OPPONENT_COLUMNS =
  "id, weekend_id, level_id, contact_id, name, status, our_score, their_score, note, sort_order";
const LEVEL_COLUMNS = "id, season_id, label, name, team_id, hidden, sort_order";

function text(v: string | null | undefined, max: number): string | null {
  const t = (v ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

function longText(v: string | null | undefined, max: number): string | null {
  const t = (v ?? "").trim();
  return t ? t.slice(0, max) : null;
}

function score(v: number | null | undefined): number | null {
  if (v == null || Number.isNaN(v)) return null;
  return Math.max(0, Math.min(300, Math.round(v)));
}

// ─── A team's games on a weekend (a cell) ───────────────────────────────────

export async function setWeekendGames(input: {
  weekend_id: string;
  level_id: string;
  games: number | null;
  unsure: boolean;
  note?: string | null;
}): Promise<Result<HsGames | null>> {
  const gate = await requireHsPlanner();
  if ("error" in gate) return { error: gate.error };
  const games = input.games == null ? null : Math.max(0, Math.min(30, Math.round(input.games)));
  const note = text(input.note, 120);
  const supabase = await createClient();
  if (games == null && !input.unsure && !note) {
    const { error } = await supabase
      .from("hs_weekend_games")
      .delete()
      .eq("weekend_id", input.weekend_id)
      .eq("level_id", input.level_id);
    return error ? { error: error.message } : { data: null };
  }
  const { data, error } = await supabase
    .from("hs_weekend_games")
    .upsert(
      { weekend_id: input.weekend_id, level_id: input.level_id, games, unsure: input.unsure, note, updated_by: gate.userId },
      { onConflict: "weekend_id,level_id" }
    )
    .select("weekend_id, level_id, games, unsure, note")
    .single();
  if (error || !data) return { error: error?.message ?? "Couldn't save the games." };
  return { data: data as HsGames };
}

// ─── Teams coming ───────────────────────────────────────────────────────────

export async function addOpponent(input: HsOpponentInput): Promise<Result<HsOpponent>> {
  const gate = await requireHsPlanner();
  if ("error" in gate) return { error: gate.error };
  const name = text(input.name, 120);
  if (!name) return { error: "Type the team's name." };
  if (!isOpponentStatus(input.status)) return { error: "Pick confirmed, on the fence or not coming." };
  const supabase = await createClient();
  const { data: last } = await supabase
    .from("hs_opponents")
    .select("sort_order")
    .eq("weekend_id", input.weekend_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ours = score(input.our_score);
  const theirs = score(input.their_score);
  const { data, error } = await supabase
    .from("hs_opponents")
    .insert({
      weekend_id: input.weekend_id,
      level_id: input.level_id,
      contact_id: input.contact_id,
      name,
      status: input.status,
      our_score: ours != null && theirs != null ? ours : null,
      their_score: ours != null && theirs != null ? theirs : null,
      note: text(input.note, 300),
      sort_order: ((last as { sort_order: number } | null)?.sort_order ?? -1) + 1,
      created_by: gate.userId,
      updated_by: gate.userId,
    })
    .select(OPPONENT_COLUMNS)
    .single();
  if (error || !data) return { error: error?.message ?? "Couldn't add the team." };
  return { data: data as HsOpponent };
}

export async function updateOpponent(
  id: string,
  patch: {
    status?: HsOpponentStatus;
    level_id?: string | null;
    contact_id?: string | null;
    name?: string;
    our_score?: number | null;
    their_score?: number | null;
    note?: string | null;
  }
): Promise<Result<HsOpponent>> {
  const gate = await requireHsPlanner();
  if ("error" in gate) return { error: gate.error };
  const row: Record<string, unknown> = { updated_by: gate.userId };
  if (patch.status !== undefined) {
    if (!isOpponentStatus(patch.status)) return { error: "Pick confirmed, on the fence or not coming." };
    row.status = patch.status;
  }
  if (patch.level_id !== undefined) row.level_id = patch.level_id;
  if (patch.contact_id !== undefined) row.contact_id = patch.contact_id;
  if (patch.name !== undefined) {
    const name = text(patch.name, 120);
    if (!name) return { error: "The team needs a name." };
    row.name = name;
  }
  if (patch.our_score !== undefined || patch.their_score !== undefined) {
    const ours = score(patch.our_score);
    const theirs = score(patch.their_score);
    row.our_score = ours != null && theirs != null ? ours : null;
    row.their_score = ours != null && theirs != null ? theirs : null;
  }
  if (patch.note !== undefined) row.note = text(patch.note, 300);
  const supabase = await createClient();
  const { data, error } = await supabase.from("hs_opponents").update(row).eq("id", id).select(OPPONENT_COLUMNS).single();
  if (error || !data) return { error: error?.message ?? "Couldn't save the team." };
  return { data: data as HsOpponent };
}

export async function deleteOpponent(id: string): Promise<Result<null>> {
  const gate = await requireHsPlanner();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase.from("hs_opponents").delete().eq("id", id);
  return error ? { error: error.message } : { data: null };
}

// ─── Weekends ───────────────────────────────────────────────────────────────

function weekendRow(input: HsWeekendInput): { error: string } | Record<string, unknown> {
  if (!isYmd(input.starts_on)) return { error: "Pick the first day." };
  const ends = input.ends_on && isYmd(input.ends_on) ? input.ends_on : input.starts_on;
  const span = daysBetween(input.starts_on, ends);
  if (span < 0) return { error: "The last day can't be before the first." };
  if (span > 14) return { error: "A weekend on the schedule can run two weeks at most." };
  if (!isWeekendStatus(input.status)) return { error: "Pick a status." };
  return {
    starts_on: input.starts_on,
    ends_on: ends,
    event: text(input.event, 300) ?? "",
    details: longText(input.details, 4000),
    location: text(input.location, 120),
    trip: text(input.trip, 60),
    status: input.status,
    notes: longText(input.notes, 1000),
    facility_contact_id: input.facility_contact_id || null,
  };
}

export async function saveWeekend(
  seasonId: string,
  id: string | null,
  input: HsWeekendInput
): Promise<Result<HsWeekend>> {
  const gate = await requireHsPlanner();
  if ("error" in gate) return { error: gate.error };
  const row = weekendRow(input);
  if ("error" in row) return { error: row.error as string };
  const supabase = await createClient();
  const q = id
    ? supabase.from("hs_weekends").update({ ...row, updated_by: gate.userId }).eq("id", id)
    : supabase
        .from("hs_weekends")
        .insert({ ...row, season_id: seasonId, created_by: gate.userId, updated_by: gate.userId });
  const { data, error } = await q.select(WEEKEND_COLUMNS).single();
  if (error || !data) return { error: error?.message ?? "Couldn't save the weekend." };
  return { data: data as HsWeekend };
}

export async function deleteWeekend(id: string): Promise<Result<null>> {
  const gate = await requireHsPlanner();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase.from("hs_weekends").delete().eq("id", id);
  return error ? { error: error.message } : { data: null };
}

// ─── Our teams (the columns) ────────────────────────────────────────────────

export async function saveLevel(seasonId: string, id: string | null, input: HsLevelInput): Promise<Result<HsLevel>> {
  const gate = await requireHsPlanner();
  if ("error" in gate) return { error: gate.error };
  const label = text(input.label, 12);
  if (!label) return { error: "Give the column a short label, like V or JV1." };
  const row = { label, name: text(input.name, 60), team_id: input.team_id || null, hidden: !!input.hidden };
  const supabase = await createClient();
  let sort = 0;
  if (!id) {
    const { data: last } = await supabase
      .from("hs_levels")
      .select("sort_order")
      .eq("season_id", seasonId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    sort = ((last as { sort_order: number } | null)?.sort_order ?? 0) + 10;
  }
  const q = id
    ? supabase.from("hs_levels").update(row).eq("id", id)
    : supabase.from("hs_levels").insert({ ...row, season_id: seasonId, sort_order: sort });
  const { data, error } = await q.select(LEVEL_COLUMNS).single();
  if (error || !data) return { error: error?.message ?? "Couldn't save the column." };
  revalidatePath("/portal/schedule");
  return { data: data as HsLevel };
}

export async function deleteLevel(id: string): Promise<Result<null>> {
  const gate = await requireHsPlanner();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase.from("hs_levels").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/portal/schedule");
  return { data: null };
}

// Swap a column with its neighbor.
export async function moveLevel(id: string, direction: -1 | 1): Promise<Result<null>> {
  const gate = await requireHsPlanner();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { data: me } = await supabase.from("hs_levels").select("id, season_id, sort_order").eq("id", id).maybeSingle();
  if (!me) return { error: "That column is gone." };
  const { data: all } = await supabase
    .from("hs_levels")
    .select("id, sort_order")
    .eq("season_id", (me as { season_id: string }).season_id)
    .order("sort_order")
    .order("label");
  const list = (all as { id: string; sort_order: number }[] | null) ?? [];
  const i = list.findIndex((l) => l.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= list.length) return { data: null };
  [list[i], list[j]] = [list[j], list[i]];
  for (let k = 0; k < list.length; k++) {
    const want = (k + 1) * 10;
    if (list[k].sort_order === want) continue;
    const { error } = await supabase.from("hs_levels").update({ sort_order: want }).eq("id", list[k].id);
    if (error) return { error: error.message };
  }
  revalidatePath("/portal/schedule");
  return { data: null };
}

// ─── Seasons ────────────────────────────────────────────────────────────────

export async function updateSeason(id: string, input: { notes: string | null }): Promise<Result<null>> {
  const gate = await requireHsPlanner();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase.from("hs_seasons").update({ notes: longText(input.notes, 4000) }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/portal/schedule");
  return { data: null };
}

// A new season, empty or started from another one: the same weekends 52
// weeks on (same days of the week), the same events and places, as planned;
// the same columns and games; the teams that came, now on the fence. Results,
// tossed teams and canceled weekends aren't carried.
export async function createSeason(input: { season: number; fromSeasonId: string | null }): Promise<Result<{ id: string }>> {
  const planner = await requireHsPlanner();
  if ("error" in planner) return { error: planner.error };
  const staff = await requireStaff();
  if ("error" in staff) return { error: "Only the board can add a season." };
  if (!Number.isInteger(input.season) || input.season < 2000 || input.season > 2100) return { error: "Pick a season." };
  const supabase = await createClient();
  const userId = planner.userId;
  const seasonId = crypto.randomUUID();
  const { error: sErr } = await supabase
    .from("hs_seasons")
    .insert({ id: seasonId, season: input.season, created_by: userId });
  if (sErr) {
    return { error: sErr.code === "23505" ? "That season is already on the schedule." : sErr.message };
  }
  if (input.fromSeasonId) {
    const err = await copySeason(supabase, input.fromSeasonId, seasonId, input.season, userId);
    if (err) {
      await supabase.from("hs_seasons").delete().eq("id", seasonId);
      return { error: err };
    }
  }
  revalidatePath("/portal/schedule");
  return { data: { id: seasonId } };
}

async function copySeason(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fromId: string,
  toId: string,
  toSeason: number,
  userId: string
): Promise<string | null> {
  const [{ data: from }, { data: levels }, { data: weekends }] = await Promise.all([
    supabase.from("hs_seasons").select("season, title").eq("id", fromId).maybeSingle(),
    supabase.from("hs_levels").select(LEVEL_COLUMNS).eq("season_id", fromId),
    supabase.from("hs_weekends").select(WEEKEND_COLUMNS).eq("season_id", fromId),
  ]);
  if (!from) return "The season to start from is gone.";
  const apart = toSeason - (from as { season: number }).season;
  await supabase.from("hs_seasons").update({ title: (from as { title: string }).title }).eq("id", toId);
  const levelMap = new Map<string, string>();
  const newLevels = ((levels as HsLevel[] | null) ?? []).map((l) => {
    const id = crypto.randomUUID();
    levelMap.set(l.id, id);
    // A Directory team belongs to its own season, so the link isn't carried.
    return { id, season_id: toId, label: l.label, name: l.name, hidden: l.hidden, sort_order: l.sort_order };
  });
  const weekendMap = new Map<string, string>();
  const newWeekends: Record<string, unknown>[] = [];
  for (const w of (weekends as HsWeekend[] | null) ?? []) {
    const carried = carryWeekend(w, apart);
    if (!carried) continue;
    const id = crypto.randomUUID();
    weekendMap.set(w.id, id);
    newWeekends.push({
      id,
      season_id: toId,
      starts_on: carried.starts_on,
      ends_on: carried.ends_on,
      event: carried.event,
      details: carried.details,
      location: carried.location,
      trip: carried.trip,
      status: carried.status,
      // Where we played is likely where we'll play, but it isn't booked yet.
      notes: carried.notes?.replace(/^secured\s+/i, "") || null,
      facility_contact_id: carried.facility_contact_id,
      sort_order: carried.sort_order,
      created_by: userId,
      updated_by: userId,
    });
  }
  const ids = [...weekendMap.keys()];
  const [{ data: games }, { data: opps }] = ids.length
    ? await Promise.all([
        supabase.from("hs_weekend_games").select("weekend_id, level_id, games, unsure, note").in("weekend_id", ids),
        supabase.from("hs_opponents").select(OPPONENT_COLUMNS).in("weekend_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const newGames = ((games as HsGames[] | null) ?? [])
    .filter((g) => levelMap.has(g.level_id))
    .map((g) => ({
      weekend_id: weekendMap.get(g.weekend_id),
      level_id: levelMap.get(g.level_id),
      games: g.games,
      unsure: g.unsure,
      note: g.note,
      updated_by: userId,
    }));
  // The same team on the same weekend once, event-wide rows and per-team rows
  // kept as they were; results start over.
  const seen = new Set<string>();
  const newOpps: Record<string, unknown>[] = [];
  for (const o of (opps as HsOpponent[] | null) ?? []) {
    if (o.status === "declined") continue;
    const key = `${o.weekend_id}|${o.level_id ?? "*"}|${o.contact_id ?? o.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (o.level_id && !levelMap.has(o.level_id)) continue;
    newOpps.push({
      weekend_id: weekendMap.get(o.weekend_id),
      level_id: o.level_id ? levelMap.get(o.level_id) : null,
      contact_id: o.contact_id,
      name: o.name,
      status: "tentative",
      sort_order: o.sort_order,
      created_by: userId,
      updated_by: userId,
    });
  }
  for (const [table, rows] of [
    ["hs_levels", newLevels],
    ["hs_weekends", newWeekends],
    ["hs_weekend_games", newGames],
    ["hs_opponents", newOpps],
  ] as const) {
    if (!rows.length) continue;
    const { error } = await supabase.from(table).insert(rows as Record<string, unknown>[]);
    if (error) return error.message;
  }
  return null;
}

export async function deleteSeason(id: string): Promise<Result<null>> {
  const planner = await requireHsPlanner();
  if ("error" in planner) return { error: planner.error };
  const staff = await requireStaff();
  if ("error" in staff) return { error: "Only the board can delete a season." };
  const supabase = await createClient();
  const { error } = await supabase.from("hs_seasons").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/portal/schedule");
  return { data: null };
}
