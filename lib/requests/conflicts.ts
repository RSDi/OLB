// Schedule-conflict detection for building/gym requests. Pure + dependency-free
// so it's unit-testable; the detail page and review queue feed it the request
// plus the candidate reservations (confirmed calendar events + other open
// requests) and render whatever it returns.
//
// A conflict = same space, same date, overlapping time window. Times are naive
// "HH:MM" compared as minutes-since-midnight (the calendar stores naive
// `date T time`, written the same way the request captures it, so no timezone
// math is needed). A candidate with no times is treated as all-day and
// conflicts with any same-day booking of that space (better to over-warn — the
// board decides; it's a soft flag, never a block).

export interface ConflictCandidate {
  id: string;
  title: string;
  source: "event" | "request";
  spaces: string[];
  date: string; // YYYY-MM-DD
  start: string | null; // HH:MM
  end: string | null; // HH:MM
}

export interface Conflict {
  id: string;
  title: string;
  source: "event" | "request";
  spaces: string[];
  date: string; // YYYY-MM-DD the clash falls on (matters for multi-date requests)
  when: string; // human-readable, e.g. "6:00–8:00 PM" or "all day"
}

export interface ConflictTarget {
  spaces: string[];
  // One entry per booked day, each with its own time window — so a recurring
  // request with different hours per day is checked accurately. Single-date and
  // same-hours requests just pass one window per date. (Matches Occurrence from
  // ./recurrence structurally.)
  occurrences: { date: string; start: string | null; end: string | null }[];
}

function toMinutes(t: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Half-open overlap: [aStart,aEnd) ∩ [bStart,bEnd). Touching edges (one ends
// exactly when the other starts) is NOT a conflict. A missing window on either
// side is treated as all-day → overlaps.
export function windowsOverlap(
  aStart: number | null,
  aEnd: number | null,
  bStart: number | null,
  bEnd: number | null,
): boolean {
  if (aStart == null || aEnd == null || bStart == null || bEnd == null) return true;
  return aStart < bEnd && bStart < aEnd;
}

function to12h(t: string | null): string | null {
  const mins = toMinutes(t);
  if (mins == null) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function whenLabel(c: ConflictCandidate): string {
  const s = to12h(c.start);
  const e = to12h(c.end);
  if (s && e) return `${s}–${e}`;
  if (s) return `from ${s}`;
  return "all day";
}

// Returns the candidates that conflict with the target, earliest first. A
// multi-date (recurring) target clashes with any candidate that lands on one of
// its dates — using THAT date's own window — so per-day hours are honored. The
// same candidate booking can clash on several dates, so each (candidate, date)
// pair is reported once, sorted by date then start time.
export function findConflicts(target: ConflictTarget, candidates: ConflictCandidate[]): Conflict[] {
  if (target.occurrences.length === 0 || target.spaces.length === 0) return [];
  const byDate = new Map<string, { start: number | null; end: number | null }>();
  for (const o of target.occurrences) byDate.set(o.date, { start: toMinutes(o.start), end: toMinutes(o.end) });
  const matches = candidates.filter((c) => {
    const occ = byDate.get(c.date);
    return (
      occ !== undefined &&
      c.spaces.some(s => target.spaces.includes(s)) &&
      windowsOverlap(occ.start, occ.end, toMinutes(c.start), toMinutes(c.end))
    );
  });
  matches.sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : (toMinutes(a.start) ?? -1) - (toMinutes(b.start) ?? -1),
  );
  const seen = new Set<string>();
  const out: Conflict[] = [];
  for (const c of matches) {
    const key = `${c.id}|${c.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: c.id, title: c.title, source: c.source, spaces: c.spaces, date: c.date, when: whenLabel(c) });
  }
  return out;
}

// Derive the space list a calendar event occupies from its free-text location
// (the auto-booker joins spaces with ", "). Falls back to the whole string.
export function spacesFromLocation(location: string | null): string[] {
  if (!location) return [];
  return location.split(",").map(s => s.trim()).filter(Boolean);
}

// HH:MM out of a stored timestamp string like "2026-08-20T18:00:00+00:00".
// The calendar writes naive local values, so the literal HH:MM is the intended
// time — no timezone conversion.
export function timeFromTimestamp(ts: string | null): string | null {
  if (!ts) return null;
  const m = /T(\d{2}:\d{2})/.exec(ts);
  return m ? m[1] : null;
}

export function dateFromTimestamp(ts: string | null): string | null {
  if (!ts) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(ts);
  return m ? m[1] : null;
}
