// Server-only: Stats page data and who can use it.

import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import { getViewer, viewerIsCoach, type Viewer } from "../auth/viewer";
import type { SavedLine } from "./season.ts";
import {
  GAME_COLS,
  LINE_COLS,
  PHOTO_LINK_TTL_S,
  SCOREBOOK_BUCKET,
  type RosterPlayer,
  type StatsBook,
  type StatsGame,
  type StatsLine,
  type StatsTeam,
} from "./types.ts";

// The board, coaches and Teams & volunteers: the same people as
// can_edit_stats() (0172).
export async function canEditStats(viewer: Viewer | null): Promise<boolean> {
  if (!viewer) return false;
  if (viewer.isStaff || viewer.canManageTeams) return true;
  return viewerIsCoach(viewer);
}

export async function requireStatsEditor(): Promise<{ userId: string } | { error: string }> {
  const viewer = await getViewer();
  if (!viewer) return { error: "You must be signed in." };
  if (!(await canEditStats(viewer))) return { error: "Only coaches and the board can work with stats." };
  return { userId: viewer.userId };
}

// This season's teams, in Directory order.
export async function loadSeasonTeams(): Promise<StatsTeam[]> {
  const admin = createAdminClient();
  const { data: board } = await admin
    .from("olb_boards")
    .select("id")
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!board) return [];
  const { data } = await admin
    .from("olb_teams")
    .select("id, name")
    .eq("board_id", board.id)
    .order("sort_order")
    .order("name");
  return ((data as StatsTeam[] | null) ?? []).map((t) => ({ id: t.id, name: t.name }));
}

export async function loadTeamName(teamId: string | null): Promise<string> {
  if (!teamId) return "";
  const { data } = await createAdminClient().from("olb_teams").select("name").eq("id", teamId).maybeSingle();
  return (data as { name: string } | null)?.name ?? "";
}

export async function loadRoster(teamId: string | null): Promise<RosterPlayer[]> {
  if (!teamId) return [];
  const { data, error } = await createAdminClient()
    .from("olb_players")
    .select("id, full_name, jersey_number")
    .eq("team_id", teamId)
    .order("sort_order")
    .order("full_name");
  if (error) throw new Error(error.message);
  return ((data as { id: string; full_name: string | null; jersey_number: string | null }[] | null) ?? [])
    .map((p) => ({ id: p.id, name: (p.full_name ?? "").trim(), jersey: p.jersey_number }))
    .filter((p) => p.name);
}

export async function playerNames(ids: string[]): Promise<Map<string, { name: string; jersey: string | null }>> {
  const out = new Map<string, { name: string; jersey: string | null }>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return out;
  const { data } = await createAdminClient().from("olb_players").select("id, full_name, jersey_number").in("id", unique);
  for (const p of (data as { id: string; full_name: string | null; jersey_number: string | null }[] | null) ?? []) {
    out.set(p.id, { name: (p.full_name ?? "").trim(), jersey: p.jersey_number });
  }
  return out;
}

export interface TeamSeason {
  games: StatsGame[];
  lines: SavedLine[];
}

export async function loadTeamSeason(teamId: string): Promise<TeamSeason> {
  const db = await createClient();
  const { data, error } = await db
    .from("stats_games")
    .select(GAME_COLS)
    .eq("team_id", teamId)
    .order("game_date", { ascending: false })
    .order("game_no", { ascending: false });
  if (error) throw new Error(error.message);
  const games = (data as StatsGame[] | null) ?? [];
  const saved = games.filter((g) => g.status === "saved").map((g) => g.id);
  let lines: SavedLine[] = [];
  if (saved.length) {
    const { data: rows, error: lineErr } = await db.from("stats_lines").select(LINE_COLS).in("game_id", saved);
    if (lineErr) throw new Error(lineErr.message);
    lines = (rows as SavedLine[] | null) ?? [];
  }
  return { games, lines };
}

export interface GameView {
  game: StatsGame;
  lines: StatsLine[];
  books: StatsBook[];
  roster: RosterPlayer[];
  teamName: string;
  filmId: string | null;
  event: string | null;
  sameDay: StatsGame[];
}

