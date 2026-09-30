// Server-side loaders for the HS Schedule. Everything runs under the
// caller's RLS: coaches and the board read the schedule (0108); only the
// board reads External Contacts, so for coaches the linked programs come back
// empty and the names stored on the schedule stand in.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  HsContactOption,
  HsContactRef,
  HsGames,
  HsLevel,
  HsOpponent,
  HsSeason,
  HsSeasonSchedule,
  HsWeekend,
} from "./types";

const SEASON_COLUMNS = "id, season, title, notes, imported_from, imported_at";
const LEVEL_COLUMNS = "id, season_id, label, name, team_id, hidden, sort_order";
const WEEKEND_COLUMNS =
  "id, season_id, starts_on, ends_on, event, details, location, trip, status, notes, facility_contact_id, sort_order, updated_at, updated_by";
const GAMES_COLUMNS = "weekend_id, level_id, games, unsure, note";
const OPPONENT_COLUMNS =
  "id, weekend_id, level_id, contact_id, name, status, our_score, their_score, note, sort_order";
const CONTACT_REF_COLUMNS = "id, name, nickname, city, state, team_colors, email, phone";

// Every season, newest first. ok: false when migration 0108 isn't in yet.
export async function loadHsSeasons(supabase: SupabaseClient): Promise<{ ok: boolean; seasons: HsSeason[] }> {
  const { data, error } = await supabase.from("hs_seasons").select(SEASON_COLUMNS).order("season", { ascending: false });
  if (error) return { ok: false, seasons: [] };
  return { ok: true, seasons: (data as HsSeason[] | null) ?? [] };
}

async function inChunks<T>(ids: string[], run: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 150) out.push(...(await run(ids.slice(i, i + 150))));
  return out;
}

export async function loadHsSeasonSchedule(supabase: SupabaseClient, season: HsSeason): Promise<HsSeasonSchedule> {
  const [{ data: levels }, { data: weekends }] = await Promise.all([
    supabase.from("hs_levels").select(LEVEL_COLUMNS).eq("season_id", season.id).order("sort_order").order("label"),
    supabase.from("hs_weekends").select(WEEKEND_COLUMNS).eq("season_id", season.id).order("starts_on").order("sort_order"),
  ]);
  const ws = (weekends as HsWeekend[] | null) ?? [];
  const ids = ws.map((w) => w.id);
  const [games, opponents] = await Promise.all([
    inChunks(ids, async (chunk) => {
      const { data } = await supabase.from("hs_weekend_games").select(GAMES_COLUMNS).in("weekend_id", chunk);
      return (data as HsGames[] | null) ?? [];
    }),
    inChunks(ids, async (chunk) => {
      const { data } = await supabase
        .from("hs_opponents")
        .select(OPPONENT_COLUMNS)
        .in("weekend_id", chunk)
        .order("sort_order")
        .order("name");
      return (data as HsOpponent[] | null) ?? [];
    }),
  ]);
  const contactIds = [
    ...new Set([
      ...opponents.map((o) => o.contact_id),
      ...ws.map((w) => w.facility_contact_id),
    ].filter((x): x is string => !!x)),
  ];
  const contacts = await loadContactRefs(supabase, contactIds);
  return { season, levels: (levels as HsLevel[] | null) ?? [], weekends: ws, games, opponents, contacts };
}

// The programs and facilities the schedule points at, as far as the caller
// may read them (board: all; coaches: none).
export async function loadContactRefs(supabase: SupabaseClient, ids: string[]): Promise<HsContactRef[]> {
  if (ids.length === 0) return [];
  return inChunks(ids, async (chunk) => {
    const { data } = await supabase.from("contacts").select(CONTACT_REF_COLUMNS).in("id", chunk).is("deleted_at", null);
    return (data as HsContactRef[] | null) ?? [];
  });
}

// Companies the "Add a team" and facility pickers offer, with their type.
// RLS: all of them for the board; for a coach, the types shared with coaches
// (0109). Anything else is added by name.
export async function loadHsContactOptions(supabase: SupabaseClient): Promise<HsContactOption[]> {
  const { data, error } = await supabase
    .from("contacts")
    .select("id, name, nickname, aliases, city, state, category:contact_categories(name)")
    .eq("kind", "company")
    .is("deleted_at", null)
    .order("name");
  if (error) {
    // Before 0107 (no aliases/city/state): the names alone.
    const { data: plain } = await supabase
      .from("contacts")
      .select("id, name, nickname, category:contact_categories(name)")
      .eq("kind", "company")
      .is("deleted_at", null)
      .order("name");
    return ((plain as unknown as { id: string; name: string; nickname: string | null; category: { name: string } | null }[] | null) ?? []).map(
      (c) => ({ id: c.id, name: c.name, nickname: c.nickname, aliases: [], city: null, state: null, category: c.category?.name ?? null })
    );
  }
  return (
    (data as unknown as {
      id: string;
      name: string;
      nickname: string | null;
      aliases: string[] | null;
      city: string | null;
      state: string | null;
      category: { name: string } | null;
    }[] | null) ?? []
  ).map((c) => ({
    id: c.id,
    name: c.name,
    nickname: c.nickname,
    aliases: c.aliases ?? [],
    city: c.city,
    state: c.state,
    category: c.category?.name ?? null,
  }));
}

