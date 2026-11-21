// Team film page (/watch/<slug>-<key>): which games show, how they play, and how
// they group into tournaments and weekends. Pure, so tests and the client
// share it.

import { sameOpponent, streamSwaps } from "./streams.ts";
import { compareFilmParts, filmPartLabel } from "./parts.ts";
import type { FilmUpload } from "./types.ts";

export const EVENT_NAME_MAX = 80;

export type WatchSource = { kind: "youtube"; videoId: string } | { kind: "file" };

/** One video of a game: the whole game, or a half, quarter or overtime. */
export interface WatchPart {
  id: string;
  /** "2nd half", or "Video 2" when a game's videos don't say; null when it's the only one. */
  label: string | null;
  source: WatchSource;
  streamed?: boolean;
}

/**
 * One game on the team page. Its videos are `parts`, in play order; `id` and
 * `source` are the first part's, for the card's thumbnail and keys.
 */
export interface WatchGame {
  id: string;
  gameDate: string; // YYYY-MM-DD
  opponent: string | null;
  ourScore: number | null;
  theirScore: number | null;
  eventName: string | null;
  createdAt: string;
  source: WatchSource;
  /** From the livestream; the full recording hasn't replaced it yet. */
  streamed?: boolean;
  parts?: WatchPart[];
}

/** A game's videos, or just itself for a game built without parts. */
export function gameParts(g: WatchGame): WatchPart[] {
  return g.parts && g.parts.length > 0 ? g.parts : [{ id: g.id, label: null, source: g.source, streamed: g.streamed }];
}

export interface WatchSection {
  key: string;
  /** A tournament or event a coach named, or a weekend / single day. */
  kind: "event" | "weekend" | "day";
  title: string;
  /** "Nov 15–16" or "Nov 8". */
  dates: string;
  wins: number;
  losses: number;
  /** Oldest first, so a tournament reads in bracket order. */
  games: WatchGame[];
}

/** Clean a typed tournament name: trim, collapse spaces, drop control chars. */
export function cleanEventName(raw: unknown): { ok: true; value: string | null } | { ok: false } {
  if (raw == null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false };
  const value = raw.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  if (value.length > EVENT_NAME_MAX) return { ok: false };
  return { ok: true, value: value || null };
}

/** How the watch page plays this upload, or null when it can't. */
export function watchSource(u: Pick<
  FilmUpload,
  "youtube_status" | "youtube_video_id" | "youtube_privacy" | "youtube_processing" | "file_deleted_at"
>): WatchSource | null {
  const ytBroken =
    u.youtube_processing === "failed" ||
    u.youtube_processing === "rejected" ||
    u.youtube_processing === "deleted" ||
    u.youtube_processing === "missing";
  // A private YouTube video won't play embedded for families.
  if (u.youtube_status === "done" && u.youtube_video_id && u.youtube_privacy !== "private" && !ytBroken) {
    return { kind: "youtube", videoId: u.youtube_video_id };
  }
  if (!u.file_deleted_at) return { kind: "file" };
  return null;
}

/**
 * The team page's games, and where a streamed video's old links go.
 *
 * Videos of the same game (same day, same opponent) become one game with
 * parts in play order: halves, quarters, overtime, then videos that didn't
 * say. Within a game, the livestream shows until a recording of it is on
 * YouTube; then the recordings show and the stream's links open the first.
 * A recording linked to a stream by hand (streams.ts) follows the same rule
 * even when the opponents are typed differently.
 */
