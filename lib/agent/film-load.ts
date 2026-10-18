// Database + storage reads for the agent film endpoints. Mapping lives in
// ./film.ts. Selects never ask for team codes, OAuth tokens, or hashes.

import { createAdminClient } from "../supabase/admin.ts";
import { filmStorage } from "../film/storage.ts";
import { teamLabel } from "../teams/volunteer-options.ts";
import { getYoutubeConnection } from "../film/youtube-settings.ts";
import { columnMissing, playlistColumnsMissing, relationMissing } from "./schema.ts";
import {
  looksLikeUuid,
  teamMatchesFilter,
  toAgentFilm,
  toAgentFilmHealth,
  youtubePrivacy,
  type AgentFilm,
  type AgentFilmHealth,
  type AgentFilmListQuery,
  type AgentFilmRow,
  type AgentTeamRow,
} from "./film.ts";

type TeamQueryRow = {
  id: string;
  name: string;
  age_group: string | null;
  film_slug: string | null;
  youtube_playlist_id?: string | null;
};

function toTeam(row: TeamQueryRow): AgentTeamRow {
  const slug = row.film_slug?.trim() || "";
  return {
    id: row.id,
    name: teamLabel(row),
    slug,
    playlistId: row.youtube_playlist_id?.trim() || null,
  };
}

export async function probePlaylistMigration(): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin.from("olb_teams").select("youtube_playlist_id").limit(1);
  if (!error) return true;
  if (playlistColumnsMissing(error.message) || columnMissing(error.message, "youtube_playlist_id")) return false;
  throw new Error(error.message);
}

async function loadTeams(withPlaylists: boolean): Promise<AgentTeamRow[]> {
  const admin = createAdminClient();
  const { data: board } = await admin
    .from("olb_boards")
    .select("id")
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!board) return [];
  if (withPlaylists) {
    const { data, error } = await admin
      .from("olb_teams")
      .select("id, name, age_group, film_slug, youtube_playlist_id")
      .eq("board_id", board.id)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data as TeamQueryRow[] | null) ?? []).map(toTeam);
  }
  const { data, error } = await admin
    .from("olb_teams")
    .select("id, name, age_group, film_slug")
    .eq("board_id", board.id)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data as TeamQueryRow[] | null) ?? []).map(toTeam);
}

function matchingTeams(teams: AgentTeamRow[], filter: string | null): AgentTeamRow[] {
  if (!filter) return [];
  return teams.filter((t) => teamMatchesFilter(t, filter));
}

function teamSlugsForFilter(teams: AgentTeamRow[], filter: string): string[] {
  return [...new Set(matchingTeams(teams, filter).map((t) => t.slug).filter(Boolean))];
}

