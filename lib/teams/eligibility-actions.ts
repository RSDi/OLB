"use server";

// Settings → Season: the season end date and the age-cap table. Board only
// (is_staff), matching RLS on olb_age_caps and set_season_ends_on() (0140).

import { revalidatePath } from "next/cache";
import { requireStaff } from "../auth/guards";
import { createClient } from "../supabase/server";
import { DEFAULT_AGE_CAPS, DEFAULT_SEASON_ENDS_ON, isIsoDate, type AgeCap, type AgeCapInput, type SeasonSettings } from "./eligibility";
import { loadCurrentBoard } from "./volunteer-data";

type SeasonSettingsResult = { error: string } | SeasonSettings;

function revalidate() {
  revalidatePath("/portal/directory", "layout");
  revalidatePath("/portal/settings");
}

export async function loadSeasonSettings(): Promise<SeasonSettingsResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const board = await loadCurrentBoard();
  if (!board) return { error: "No season set up yet." };
  const supabase = await createClient();
  const [{ data: row, error: boardError }, { data: caps, error: capError }] = await Promise.all([
    supabase.from("olb_boards").select("id, season, season_ends_on").eq("id", board.id).maybeSingle(),
    supabase.from("olb_age_caps").select("id, age_group, max_age, sort_order").eq("board_id", board.id).order("sort_order").order("age_group"),
  ]);
  if (boardError && /season_ends_on|schema cache|does not exist/i.test(boardError.message)) {
    return {
      boardId: board.id,
      season: board.season,
      seasonEndsOn: DEFAULT_SEASON_ENDS_ON,
      caps: DEFAULT_AGE_CAPS.map((c) => ({ ...c })),
    };
  }
  if (boardError) return { error: boardError.message };
  if (!row) return { error: "No season set up yet." };
  if (capError && !/schema cache|does not exist/i.test(capError.message)) return { error: capError.message };
  const ends = isIsoDate((row as { season_ends_on?: string | null }).season_ends_on)
    ? (row as { season_ends_on: string }).season_ends_on
    : DEFAULT_SEASON_ENDS_ON;
  const list = (caps as AgeCap[] | null) ?? [];
  return {
    boardId: board.id,
    season: board.season,
    seasonEndsOn: ends,
    caps: list.length > 0 ? list : DEFAULT_AGE_CAPS.map((c) => ({ ...c })),
  };
}

export async function saveSeasonEndDate(boardId: string, seasonEndsOn: string): Promise<{ error?: string }> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  if (!isIsoDate(seasonEndsOn)) return { error: "Pick a season end date." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_season_ends_on", { p_board_id: boardId, p_ends_on: seasonEndsOn });
  if (error) return { error: error.message };
  revalidate();
  return {};
}

export async function saveAgeCaps(boardId: string, rows: AgeCapInput[]): Promise<{ error?: string }> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const cleaned: { id?: string; age_group: string; max_age: number; sort_order: number }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const age_group = rows[i].age_group.trim();
    const max_age = Number(rows[i].max_age);
    if (!age_group && rows[i].max_age.trim() === "") continue;
    if (!age_group) return { error: "Every row needs a level (14U, 12U, 10U…)." };
    if (!Number.isInteger(max_age) || max_age < 1 || max_age > 25) {
      return { error: `${age_group}: max age must be a whole number from 1 to 25.` };
    }
    const key = age_group.toLowerCase();
    if (seen.has(key)) return { error: `${age_group} is listed twice.` };
    seen.add(key);
    cleaned.push({ id: rows[i].id, age_group, max_age, sort_order: (i + 1) * 10 });
  }
  if (cleaned.length === 0) return { error: "Add at least one age cap." };

  const supabase = await createClient();
  const { data: existing, error: loadError } = await supabase.from("olb_age_caps").select("id").eq("board_id", boardId);
  if (loadError) return { error: loadError.message };
  const keep = new Set(cleaned.map((c) => c.id).filter(Boolean));
  const remove = ((existing as { id: string }[] | null) ?? []).map((r) => r.id).filter((id) => !keep.has(id));
  if (remove.length) {
    const { error } = await supabase.from("olb_age_caps").delete().in("id", remove).eq("board_id", boardId);
    if (error) return { error: error.message };
  }
  for (const row of cleaned) {
    if (row.id) {
      const { error } = await supabase
        .from("olb_age_caps")
        .update({ age_group: row.age_group, max_age: row.max_age, sort_order: row.sort_order, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("board_id", boardId);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase.from("olb_age_caps").insert({
        board_id: boardId,
        age_group: row.age_group,
        max_age: row.max_age,
        sort_order: row.sort_order,
      });
      if (error) return { error: error.message };
    }
  }
  revalidate();
  return {};
}
