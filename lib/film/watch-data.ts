// Server side of the team film page. Reads through the admin client after
// checking the team has its watch page on; nothing here needs a login.

import { listFilmMarkers } from "./markers.ts";
import { getFilmTeamBySlug, type FilmTeamRow } from "./teams.ts";
import { getFilmUpload, listFilmUploads } from "./uploads.ts";
import { toWatchGames, watchSource, type WatchGame } from "./watch.ts";
import type { FilmMarker } from "./player-logic.ts";
import type { FilmUpload } from "./types.ts";

/** The team behind /watch/<slug>, only when its film page is on. */
export async function getWatchTeam(slug: string): Promise<FilmTeamRow | null> {
  const team = await getFilmTeamBySlug(slug);
  if (!team || !team.hasSlug || !team.watchPublic) return null;
  return team;
}

export async function loadWatchPage(slug: string): Promise<{
  team: FilmTeamRow;
  games: WatchGame[];
  markers: Record<string, FilmMarker[]>;
} | null> {
  const team = await getWatchTeam(slug);
  if (!team) return null;
  const uploads = await listFilmUploads([team.id]);
  const games = toWatchGames(uploads);
  let markers: Record<string, FilmMarker[]> = {};
  try {
    markers = await listFilmMarkers(games.map((g) => g.id));
  } catch {
    markers = {};
  }
  return { team, games, markers };
}

/** An upload the team page may play from the original file, or null. */
export async function getWatchFileUpload(slug: string, uploadId: string): Promise<FilmUpload | null> {
  const team = await getWatchTeam(slug);
  if (!team) return null;
  const row = await getFilmUpload(uploadId);
  if (!row || row.team_id !== team.id) return null;
  const source = watchSource(row);
  if (!source || source.kind !== "file") return null;
  return row;
}