export function watchGames(uploads: FilmUpload[]): { games: WatchGame[]; redirect: Map<string, string> } {
  const { hidden, redirect } = streamSwaps(
    uploads,
    (u) => watchSource(u)?.kind === "youtube",
    (u) => watchSource(u) != null
  );
  type Row = { u: FilmUpload; source: WatchSource };
  const groups: Row[][] = [];
  for (const u of uploads) {
    if (hidden.has(u.id)) continue;
    const source = watchSource(u);
    if (!source) continue;
    const date = u.game_date ?? u.created_at.slice(0, 10);
    const group = u.opponent?.trim()
      ? groups.find((g) => {
          const first = g[0].u;
          return (first.game_date ?? first.created_at.slice(0, 10)) === date && sameOpponent(first.opponent, u.opponent);
        })
      : undefined;
    if (group) group.push({ u, source });
    else groups.push([{ u, source }]);
  }

  const games: WatchGame[] = [];
  for (let rows of groups) {
    let dropped: Row[] = [];
    if (rows.some((r) => !r.u.streamed && r.source.kind === "youtube")) {
      dropped = rows.filter((r) => r.u.streamed);
      rows = rows.filter((r) => !r.u.streamed);
    } else if (rows.some((r) => r.u.streamed)) {
      rows = rows.filter((r) => r.u.streamed);
    }
    rows.sort((a, b) =>
      compareFilmParts({ part: a.u.part, createdAt: a.u.created_at }, { part: b.u.part, createdAt: b.u.created_at })
    );
    const many = rows.length > 1;
    const parts: WatchPart[] = rows.map((r, i) => ({
      id: r.u.id,
      label: filmPartLabel(r.u.part) ?? (many ? `Video ${i + 1}` : null),
      source: r.source,
      ...(r.u.streamed ? { streamed: true } : {}),
    }));
    const first = rows[0].u;
    const pick = <T,>(f: (u: FilmUpload) => T | null | undefined): T | null => {
      for (const r of rows) {
        const v = f(r.u);
        if (v != null) return v;
      }
      return null;
    };
    // The stream's links (shared while it was streamed) open the recording.
    for (const st of dropped) redirect.set(st.u.id, parts[0].id);
    games.push({
      id: parts[0].id,
      gameDate: first.game_date ?? first.created_at.slice(0, 10),
      opponent: first.opponent,
      ourScore: pick((u) => u.our_score),
      theirScore: pick((u) => u.their_score),
      eventName: pick((u) => u.event_name),
      createdAt: rows.reduce((min, r) => (r.u.created_at < min ? r.u.created_at : min), first.created_at),
      source: parts[0].source,
      ...(parts.every((p) => p.streamed) ? { streamed: true } : {}),
      parts,
    });
  }
  return { games, redirect };
}

export function toWatchGames(uploads: FilmUpload[]): WatchGame[] {
  return watchGames(uploads).games;
}

export function gameResult(g: Pick<WatchGame, "ourScore" | "theirScore">): "w" | "l" | null {
  if (g.ourScore == null || g.theirScore == null || g.ourScore === g.theirScore) return null;
  return g.ourScore > g.theirScore ? "w" : "l";
}

function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayDiff(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86_400_000);
}

