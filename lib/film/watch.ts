// Team film page (/watch/<slug>-<key>): which games show, how they play, and how
// they group into tournaments and weekends. Pure, so tests and the client
// share it.

import type { FilmUpload } from "./types.ts";

export const EVENT_NAME_MAX = 80;

export type WatchSource = { kind: "youtube"; videoId: string } | { kind: "file" };

export interface WatchGame {
  id: string;
  gameDate: string; // YYYY-MM-DD
  opponent: string | null;
  ourScore: number | null;
  theirScore: number | null;
  eventName: string | null;
  createdAt: string;
  source: WatchSource;
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

export function toWatchGames(uploads: FilmUpload[]): WatchGame[] {
  const out: WatchGame[] = [];
  for (const u of uploads) {
    const source = watchSource(u);
    if (!source) continue;
    out.push({
      id: u.id,
      gameDate: u.game_date ?? u.created_at.slice(0, 10),
      opponent: u.opponent,
      ourScore: u.our_score,
      theirScore: u.their_score,
      eventName: u.event_name ?? null,
      createdAt: u.created_at,
      source,
    });
  }
  return out;
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
