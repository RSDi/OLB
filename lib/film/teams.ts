// Directory teams (olb_teams) that accept game-film uploads. Slugs are the
// /t/[slug] path. The shared code is a hash on the row (Settings → Film);
// teams without a hash, or with film_enabled false, stay off /film.

import { createAdminClient } from "../supabase/admin.ts";
import { teamLabel } from "../teams/volunteer-options.ts";
import type { FilmTeam } from "./types.ts";

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX = 40;

export type FilmTeamRow = FilmTeam & {
  id: string;
  boardId: string;
  enabled: boolean;
  hasCode: boolean;
  hasSlug: boolean;
  codeVersion: number;
  codeHash: string | null;
};

type TeamQueryRow = {
  id: string;
  board_id: string;
  name: string;
  age_group: string | null;
  film_slug: string | null;
  film_enabled: boolean | null;
  film_code_hash: string | null;
  film_code_version: number | null;
};

export function slugifyFilmTeam(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX);
}

export function filmSlugProblem(raw: string): string | null {
  const slug = raw.trim().toLowerCase();
  if (!slug) return "Pick an address for the family upload page.";
  if (!SLUG_RE.test(slug)) return "Use lowercase letters, numbers and hyphens.";
  if (slug.length > SLUG_MAX) return `Keep the address under ${SLUG_MAX} characters.`;
  return null;
}

function toFilmTeam(row: TeamQueryRow): FilmTeamRow {
  const stored = row.film_slug?.trim() || "";
  const slug = stored || slugifyFilmTeam(teamLabel(row)) || row.id.slice(0, 8);
  return {
    id: row.id,
    boardId: row.board_id,
    slug,
    label: teamLabel(row),
    enabled: !!row.film_enabled,
    hasCode: !!row.film_code_hash,
    hasSlug: !!stored,
    codeVersion: row.film_code_version ?? 1,
    codeHash: row.film_code_hash,
  };
}

const TEAM_COLS =
  "id, board_id, name, age_group, film_slug, film_enabled, film_code_hash, film_code_version";

async function currentBoardId(): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("olb_boards")
    .select("id")
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function listDirectoryFilmTeams(): Promise<{ season: string | null; teams: FilmTeamRow[] }> {
  const admin = createAdminClient();
  const { data: board } = await admin
    .from("olb_boards")
    .select("id, season")
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!board) return { season: null, teams: [] };
  const { data, error } = await admin
    .from("olb_teams")
    .select(TEAM_COLS)
    .eq("board_id", board.id)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return {
    season: (board.season as string | null) ?? null,
    teams: ((data as TeamQueryRow[] | null) ?? []).map(toFilmTeam),
  };
}

export async function listEnabledFilmTeams(): Promise<FilmTeamRow[]> {
  const { teams } = await listDirectoryFilmTeams();
  return teams.filter((t) => t.enabled && t.hasCode && t.hasSlug);
}

export async function getFilmTeamBySlug(slug: string): Promise<FilmTeamRow | null> {
  const wanted = slug.trim().toLowerCase();
  if (!wanted || !SLUG_RE.test(wanted)) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.from("olb_teams").select(TEAM_COLS).eq("film_slug", wanted).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return toFilmTeam(data as TeamQueryRow);
}

export async function getFilmTeamById(id: string): Promise<FilmTeamRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("olb_teams").select(TEAM_COLS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return toFilmTeam(data as TeamQueryRow);
}

export async function listFilmManagerTeamIds(userId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("game_film_managers").select("team_id").eq("user_id", userId);
  if (error || !data) return [];
  return (data as { team_id: string }[]).map((r) => r.team_id);
}

export { currentBoardId };
