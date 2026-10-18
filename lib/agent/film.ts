// Read-only game-film views for /api/agent/film and /api/agent/film/health.
// Mapping is pure so tests can pin the JSON. Loaders in ./film-load.ts hit
// the database. Never include team codes, OAuth tokens, or storage paths.

import { youtubePlaylistUrl, youtubeWatchUrl, type YoutubePrivacy } from "../film/youtube-meta.ts";
import type { YoutubeStatus } from "../film/types.ts";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const AGENT_YOUTUBE_STATUSES = ["not_sent", "queued", "uploaded", "failed"] as const;
export type AgentYoutubeStatus = (typeof AGENT_YOUTUBE_STATUSES)[number];

export type AgentFilmTeam = {
  id: string | null;
  name: string;
  slug: string;
};

export type AgentFilmYoutube = {
  status: AgentYoutubeStatus;
  videoId: string | null;
  url: string | null;
  privacy: YoutubePrivacy;
  playlistId: string | null;
  playlistUrl: string | null;
  updatedAt: string | null;
};

export type AgentFilm = {
  id: string;
  team: AgentFilmTeam;
  gameDate: string | null;
  uploadedAt: string;
  opponent: string | null;
  inStorage: boolean;
  youtube: AgentFilmYoutube;
};

export type AgentFilmListQuery = {
  team: string | null;
  from: string | null;
  to: string | null;
};

export type AgentTeamPlaylist = {
  id: string;
  name: string;
  slug: string;
  playlistId: string | null;
  playlistUrl: string | null;
};

export type AgentFilmHealth = {
  youtube: {
    connected: boolean;
    channelTitle: string | null;
    connectedAt: string | null;
    defaultPrivacy: YoutubePrivacy;
  };
  playlists: {
    migration0145Applied: boolean;
    teams: AgentTeamPlaylist[];
  };
  counts: {
    notSent: number;
    stuck: number;
    failed: number;
  };
};

export type AgentFilmRow = {
  id: string;
  team: string;
  team_id: string | null;
  storage_path: string;
  created_at: string;
  game_date: string | null;
  opponent: string | null;
  youtube_status: YoutubeStatus | null;
  youtube_video_id: string | null;
  youtube_updated_at: string | null;
  youtube_playlist_id: string | null;
};

export type AgentTeamRow = {
  id: string;
  name: string;
  slug: string;
  playlistId: string | null;
};

export function isIsoDate(raw: string): boolean {
  const m = DATE_RE.exec(raw);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function looksLikeUuid(raw: string): boolean {
  return UUID_RE.test(raw);
}

export function parseFilmListQuery(params: URLSearchParams): AgentFilmListQuery | { error: string } {
  const teamRaw = params.get("team")?.trim() || "";
  const fromRaw = params.get("from")?.trim() || "";
  const toRaw = params.get("to")?.trim() || "";
  if (teamRaw.length > 80) return { error: "Keep the team filter short." };
  if (fromRaw && !isIsoDate(fromRaw)) return { error: "from must be YYYY-MM-DD." };
  if (toRaw && !isIsoDate(toRaw)) return { error: "to must be YYYY-MM-DD." };
  if (fromRaw && toRaw && fromRaw > toRaw) return { error: "from cannot be after to." };
  return {
    team: teamRaw || null,
    from: fromRaw || null,
    to: toRaw || null,
  };
}

export function agentYoutubeStatus(status: YoutubeStatus | null | undefined): AgentYoutubeStatus {
  if (status == null) return "not_sent";
  if (status === "done") return "uploaded";
  if (status === "failed") return "failed";
  return "queued";
}

export function youtubePrivacy(raw: string | null | undefined): YoutubePrivacy {
  return raw === "private" || raw === "public" ? raw : "unlisted";
}

export function teamMatchesFilter(team: AgentTeamRow, filter: string): boolean {
  const q = filter.trim().toLowerCase();
  if (!q) return true;
  if (looksLikeUuid(q) && team.id.toLowerCase() === q) return true;
  return team.slug.toLowerCase() === q || team.name.toLowerCase() === q;
}

export function effectivePlaylistId(row: AgentFilmRow, team: AgentTeamRow | undefined): string | null {
  return row.youtube_playlist_id?.trim() || team?.playlistId?.trim() || null;
}

export function toAgentFilm(
  row: AgentFilmRow,
  opts: {
    team?: AgentTeamRow;
    inStorage: boolean;
    privacy: YoutubePrivacy;
  },
): AgentFilm {
  const slug = row.team || opts.team?.slug || "team";
  const playlistId = effectivePlaylistId(row, opts.team);
  const videoId = row.youtube_video_id?.trim() || null;
  const status = agentYoutubeStatus(row.youtube_status);
  return {
    id: row.id,
    team: {
      id: row.team_id ?? opts.team?.id ?? null,
      name: opts.team?.name || slug,
      slug,
    },
    gameDate: row.game_date,
    uploadedAt: row.created_at,
    opponent: row.opponent,
    inStorage: opts.inStorage,
    youtube: {
      status,
      videoId,
      url: videoId ? youtubeWatchUrl(videoId) : null,
      privacy: opts.privacy,
      playlistId,
      playlistUrl: playlistId ? youtubePlaylistUrl(playlistId) : null,
      updatedAt: row.youtube_updated_at,
    },
  };
}

export function toAgentTeamPlaylist(team: AgentTeamRow): AgentTeamPlaylist {
  const playlistId = team.playlistId?.trim() || null;
  return {
    id: team.id,
    name: team.name,
    slug: team.slug,
    playlistId,
    playlistUrl: playlistId ? youtubePlaylistUrl(playlistId) : null,
  };
}

export function toAgentFilmHealth(input: {
  connected: boolean;
  channelTitle: string | null;
  connectedAt: string | null;
  defaultPrivacy: YoutubePrivacy | string | null;
  migration0145Applied: boolean;
  teams: AgentTeamRow[];
  notSent: number;
  stuck: number;
  failed: number;
}): AgentFilmHealth {
  return {
    youtube: {
      connected: input.connected,
      channelTitle: input.channelTitle,
      connectedAt: input.connectedAt,
      defaultPrivacy: youtubePrivacy(input.defaultPrivacy),
    },
    playlists: {
      migration0145Applied: input.migration0145Applied,
      teams: input.teams.map(toAgentTeamPlaylist),
    },
    counts: {
      notSent: input.notSent,
      stuck: input.stuck,
      failed: input.failed,
    },
  };
}

const SECRET_KEYS = [
  "refresh_token",
  "refresh_token_enc",
  "access_token",
  "film_code",
  "film_code_hash",
  "code_hash",
  "key_hash",
  "token_key",
  "client_secret",
  "service_role",
  "storage_path",
];

export function agentPayloadLeaks(value: unknown, path = ""): string[] {
  const leaks: string[] = [];
  if (value == null) return leaks;
  if (Array.isArray(value)) {
    value.forEach((item, i) => leaks.push(...agentPayloadLeaks(item, `${path}[${i}]`)));
    return leaks;
  }
  if (typeof value !== "object") return leaks;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const here = path ? `${path}.${key}` : key;
    const lower = key.toLowerCase();
    if (SECRET_KEYS.some((s) => lower === s || lower.endsWith(`_${s}`))) leaks.push(here);
    leaks.push(...agentPayloadLeaks(child, here));
  }
  return leaks;
}
