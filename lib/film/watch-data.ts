// Server side of the team film page. Reads through the admin client after
// checking the team has its watch page on and the link's key matches;
// nothing here needs a login.

import { timingSafeEqual } from "node:crypto";
import { listFilmMarkers } from "./markers.ts";
import { getFilmTeamBySlug, listDirectoryFilmTeams, type FilmTeamRow } from "./teams.ts";
import { getFilmUpload, listFilmUploads } from "./uploads.ts";
import { parseWatchPageKey, watchGames, watchPageKey, watchSource, type WatchGame } from "./watch.ts";
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

export type WatchTeamLink = { pageKey: string; label: string };

/**
 * This season's teams with their film page on, in Directory order, for the
 * team switcher. Anyone with one team's link can reach the others this way;
 * the links still can't be guessed from outside.
 */
export async function listWatchTeams(): Promise<WatchTeamLink[]> {
  const { teams } = await listDirectoryFilmTeams();
  return teams
    .filter((t) => t.hasSlug && t.watchPublic && t.watchToken)
    .map((t) => ({ pageKey: watchPageKey(t.slug, t.watchToken), label: t.label }));
}

export async function loadWatchPage(pageKey: string): Promise<{
  team: FilmTeamRow;
  pageKey: string;
  teams: WatchTeamLink[];
  games: WatchGame[];
  markers: Record<string, FilmMarker[]>;
  /** A streamed video's id → the recording that replaced it, for old links. */
  replacedBy: Record<string, string>;
} | null> {
  const team = await getWatchTeam(pageKey);
  if (!team) return null;
  const ownKey = watchPageKey(team.slug, team.watchToken);
  let teams: WatchTeamLink[] = [];
  try {
    teams = await listWatchTeams();
  } catch {
    teams = [];
  }
  // A team from an earlier season still lists itself.
  if (!teams.some((t) => t.pageKey === ownKey)) teams = [{ pageKey: ownKey, label: team.label }, ...teams];
  const uploads = await listFilmUploads([team.id]);
  const { games, redirect } = watchGames(uploads);
  const replacedBy = Object.fromEntries(redirect);
  let markers: Record<string, FilmMarker[]> = {};
  try {
    markers = await listFilmMarkers(games.flatMap((g) => (g.parts ?? []).map((p) => p.id)));
  } catch {
    markers = {};
  }
  return { team, pageKey: ownKey, teams, games, markers, replacedBy };
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
