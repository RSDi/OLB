import { createClient } from "../supabase/server";
import { getViewer } from "../auth/viewer";
import {
  DEFAULT_AGE_CAPS,
  DEFAULT_SEASON_ENDS_ON,
  isIsoDate,
  type AgeCap,
  type EligibilityContext,
  type ScheduledWeekend,
} from "./eligibility.ts";
import { loadCurrentBoard } from "./volunteer-data.ts";

export type { EligibilityContext };

const CAP_COLUMNS = "id, age_group, max_age, sort_order";

// Staff-only. Anyone else gets null — birthdates and eligibility stay off
// their Directory. Missing 0140 columns/tables fall back to the seeded
// defaults so a deploy ahead of the SQL editor paste still renders.
export async function loadEligibilityContext(): Promise<EligibilityContext | null> {
  const viewer = await getViewer();
  if (!viewer?.isStaff) return null;
  const board = await loadCurrentBoard();
  if (!board) return null;

  const supabase = await createClient();
  const [{ data: boardRow, error: boardError }, { data: capRows, error: capError }, weekends] = await Promise.all([
    supabase.from("olb_boards").select("id, season, season_ends_on").eq("id", board.id).maybeSingle(),
    supabase.from("olb_age_caps").select(CAP_COLUMNS).eq("board_id", board.id).order("sort_order").order("age_group"),
    loadScheduledWeekends(supabase),
  ]);

  const ends = !boardError && boardRow && isIsoDate((boardRow as { season_ends_on?: string | null }).season_ends_on)
    ? (boardRow as { season_ends_on: string }).season_ends_on
    : DEFAULT_SEASON_ENDS_ON;
  const caps =
    !capError && capRows && capRows.length > 0
      ? (capRows as AgeCap[])
      : DEFAULT_AGE_CAPS.map((c) => ({ ...c }));

  return {
    boardId: board.id,
    season: board.season,
    seasonEndsOn: ends,
    caps,
    weekends,
  };
}

// HS Schedule weekends where at least one of our teams (linked via
// hs_levels.team_id) has games. Clock times aren't stored; "same time" here
// means the same weekend on the schedule.
async function loadScheduledWeekends(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<ScheduledWeekend[]> {
  const { data: seasons } = await supabase.from("hs_seasons").select("id").order("season", { ascending: false }).limit(1);
  const seasonId = (seasons as { id: string }[] | null)?.[0]?.id;
  if (!seasonId) return [];

  const [{ data: levels }, { data: weekends }, { data: games }] = await Promise.all([
    supabase.from("hs_levels").select("id, team_id").eq("season_id", seasonId).not("team_id", "is", null),
    supabase.from("hs_weekends").select("id, event, starts_on, ends_on").eq("season_id", seasonId),
    supabase.from("hs_weekend_games").select("weekend_id, level_id, games"),
  ]);

  const teamByLevel = new Map(
    ((levels as { id: string; team_id: string }[] | null) ?? [])
      .filter((l) => l.team_id)
      .map((l) => [l.id, l.team_id])
  );
  if (teamByLevel.size === 0) return [];

  const playing = new Map<string, Set<string>>();
  for (const g of (games as { weekend_id: string; level_id: string; games: number | null }[] | null) ?? []) {
    if (g.games == null || g.games <= 0) continue;
    const teamId = teamByLevel.get(g.level_id);
    if (!teamId) continue;
    const set = playing.get(g.weekend_id) ?? new Set<string>();
    set.add(teamId);
    playing.set(g.weekend_id, set);
  }

  return ((weekends as { id: string; event: string; starts_on: string; ends_on: string }[] | null) ?? [])
    .map((w) => {
      const teamIds = [...(playing.get(w.id) ?? [])];
      if (teamIds.length < 2) return null;
      const label = (w.event || "").trim() || `${w.starts_on}–${w.ends_on}`;
      return { id: w.id, label, teamIds } satisfies ScheduledWeekend;
    })
    .filter((w): w is ScheduledWeekend => !!w);
}
