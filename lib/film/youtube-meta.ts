// Titles, descriptions, and inbox grouping for game film / YouTube.

import { formatFilmGameLine, formatFilmScore } from "./game-meta.ts";
import type { FilmUpload } from "./types.ts";

export const YOUTUBE_TITLE_MAX = 100;
export const YOUTUBE_CHUNK_BYTES = 8 * 1024 * 1024; // 8 MiB; multiple of 256 KiB
export const YOUTUBE_MAX_ATTEMPTS = 5;

export type YoutubePrivacy = "unlisted" | "private" | "public";
export type YoutubeStatus = "queued" | "uploading" | "done" | "failed";

export type YoutubeConnection = {
  connected: boolean;
  channelId: string | null;
  channelTitle: string | null;
  connectedAt: string | null;
  privacyStatus: YoutubePrivacy;
  madeForKids: boolean;
};

export function formatFilmMdy(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

export function youtubeTitle(input: {
  teamLabel: string;
  opponent?: string | null;
  gameDate?: string | null;
}): string {
  const team = input.teamLabel.trim() || "OLB";
  const date = formatFilmMdy(input.gameDate);
  const vs = input.opponent?.trim();
  let title = vs ? `${team} vs ${vs}` : team;
  if (date) title = `${title} – ${date}`;
  if (title.length <= YOUTUBE_TITLE_MAX) return title;
  return title.slice(0, YOUTUBE_TITLE_MAX - 1).trimEnd() + "…";
}

export function youtubeDescription(input: {
  teamLabel: string;
  opponent?: string | null;
  gameDate?: string | null;
  ourScore?: number | null;
  theirScore?: number | null;
  uploaderName?: string | null;
}): string {
  const lines = ["Omaha Lightning game film."];
  const game = formatFilmGameLine({
    gameDate: input.gameDate,
    opponent: input.opponent,
    ourScore: input.ourScore,
    theirScore: input.theirScore,
  });
  if (game) lines.push("", game);
  const score = formatFilmScore(input.ourScore, input.theirScore);
  if (score && input.ourScore != null && input.theirScore != null) {
    lines.push(`Final: ${score}`);
  }
  if (input.uploaderName) lines.push("", `Uploaded by ${input.uploaderName}`);
  return lines.join("\n");
}

export function youtubeInitiateHeaders(accessToken: string, sizeBytes: number, contentType: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json; charset=UTF-8",
    "X-Upload-Content-Length": String(sizeBytes),
    "X-Upload-Content-Type": contentType || "video/mp4",
  };
}

export function youtubeChunkHeaders(
  accessToken: string,
  start: number,
  end: number,
  total: number,
  contentType: string
): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Length": String(end - start + 1),
    "Content-Range": `bytes ${start}-${end}/${total}`,
    "Content-Type": contentType || "video/mp4",
  };
}

export function nextChunkRange(
  bytesSent: number,
  total: number,
  chunkBytes = YOUTUBE_CHUNK_BYTES
): { start: number; end: number } | null {
  if (total <= 0 || bytesSent >= total) return null;
  const start = Math.max(0, Math.floor(bytesSent));
  const end = Math.min(total - 1, start + chunkBytes - 1);
  return { start, end };
}

export function parseResumeRange(rangeHeader: string | null): number {
  if (!rangeHeader) return 0;
  const m = /bytes=\d+-(\d+)/i.exec(rangeHeader);
  if (!m) return 0;
  return Number(m[1]) + 1;
}

export type FilmGameGroup = {
  key: string;
  gameDate: string | null;
  opponent: string | null;
  ourScore: number | null;
  theirScore: number | null;
  line: string | null;
  uploads: FilmUpload[];
};

export type FilmTeamGroup = {
  team: string;
  label: string;
  games: FilmGameGroup[];
};

export function groupUploadsByTeamAndGame(
  uploads: FilmUpload[],
  labels: Record<string, string> = {}
): FilmTeamGroup[] {
  const teams = new Map<string, Map<string, FilmGameGroup>>();
  for (const row of uploads) {
    const team = row.team || "team";
    const gameKey = `${row.game_date ?? ""}|${(row.opponent ?? "").toLowerCase()}`;
    let games = teams.get(team);
    if (!games) {
      games = new Map();
      teams.set(team, games);
    }
    let game = games.get(gameKey);
    if (!game) {
      game = {
        key: gameKey,
        gameDate: row.game_date,
        opponent: row.opponent,
        ourScore: row.our_score,
        theirScore: row.their_score,
        line: formatFilmGameLine({
          gameDate: row.game_date,
          opponent: row.opponent,
          ourScore: row.our_score,
          theirScore: row.their_score,
        }),
        uploads: [],
      };
      games.set(gameKey, game);
    }
    if (game.ourScore == null && row.our_score != null) game.ourScore = row.our_score;
    if (game.theirScore == null && row.their_score != null) game.theirScore = row.their_score;
    game.line = formatFilmGameLine({
      gameDate: game.gameDate,
      opponent: game.opponent,
      ourScore: game.ourScore,
      theirScore: game.theirScore,
    });
    game.uploads.push(row);
  }

  const out: FilmTeamGroup[] = [];
  for (const [team, games] of teams) {
    const list = [...games.values()].sort((a, b) => {
      const da = a.gameDate ?? "";
      const db = b.gameDate ?? "";
      if (da !== db) return db.localeCompare(da);
      return (a.opponent ?? "").localeCompare(b.opponent ?? "");
    });
    out.push({
      team,
      label: labels[team] || team,
      games: list,
    });
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}