// Teams already on any season's schedule (name + linked program), so a coach
// who can't open External Contacts still picks the same program again.
export async function loadKnownTeams(supabase: SupabaseClient): Promise<{ name: string; contact_id: string | null }[]> {
  const { data } = await supabase.from("hs_opponents").select("name, contact_id").limit(5000);
  const seen = new Map<string, { name: string; contact_id: string | null }>();
  for (const r of (data as { name: string; contact_id: string | null }[] | null) ?? []) {
    const key = r.contact_id ?? `name:${r.name.trim().toLowerCase()}`;
    if (!seen.has(key)) seen.set(key, r);
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ─── A contact's history on the schedule ────────────────────────────────────

export interface ContactScheduleRow {
  weekendId: string;
  season: number;
  starts_on: string;
  ends_on: string;
  event: string;
  status: HsWeekend["status"];
  // How the contact is on it: a team coming (with our teams, status and
  // results), or the venue.
  as: "team" | "facility";
  levels: string[]; // our teams' labels; empty = every team
  teamStatus: HsOpponent["status"] | null;
  results: string[]; // "V: W 71–40"
}

// Every weekend a program came to (or a facility hosted), newest first. The
// External Contacts page shows it; empty when 0108 isn't in yet.
export async function loadContactScheduleHistory(
  supabase: SupabaseClient,
  contactId: string
): Promise<ContactScheduleRow[]> {
  const [{ data: opp, error }, { data: fac }] = await Promise.all([
    supabase
      .from("hs_opponents")
      .select("weekend_id, level_id, status, our_score, their_score")
      .eq("contact_id", contactId),
    supabase.from("hs_weekends").select("id").eq("facility_contact_id", contactId),
  ]);
  if (error) return [];
  const opponents = (opp as Pick<HsOpponent, "weekend_id" | "level_id" | "status" | "our_score" | "their_score">[] | null) ?? [];
  const facilityIds = ((fac as { id: string }[] | null) ?? []).map((w) => w.id);
  const weekendIds = [...new Set([...opponents.map((o) => o.weekend_id), ...facilityIds])];
  if (weekendIds.length === 0) return [];
  const { data: ws } = await supabase
    .from("hs_weekends")
    .select("id, season_id, starts_on, ends_on, event, status")
    .in("id", weekendIds);
  const weekends = (ws as (Pick<HsWeekend, "id" | "season_id" | "starts_on" | "ends_on" | "event" | "status">)[] | null) ?? [];
  const seasonIds = [...new Set(weekends.map((w) => w.season_id))];
  const [{ data: ss }, { data: ls }] = await Promise.all([
    supabase.from("hs_seasons").select("id, season").in("id", seasonIds),
    supabase.from("hs_levels").select("id, label").in("season_id", seasonIds),
  ]);
  const seasonOf = new Map(((ss as { id: string; season: number }[] | null) ?? []).map((s) => [s.id, s.season]));
  const labelOf = new Map(((ls as { id: string; label: string }[] | null) ?? []).map((l) => [l.id, l.label]));
  const rows: ContactScheduleRow[] = [];
  for (const w of weekends) {
    const mine = opponents.filter((o) => o.weekend_id === w.id);
    const season = seasonOf.get(w.season_id) ?? 0;
    if (mine.length) {
      const levels = mine.some((o) => !o.level_id)
        ? []
        : [...new Set(mine.map((o) => labelOf.get(o.level_id!) ?? "").filter(Boolean))];
      const status = mine.some((o) => o.status === "confirmed")
        ? "confirmed"
        : mine.some((o) => o.status === "tentative")
          ? "tentative"
          : "declined";
      const results = mine
        .filter((o) => o.our_score != null && o.their_score != null)
        .map((o) => {
          const r = o.our_score! > o.their_score! ? "W" : o.our_score! < o.their_score! ? "L" : "T";
          const lvl = o.level_id ? labelOf.get(o.level_id) : null;
          return `${lvl ? `${lvl}: ` : ""}${r} ${o.our_score}–${o.their_score}`;
        });
      rows.push({ weekendId: w.id, season, starts_on: w.starts_on, ends_on: w.ends_on, event: w.event, status: w.status, as: "team", levels, teamStatus: status, results });
    }
    if (facilityIds.includes(w.id)) {
      rows.push({ weekendId: w.id, season, starts_on: w.starts_on, ends_on: w.ends_on, event: w.event, status: w.status, as: "facility", levels: [], teamStatus: null, results: [] });
    }
  }
  return rows.sort((a, b) => b.starts_on.localeCompare(a.starts_on));
}
