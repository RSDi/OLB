// Pure helpers for the in-page film player: timecodes, marker validation,
// speeds, and share links. Safe to import from client components.

export const PLAYER_SPEEDS = [0.25, 0.5, 1, 1.5, 2] as const;
export type PlayerSpeed = (typeof PLAYER_SPEEDS)[number];
export const MARKER_LABEL_MAX = 80;
export const SMALL_SKIP_S = 5;
export const BIG_SKIP_S = 15;
// YouTube doesn't expose frames; one step is a 30 fps frame.
export const FRAME_STEP_S = 1 / 30;

export interface FilmMarker {
  id: string;
  upload_id: string;
  at_seconds: number;
  label: string;
  created_at: string;
}

/** 75 → "1:15", 3725 → "1:02:05". */
export function formatTimecode(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** "1:15", "1:02:05", "75", "1m15s", "75s" → seconds; anything else → null. */
export function parseTimecode(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? raw : null;
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const hms = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(s);
  if (hms && (hms[1] || hms[2] || hms[3])) {
    return Number(hms[1] ?? 0) * 3600 + Number(hms[2] ?? 0) * 60 + Number(hms[3] ?? 0);
  }
  const parts = s.split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.slice(1).some((n) => n >= 60)) return null;
  return nums.reduce((acc, n) => acc * 60 + n, 0);
}

export function parseMarkerInput(input: {
  atSeconds: unknown;
  label: unknown;
}): { ok: true; atSeconds: number; label: string } | { ok: false; error: string } {
  const at = parseTimecode(input.atSeconds);
  if (at == null) return { ok: false, error: "That time doesn't look right." };
  const label = typeof input.label === "string" ? input.label.replace(/\s+/g, " ").trim() : "";
  if (!label) return { ok: false, error: "Give the marker a name." };
  if (label.length > MARKER_LABEL_MAX) return { ok: false, error: `Keep the name under ${MARKER_LABEL_MAX} characters.` };
  return { ok: true, atSeconds: Math.round(at * 100) / 100, label };
}

export function nextSpeed(current: number, dir: 1 | -1): PlayerSpeed {
  const i = PLAYER_SPEEDS.findIndex((s) => s >= current - 1e-6);
  const at = i === -1 ? PLAYER_SPEEDS.length - 1 : i;
  const next = Math.max(0, Math.min(PLAYER_SPEEDS.length - 1, at + dir));
  return PLAYER_SPEEDS[next]!;
}

export function clampTime(t: number, duration: number | null): number {
  const lo = Math.max(0, t);
  return duration && duration > 0 ? Math.min(lo, Math.max(0, duration - 0.1)) : lo;
}

/** Link to this video at this moment on the Film page. */
export function filmMomentPath(uploadId: string, atSeconds: number): string {
  const t = Math.max(0, Math.floor(atSeconds));
  return `/portal/film?v=${encodeURIComponent(uploadId)}&t=${t}`;
}

/** Markers sorted by time; the one playing now is the last at or before t. */
export function currentMarkerId(markers: FilmMarker[], t: number): string | null {
  let id: string | null = null;
  for (const m of [...markers].sort((a, b) => a.at_seconds - b.at_seconds)) {
    if (m.at_seconds <= t + 0.25) id = m.id;
    else break;
  }
  return id;
}
