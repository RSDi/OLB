// Links on a game (0183): a YouTube video, a stream, Hudl, a stats sheet,
// each with a note saying what it is. Pure, so the Film page, the team film
// page and tests share it.

import { parseYoutubeVideoId } from "./streams.ts";

export const FILM_LINK_MAX = 12;
export const FILM_LINK_URL_MAX = 500;
export const FILM_LINK_NOTE_MAX = 80;

export interface FilmLink {
  id: string;
  upload_id: string;
  url: string;
  note: string;
  position: number;
}

export type FilmLinkInput = { url: string; note: string };

/** "youtube.com/watch?v=…" → "https://youtube.com/watch?v=…"; null when it isn't a web link. */
export function cleanFilmLinkUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text || /\s/.test(text)) return null;
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname.includes(".")) return null;
  const out = url.toString();
  return out.length > FILM_LINK_URL_MAX ? null : out;
}

/**
 * The links from the Edit form, in order. Blank rows are dropped; a row
 * with a note but no link, or a link that isn't one, is refused.
 */
export function parseFilmLinks(raw: unknown): { ok: true; links: FilmLinkInput[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "Couldn't read the links." };
  const links: FilmLinkInput[] = [];
  for (const row of raw) {
    const r = (row ?? {}) as { url?: unknown; note?: unknown };
    const urlText = typeof r.url === "string" ? r.url.trim() : "";
    const note = (typeof r.note === "string" ? r.note : "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
    if (!urlText && !note) continue;
    if (!urlText) return { ok: false, error: `Add the link for “${note}”, or clear its note.` };
    const url = cleanFilmLinkUrl(urlText);
    if (!url) return { ok: false, error: `“${urlText.slice(0, 60)}” isn't a web link. Paste the whole address.` };
    if (note.length > FILM_LINK_NOTE_MAX) return { ok: false, error: `Keep each link's note under ${FILM_LINK_NOTE_MAX} characters.` };
    links.push({ url, note });
  }
  if (links.length > FILM_LINK_MAX) return { ok: false, error: `A game can have up to ${FILM_LINK_MAX} links.` };
  return { ok: true, links };
}

/** The YouTube video a link points at, so the team page can play it; null for anything else. */
export function filmLinkYoutubeId(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(host)) return null;
  return parseYoutubeVideoId(url);
}

/** "hudl.com" for a link's button when it has no note. */
export function filmLinkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}
