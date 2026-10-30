// Titles, descriptions, and inbox grouping for game film / YouTube.

import { formatFilmGameLine } from "./game-meta.ts";
import type { FilmUpload, YoutubePrivacy, YoutubeProcessing } from "./types.ts";

export type { YoutubePrivacy, YoutubeProcessing } from "./types.ts";

export const YOUTUBE_TITLE_MAX = 100;
export const YOUTUBE_CHUNK_BYTES = 8 * 1024 * 1024; // 8 MiB; multiple of 256 KiB
export const YOUTUBE_MAX_ATTEMPTS = 5;

export type YoutubeStatus = "queued" | "uploading" | "done" | "failed";
export type YoutubePlaylistStatus = "queued" | "done" | "failed";

const PLAYLIST_ID_RE = /^[A-Za-z0-9_-]{10,80}$/;

export type YoutubeConnection = {
  connected: boolean;
  channelId: string | null;
  channelTitle: string | null;
  connectedAt: string | null;
  privacyStatus: YoutubePrivacy;
  madeForKids: boolean;
  /** Why the upload job last failed to sign in to YouTube; null when it's fine. */
  authError: string | null;
  authErrorAt: string | null;
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

export function youtubePrivacyLabel(privacy: YoutubePrivacy | null | undefined): string | null {
  if (privacy === "public") return "Public";
  if (privacy === "unlisted") return "Unlisted";
  if (privacy === "private") return "Private";
  return null;
}

export function youtubeProcessingLabel(processing: YoutubeProcessing | null | undefined): string | null {
  if (processing === "uploaded") return "Processing";
  if (processing === "processed") return "Ready";
  if (processing === "failed") return "Processing failed";
  if (processing === "rejected") return "Rejected";
  if (processing === "deleted") return "Deleted on YouTube";
  if (processing === "missing") return "Not on YouTube";
  return null;
}

/** One line for a card: "Unlisted · Ready" or "Privacy not checked yet". */
export function youtubeLiveStatusLine(row: {
  youtube_privacy: YoutubePrivacy | null;
  youtube_processing: YoutubeProcessing | null;
  youtube_synced_at: string | null;
}): string | null {
  const privacy = youtubePrivacyLabel(row.youtube_privacy);
  const processing = youtubeProcessingLabel(row.youtube_processing);
  if (row.youtube_processing === "missing") return processing;
  if (privacy && processing) return `${privacy} · ${processing}`;
  if (privacy) return privacy;
  if (processing) return processing;
  if (row.youtube_synced_at) return "Privacy not reported";
  return "Privacy not checked yet";
}

export function youtubePlaylistUrl(playlistId: string): string {
  return `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;
}

/** Accept a playlist URL (`?list=`) or a bare id. Empty is none. */
export function parseYoutubePlaylistId(
  raw: unknown
): { ok: true; id: string | null } | { ok: false; error: string } {
  if (raw == null) return { ok: true, id: null };
  if (typeof raw !== "string") return { ok: false, error: "Paste a playlist link or id." };
  const s = raw.trim();
  if (!s) return { ok: true, id: null };
  let id = s;
  const listMatch = /(?:[?&]list=)([A-Za-z0-9_-]+)/.exec(s);
  if (listMatch) {
    id = listMatch[1]!;
  } else if (/^https?:\/\//i.test(s)) {
    try {
      const fromUrl = new URL(s).searchParams.get("list");
      if (fromUrl) id = fromUrl;
    } catch {
      return { ok: false, error: "That doesn't look like a YouTube playlist." };
    }
  }
  if (!PLAYLIST_ID_RE.test(id)) return { ok: false, error: "That doesn't look like a YouTube playlist." };
  return { ok: true, id };
}

export type YoutubeChannelPlaylist = { id: string; title: string };

export const DEFAULT_YOUTUBE_TITLE_TEMPLATE = "{dot} {team} vs {opponent} – {date}";

export const DEFAULT_YOUTUBE_DESCRIPTION_TEMPLATE = [
  "{team} vs {opponent}, {date}",
  "{result_line}",
  "Final: {our_score}–{their_score}",
  "Watch: {youtube_link}",
  "Players: {players}",
  "Tournament: {tournament}",
  "Stats: {stats_book}",
  "Playlist: {playlist_link}",
  "Go Lightning! ⚡",
].join("\n");

export type YoutubeTemplateExtras = {
  includeStatsBook?: boolean;
  includePlayers?: boolean;
  includeTournament?: boolean;
  includePlaylistLink?: boolean;
};

export type YoutubeTemplateInput = {
  teamLabel: string;
  opponent?: string | null;
  gameDate?: string | null;
  ourScore?: number | null;
  theirScore?: number | null;
  youtubeVideoId?: string | null;
  playlistId?: string | null;
  players?: string[] | null;
  tournamentName?: string | null;
  statsBook?: string | null;
  uploaderName?: string | null;
  extras?: YoutubeTemplateExtras;
  titleTemplate?: string | null;
  descriptionTemplate?: string | null;
};

export type FilmResultKind = "win" | "loss" | "tie" | "none";

export function filmResultKind(ourScore?: number | null, theirScore?: number | null): FilmResultKind {
  if (ourScore == null || theirScore == null) return "none";
  if (ourScore > theirScore) return "win";
  if (ourScore < theirScore) return "loss";
  return "tie";
}

export function youtubeTemplateValues(input: YoutubeTemplateInput): Record<string, string> {
  const result = filmResultKind(input.ourScore, input.theirScore);
  const extras = input.extras ?? {};
  const players = extras.includePlayers
    ? (input.players ?? []).map((name) => name.trim()).filter(Boolean)
    : [];
  const tournament = extras.includeTournament ? input.tournamentName?.trim() || "" : "";
  const statsBook = extras.includeStatsBook ? input.statsBook?.trim() || "" : "";
  const playlistId = extras.includePlaylistLink ? input.playlistId?.trim() || "" : "";
  return {
    dot: result === "win" ? "🟢" : result === "loss" ? "🔴" : "",
    team: input.teamLabel.trim() || "OLB",
    opponent: input.opponent?.trim() || "",
    date: formatFilmMdy(input.gameDate) || "",
    result_line:
      result === "win" ? "Congrats on the win!" : result === "loss" ? "Better luck next time!" : "",
    our_score: result === "none" ? "" : String(input.ourScore),
    their_score: result === "none" ? "" : String(input.theirScore),
    youtube_link: input.youtubeVideoId ? youtubeWatchUrl(input.youtubeVideoId) : "",
    playlist_link: playlistId ? youtubePlaylistUrl(playlistId) : "",
    players: players.join(", "),
    tournament,
    stats_book: statsBook,
    uploader: input.uploaderName?.trim() || "",
  };
}

const PLACEHOLDER_RE = /\{([a-z_]+)\}/g;
const LABEL_ONLY_RE =
  /^(Final:\s*[–—-]?\s*|Watch:\s*|Players:\s*|Tournament:\s*|Stats:\s*|Playlist:\s*|Uploaded by\s*)$/i;

function tidyTemplateLine(line: string): string {
  return line
    .replace(/\s+vs\s+,/g, ",")
    .replace(/\s+vs\s+[–—-]\s*/g, " – ")
    .replace(/\s+vs\s*$/g, "")
    .replace(/\s+,(\s*,)*/g, ",")
    .replace(/,\s*$/g, "")
    .replace(/\s+[–—-]\s*$/g, "")
    .replace(/^[–—-]\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(LABEL_ONLY_RE, "")
    .replace(/^Final:\s+[–—-]\s*$/i, "")
    .trim();
}

export function renderYoutubeTemplate(template: string, values: Record<string, string>): string {
  const resolved = template.replace(/\{dot\}(\s*)/g, (_, space: string) =>
    values.dot ? `${values.dot}${space}` : ""
  );
  const filled = resolved.replace(PLACEHOLDER_RE, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] ?? "" : match
  );
  return filled
    .split(/\r?\n/)
    .map((line) => tidyTemplateLine(line))
    .filter((line) => line.length > 0)
    .join("\n");
}

export function youtubeTitle(input: YoutubeTemplateInput): string {
  const values = youtubeTemplateValues(input);
  const template = input.titleTemplate?.trim() || DEFAULT_YOUTUBE_TITLE_TEMPLATE;
  const title = renderYoutubeTemplate(template, values) || values.team;
  if (title.length <= YOUTUBE_TITLE_MAX) return title;
  return title.slice(0, YOUTUBE_TITLE_MAX - 1).trimEnd() + "…";
}

export function youtubeDescription(input: YoutubeTemplateInput): string {
  const values = youtubeTemplateValues(input);
  const template = input.descriptionTemplate?.trim() || DEFAULT_YOUTUBE_DESCRIPTION_TEMPLATE;
  return renderYoutubeTemplate(template, values);
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
