// Server side of the team film page. Reads through the admin client after
// checking the team has its watch page on and the link's key matches;
// nothing here needs a login.

import { timingSafeEqual } from "node:crypto";
import { listFilmMarkers } from "./markers.ts";
import { getFilmTeamBySlug, type FilmTeamRow } from "./teams.ts";
import { getFilmUpload, listFilmUploads } from "./uploads.ts";
import { parseWatchPageKey, toWatchGames, watchPageKey, watchSource, type WatchGame } from "./watch.ts";
import type { FilmMarker } from "./player-logic.ts";
import type { FilmUpload } from "./types.ts";

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * The team behind /watch/<slug>-<key>, only when its film page is on and
 * the key is the team's current one.
 */
export async function getWatchTeam(pageKey: string): Promise<FilmTeamRow | null> {
  const parsed = parseWatchPageKey(pageKey);
  if (!parsed) return null;
  const team = await getFilmTeamBySlug(parsed.slug);
  if (!team || !team.hasSlug || !team.watchPublic || !team.watchToken) return null;
  if (!sameToken(parsed.token, team.watchToken)) return null;
  return team;
}

export async function loadWatchPage(pageKey: string): Promise<{
  team: FilmTeamRow;
  pageKey: string;
  games: WatchGame[];
  markers: Record<string, FilmMarker[]>;
} | null> {
  const team = await getWatchTeam(pageKey);
  if (!team) return null;
  const uploads = await listFilmUploads([team.id]);
  const games = toWatchGames(uploads);
  let markers: Record<string, FilmMarker[]> = {};
  try {
    markers = await listFilmMarkers(games.map((g) => g.id));
  } catch {
    markers = {};
  }
  return { team, pageKey: watchPageKey(team.slug, team.watchToken), games, markers };
}

/** An upload the team page may play from the original file, or null. */
export async function getWatchFileUpload(pageKey: string, uploadId: string): Promise<FilmUpload | null> {
  const team = await getWatchTeam(pageKey);
  if (!team) return null;
  const row = await getFilmUpload(uploadId);
  if (!row || row.team_id !== team.id) return null;
  const source = watchSource(row);
  if (!source || source.kind !== "file") return null;
  return row;
}