export async function loadGame(id: string): Promise<GameView | null> {
  const db = await createClient();
  const { data } = await db.from("stats_games").select(GAME_COLS).eq("id", id).maybeSingle();
  const game = data as StatsGame | null;
  if (!game) return null;
  const [linesRes, booksRes, roster, teamName, filmId, event, sameDayRes] = await Promise.all([
    db.from("stats_lines").select(LINE_COLS).eq("game_id", id).order("sort_order"),
    db.from("stats_books").select("id, status, error, photo_path, read").eq("game_id", id).order("created_at"),
    loadRoster(game.team_id),
    loadTeamName(game.team_id),
    findFilm(game),
    findWeekendEvent(game),
    game.team_id
      ? db.from("stats_games").select(GAME_COLS).eq("team_id", game.team_id).eq("game_date", game.game_date).order("game_no")
      : Promise.resolve({ data: [] }),
  ]);
  const bookRows = (booksRes.data as { id: string; status: StatsBook["status"]; error: string | null; photo_path: string; read: { players?: { name?: string; number?: string; unsure?: string }[] } | null }[] | null) ?? [];
  const urls = new Map<string, string>();
  if (bookRows.length) {
    const { data: signed } = await createAdminClient()
      .storage.from(SCOREBOOK_BUCKET)
      .createSignedUrls(bookRows.map((b) => b.photo_path), PHOTO_LINK_TTL_S);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  const books: StatsBook[] = bookRows.map((b) => ({
    id: b.id,
    status: b.status,
    error: b.error,
    photo_url: urls.get(b.photo_path) ?? null,
    unsure: (b.read?.players ?? [])
      .filter((p) => p.unsure?.trim())
      .map((p) => `${p.name || `#${p.number}`}: ${p.unsure!.trim()}`),
  }));
  return {
    game,
    lines: (linesRes.data as StatsLine[] | null) ?? [],
    books,
    roster,
    teamName,
    filmId,
    event,
    sameDay: (sameDayRes.data as StatsGame[] | null) ?? [],
  };
}

// The Film upload for the same team, date and opponent, if there is one.
async function findFilm(game: StatsGame): Promise<string | null> {
  if (!game.team_id || !game.opponent) return null;
  const { data } = await createAdminClient()
    .from("game_film_uploads")
    .select("id")
    .eq("team_id", game.team_id)
    .eq("game_date", game.game_date)
    .ilike("opponent", game.opponent.replace(/[%_\\]/g, "\\$&"))
    .order("created_at", { ascending: false })
    .limit(1);
  return ((data as { id: string }[] | null) ?? [])[0]?.id ?? null;
}

// The HS Schedule weekend this team played that day, by name.
async function findWeekendEvent(game: StatsGame): Promise<string | null> {
  if (!game.team_id) return null;
  const admin = createAdminClient();
  const { data: levels } = await admin.from("hs_levels").select("season_id").eq("team_id", game.team_id);
  const seasons = [...new Set(((levels as { season_id: string }[] | null) ?? []).map((l) => l.season_id))];
  if (!seasons.length) return null;
  const { data } = await admin
    .from("hs_weekends")
    .select("event")
    .in("season_id", seasons)
    .lte("starts_on", game.game_date)
    .gte("ends_on", game.game_date)
    .limit(1);
  const event = ((data as { event: string }[] | null) ?? [])[0]?.event?.trim();
  return event || null;
}

export interface PlayerView {
  player: { id: string; name: string; jersey: string | null; team_id: string | null };
  teamName: string;
  games: StatsGame[];
  lines: SavedLine[];
  teamNames: Map<string, string>;
}

export async function loadPlayer(id: string): Promise<PlayerView | null> {
  const admin = createAdminClient();
  const { data: p } = await admin.from("olb_players").select("id, full_name, jersey_number, team_id").eq("id", id).maybeSingle();
  const row = p as { id: string; full_name: string | null; jersey_number: string | null; team_id: string | null } | null;
  if (!row) return null;
  const db = await createClient();
  const { data: lineRows, error } = await db.from("stats_lines").select(LINE_COLS).eq("player_id", id);
  if (error) throw new Error(error.message);
  const allLines = (lineRows as SavedLine[] | null) ?? [];
  const gameIds = [...new Set(allLines.map((l) => l.game_id))];
  let games: StatsGame[] = [];
  if (gameIds.length) {
    const { data: g } = await db
      .from("stats_games")
      .select(GAME_COLS)
      .in("id", gameIds)
      .eq("status", "saved")
      .order("game_date", { ascending: false })
      .order("game_no", { ascending: false });
    games = (g as StatsGame[] | null) ?? [];
  }
  const savedIds = new Set(games.map((g) => g.id));
  const teamIds = [...new Set([row.team_id, ...games.map((g) => g.team_id)].filter((t): t is string => !!t))];
  const teamNames = new Map<string, string>();
  if (teamIds.length) {
    const { data: t } = await admin.from("olb_teams").select("id, name").in("id", teamIds);
    for (const team of (t as { id: string; name: string }[] | null) ?? []) teamNames.set(team.id, team.name);
  }
  return {
    player: { id: row.id, name: (row.full_name ?? "").trim(), jersey: row.jersey_number, team_id: row.team_id },
    teamName: row.team_id ? (teamNames.get(row.team_id) ?? "") : "",
    games,
    lines: allLines.filter((l) => savedIds.has(l.game_id)),
    teamNames,
  };
}
