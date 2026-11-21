// Streamed games (0179). A game livestreamed on YouTube goes on Film as a
// row with streamed = true and the stream as its YouTube video. The full
// recording, uploaded later, points back at it with replaces_stream_id and
// takes its place on the team film page once the recording is on YouTube.
// Pure, so tests and the client share it.

import type { FilmUpload } from "./types.ts";

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * The 11-character video id from anything someone might paste: a watch,
 * live, shorts, embed or youtu.be link, a studio link, or the bare id.
 */
export function parseYoutubeVideoId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text) return null;
  if (VIDEO_ID_RE.test(text)) return text;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, "");
  let candidate: string | null = null;
  if (host === "youtu.be") {
    candidate = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "studio.youtube.com") {
    const v = url.searchParams.get("v");
    if (v) candidate = v;
    else {
      const parts = url.pathname.split("/").filter(Boolean);
      const at = parts.findIndex((p) => ["live", "shorts", "embed", "v", "video"].includes(p.toLowerCase()));
      if (at >= 0) candidate = parts[at + 1] ?? null;
    }
  }
  return candidate && VIDEO_ID_RE.test(candidate) ? candidate : null;
}

export function sameOpponent(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const x = norm(a);
  return !!x && x === norm(b);
}

type StreamRow = Pick<FilmUpload, "id" | "team_id" | "game_date" | "opponent" | "streamed">;

/**
 * The streamed game a new recording replaces, or null. Same team and day,
 * not already replaced, and then: the same opponent, or the only stream that
 * day when the recording has no opponent. Anything less clear stays apart
 * and a coach can attach it on Film.
 */
export function findStreamToReplace(
  streams: StreamRow[],
  takenStreamIds: Iterable<string>,
  recording: { teamId: string | null; gameDate: string | null; opponent: string | null }
): string | null {
  if (!recording.teamId || !recording.gameDate) return null;
  const taken = new Set(takenStreamIds);
  const open = streams.filter(
    (s) => s.streamed && s.team_id === recording.teamId && s.game_date === recording.gameDate && !taken.has(s.id)
  );
  if (open.length === 0) return null;
  if (recording.opponent?.trim()) {
    const same = open.filter((s) => sameOpponent(s.opponent, recording.opponent));
    return same.length === 1 ? same[0].id : null;
  }
  return open.length === 1 ? open[0].id : null;
}

/** Live on YouTube and playable for families (the team page's own test). */
export type PlayableCheck = (u: FilmUpload) => boolean;

/**
 * Which rows the team film page hides, and where a stream's old link goes.
 *
 * - A stream whose recording plays on YouTube is hidden; links to it open
 *   the recording.
 * - A recording whose stream still plays is hidden until the recording is on
 *   YouTube, so families keep watching the stream meanwhile.
 */
export function streamSwaps(
  uploads: FilmUpload[],
  playsOnYoutube: PlayableCheck,
  plays: PlayableCheck
): { hidden: Set<string>; redirect: Map<string, string> } {
  const byId = new Map(uploads.map((u) => [u.id, u]));
  const hidden = new Set<string>();
  const redirect = new Map<string, string>();
  for (const rec of uploads) {
    const streamId = rec.replaces_stream_id;
    if (!streamId) continue;
    const stream = byId.get(streamId);
    if (!stream || !stream.streamed) continue;
    if (playsOnYoutube(rec)) {
      hidden.add(stream.id);
      redirect.set(stream.id, rec.id);
    } else if (plays(stream)) {
      hidden.add(rec.id);
    }
  }
  return { hidden, redirect };
}

/**
 * Jump-to points moved from the stream to the recording. The two start at
 * different moments, so each point moves by the gap between the tip-off
 * times. Points that would land before the recording starts are left out.
 */
export function shiftStreamMarkers<T extends { at_seconds: number }>(
  markers: T[],
  streamTipOff: number,
  recordingTipOff: number
): { moved: (T & { at_seconds: number })[]; dropped: number } {
  const shift = recordingTipOff - streamTipOff;
  const moved: (T & { at_seconds: number })[] = [];
  let dropped = 0;
  for (const m of markers) {
    const at = Math.round((m.at_seconds + shift) * 10) / 10;
    if (at < 0) dropped += 1;
    else moved.push({ ...m, at_seconds: at });
  }
  return { moved, dropped };
}

/** "Livestream" rows have no file; this is the name they show under. */
export const STREAM_FILENAME = "Livestream";