async function loadUploads(
  query: AgentFilmListQuery,
  teams: AgentTeamRow[],
  withPlaylists: boolean,
): Promise<AgentFilmRow[]> {
  const admin = createAdminClient();
  const slugs = query.team && !looksLikeUuid(query.team) ? teamSlugsForFilter(teams, query.team) : [];

  if (withPlaylists) {
    let q = admin
      .from("game_film_uploads")
      .select(
        "id, team, team_id, storage_path, created_at, game_date, opponent, youtube_status, youtube_video_id, youtube_updated_at, youtube_playlist_id",
      )
      .order("game_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (query.from) q = q.gte("game_date", query.from);
    if (query.to) q = q.lte("game_date", query.to);
    if (query.team) {
      if (looksLikeUuid(query.team)) q = q.eq("team_id", query.team);
      else if (slugs.length > 0) q = q.in("team", slugs);
      else q = q.eq("team", query.team);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ((data ?? []) as AgentFilmRow[]).map((row) => ({
      ...row,
      youtube_playlist_id: row.youtube_playlist_id ?? null,
    }));
  }

  let q = admin
    .from("game_film_uploads")
    .select(
      "id, team, team_id, storage_path, created_at, game_date, opponent, youtube_status, youtube_video_id, youtube_updated_at",
    )
    .order("game_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (query.from) q = q.gte("game_date", query.from);
  if (query.to) q = q.lte("game_date", query.to);
  if (query.team) {
    if (looksLikeUuid(query.team)) q = q.eq("team_id", query.team);
    else if (slugs.length > 0) q = q.in("team", slugs);
    else q = q.eq("team", query.team);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Omit<AgentFilmRow, "youtube_playlist_id">[]).map((row) => ({
    ...row,
    youtube_playlist_id: null,
  }));
}

async function pathsInStorage(paths: string[]): Promise<Set<string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  const present = new Set<string>();
  const storage = filmStorage();
  const chunk = 8;
  for (let i = 0; i < unique.length; i += chunk) {
    const slice = unique.slice(i, i + chunk);
    const results = await Promise.all(
      slice.map(async (path) => {
        try {
          return { path, ok: await storage.objectExists(path) };
        } catch {
          return { path, ok: false };
        }
      }),
    );
    for (const r of results) if (r.ok) present.add(r.path);
  }
  return present;
}

export async function listAgentFilms(query: AgentFilmListQuery): Promise<AgentFilm[]> {
  const withPlaylists = await probePlaylistMigration();
  const teams = await loadTeams(withPlaylists);
  const rows = await loadUploads(query, teams, withPlaylists);
  const present = await pathsInStorage(rows.map((r) => r.storage_path));
  let privacy: ReturnType<typeof youtubePrivacy> = "unlisted";
  try {
    privacy = youtubePrivacy((await getYoutubeConnection()).privacyStatus);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (!relationMissing(message, "game_film_youtube")) throw err;
  }
  const byId = new Map(teams.map((t) => [t.id, t]));
  const bySlug = new Map(teams.filter((t) => t.slug).map((t) => [t.slug, t]));
  return rows.map((row) => {
    const team = (row.team_id && byId.get(row.team_id)) || bySlug.get(row.team);
    return toAgentFilm(row, {
      team,
      inStorage: present.has(row.storage_path),
      privacy,
    });
  });
}

async function countUploads(
  filter: { isNull?: boolean; in?: string[] },
): Promise<number> {
  const admin = createAdminClient();
  let q = admin.from("game_film_uploads").select("id", { count: "exact", head: true });
  if (filter.isNull) q = q.is("youtube_status", null);
  if (filter.in) q = q.in("youtube_status", filter.in);
  const { count, error } = await q;
  if (error) {
    if (relationMissing(error.message, "game_film_uploads")) return 0;
    throw new Error(error.message);
  }
  return count ?? 0;
}

export async function loadAgentFilmHealth(): Promise<AgentFilmHealth> {
  let youtube = {
    connected: false,
    channelTitle: null as string | null,
    connectedAt: null as string | null,
    defaultPrivacy: "unlisted" as ReturnType<typeof youtubePrivacy>,
  };
  try {
    const connection = await getYoutubeConnection();
    youtube = {
      connected: connection.connected,
      channelTitle: connection.channelTitle,
      connectedAt: connection.connectedAt,
      defaultPrivacy: youtubePrivacy(connection.privacyStatus),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (!relationMissing(message, "game_film_youtube")) throw err;
  }

  let migration0145Applied = false;
  try {
    migration0145Applied = await probePlaylistMigration();
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (!relationMissing(message, "olb_teams")) throw err;
  }

  const teams = await loadTeams(migration0145Applied).catch((err) => {
    const message = err instanceof Error ? err.message : "";
    if (relationMissing(message, "olb_teams")) return [] as AgentTeamRow[];
    throw err;
  });

  const [notSent, stuck, failed] = await Promise.all([
    countUploads({ isNull: true }),
    countUploads({ in: ["queued", "uploading"] }),
    countUploads({ in: ["failed"] }),
  ]);

  return toAgentFilmHealth({
    connected: youtube.connected,
    channelTitle: youtube.channelTitle,
    connectedAt: youtube.connectedAt,
    defaultPrivacy: youtube.defaultPrivacy,
    migration0145Applied,
    teams,
    notSent,
    stuck,
    failed,
  });
}