/** Fri, Sat and Sun belong to that Saturday's weekend; other days stand alone. */
export function weekendKey(iso: string): { key: string; weekend: boolean } {
  const d = parseDay(iso);
  const dow = d.getUTCDay(); // 0 Sun … 6 Sat
  if (dow === 5 || dow === 6 || dow === 0) {
    const shift = dow === 5 ? 1 : dow === 0 ? -1 : 0;
    return { key: isoDay(new Date(d.getTime() + shift * 86_400_000)), weekend: true };
  }
  return { key: iso, weekend: false };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatDay(iso: string): string {
  const d = parseDay(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function formatWeekday(iso: string): string {
  return DAYS[parseDay(iso).getUTCDay()];
}

/** "Nov 15–16", "Oct 31–Nov 1", or "Nov 8". */
export function formatDateRange(first: string, last: string): string {
  if (first === last) return formatDay(first);
  const a = parseDay(first);
  const b = parseDay(last);
  if (a.getUTCMonth() === b.getUTCMonth()) return `${formatDay(first)}–${b.getUTCDate()}`;
  return `${formatDay(first)}–${formatDay(last)}`;
}

function byGameOrder(a: WatchGame, b: WatchGame): number {
  return a.gameDate === b.gameDate ? a.createdAt.localeCompare(b.createdAt) : a.gameDate.localeCompare(b.gameDate);
}

// Games under the same event name stay together while each is within this
// many days of the one before. A weekly league named the same every week
// still splits into its weekends.
const EVENT_GAP_DAYS = 3;

/**
 * Group games into sections, newest section first. Named events group by
 * name (case-insensitive) and closeness in time; the rest group by weekend.
 */
export function groupWatchGames(games: WatchGame[]): WatchSection[] {
  const sorted = [...games].sort(byGameOrder);
  const sections: WatchSection[] = [];
  const openEvent = new Map<string, WatchSection>();
  const byWeekend = new Map<string, WatchSection>();

  for (const g of sorted) {
    if (g.eventName) {
      const name = g.eventName.toLowerCase();
      const current = openEvent.get(name);
      const last = current?.games[current.games.length - 1];
      if (current && last && dayDiff(last.gameDate, g.gameDate) <= EVENT_GAP_DAYS) {
        current.games.push(g);
        continue;
      }
      const section: WatchSection = {
        key: `event:${name}:${g.gameDate}`,
        kind: "event",
        title: g.eventName,
        dates: "",
        wins: 0,
        losses: 0,
        games: [g],
      };
      openEvent.set(name, section);
      sections.push(section);
      continue;
    }
    const wk = weekendKey(g.gameDate);
    const existing = byWeekend.get(wk.key);
    if (existing) {
      existing.games.push(g);
      continue;
    }
    const section: WatchSection = {
      key: `${wk.weekend ? "weekend" : "day"}:${wk.key}`,
      kind: wk.weekend ? "weekend" : "day",
      title: "",
      dates: "",
      wins: 0,
      losses: 0,
      games: [g],
    };
    byWeekend.set(wk.key, section);
    sections.push(section);
  }

  for (const s of sections) {
    const first = s.games[0].gameDate;
    const last = s.games[s.games.length - 1].gameDate;
    s.dates = formatDateRange(first, last);
    if (s.kind === "weekend") s.title = `Weekend of ${s.dates}`;
    if (s.kind === "day") s.title = `${formatWeekday(first)}, ${formatDay(first)}`;
    for (const g of s.games) {
      const r = gameResult(g);
      if (r === "w") s.wins += 1;
      if (r === "l") s.losses += 1;
    }
  }

  const lastDate = (s: WatchSection) => s.games[s.games.length - 1];
  return sections.sort((a, b) => -byGameOrder(lastDate(a), lastDate(b)));
}

export function seasonRecord(games: WatchGame[]): { wins: number; losses: number } {
  let wins = 0;
  let losses = 0;
  for (const g of games) {
    const r = gameResult(g);
    if (r === "w") wins += 1;
    if (r === "l") losses += 1;
  }
  return { wins, losses };
}

// The team page's address is the team's upload address plus a random key,
// "/watch/hs-jv-3f9a0c7e1b2d", so it can't be guessed from the team name.
export const WATCH_TOKEN_RE = /^[0-9a-f]{12}$/;

/** "hs-jv" + "3f9a0c7e1b2d" → "hs-jv-3f9a0c7e1b2d", the /watch/<key> segment. */
export function watchPageKey(slug: string, token: string): string {
  return `${slug}-${token}`;
}

/** The team page path, "/watch/hs-jv-3f9a0c7e1b2d". */
export function watchPagePath(pageKey: string): string {
  return `/watch/${encodeURIComponent(pageKey)}`;
}

/** Splits a /watch/<key> segment back into slug and token, or null. */
export function parseWatchPageKey(raw: string): { slug: string; token: string } | null {
  const key = raw.trim().toLowerCase();
  const cut = key.lastIndexOf("-");
  if (cut <= 0) return null;
  const slug = key.slice(0, cut);
  const token = key.slice(cut + 1);
  if (!WATCH_TOKEN_RE.test(token)) return null;
  return { slug, token };
}

/** Public link to a game on the team page, optionally at a moment. */
export function watchGamePath(pageKey: string, uploadId: string, atSeconds?: number): string {
  const base = `${watchPagePath(pageKey)}?v=${encodeURIComponent(uploadId)}`;
  if (atSeconds == null) return base;
  return `${base}&t=${Math.max(0, Math.floor(atSeconds))}`;
}
