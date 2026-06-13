// Pure availability math for the booking calendar. Given a space's operating
// window, a slot size, and the day's busy windows (existing reservations), it
// produces the selectable start times and how long you can book from each.
//
// Dependency-free + unit-tested. The loader feeds it busy windows derived from
// confirmed calendar events for the requested space(s); the wizard's calendar
// step renders whatever it returns. Times are minutes-since-midnight.

export interface BusyWindow {
  start: number; // minutes since midnight, inclusive
  end: number; // minutes since midnight, exclusive (half-open [start,end))
}

// Default building hours + slot size. Constants here so the UI and the engine
// agree; a host can pass overrides into the functions below.
export const OPEN_MIN = 6 * 60; // 6:00 AM
export const CLOSE_MIN = 22 * 60; // 10:00 PM
export const SLOT_MIN = 30; // half-hour granularity

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// Every candidate start time (minutes) from open through close − one slot,
// stepping by the slot size. The last start leaves room for at least one slot.
export function slotStartMinutes(open = OPEN_MIN, close = CLOSE_MIN, slot = SLOT_MIN): number[] {
  const out: number[] = [];
  for (let t = open; t + slot <= close; t += slot) out.push(t);
  return out;
}

// The start times you can actually begin a booking at: a start is offered when
// its first slot [t, t+slot) doesn't overlap any busy window. (Touching a busy
// block's edge is fine — half-open.)
export function freeStartMinutes(
  busy: BusyWindow[],
  open = OPEN_MIN,
  close = CLOSE_MIN,
  slot = SLOT_MIN,
): number[] {
  return slotStartMinutes(open, close, slot).filter(
    (t) => !busy.some((b) => overlaps(t, t + slot, b.start, b.end)),
  );
}

// How many minutes you can book starting at `startMin`: runs to close, capped
// by the nearest busy window that begins at or after the start (you can butt
// right up against it). Returns 0 if the start itself is already inside a busy
// window.
export function maxDurationMinutes(
  startMin: number,
  busy: BusyWindow[],
  close = CLOSE_MIN,
): number {
  if (busy.some((b) => overlaps(startMin, startMin + 1, b.start, b.end))) return 0;
  let end = close;
  for (const b of busy) {
    if (b.start >= startMin && b.start < end) end = b.start;
  }
  return Math.max(0, end - startMin);
}

// Which preset durations (in minutes) are bookable from a given start — used to
// enable/disable the "1 hr / 2 hr / …" chips. Always keeps any preset that fits
// within the max; "rest of day" is offered separately by the UI from the max.
export function allowedDurations(
  startMin: number,
  busy: BusyWindow[],
  presets: number[],
  close = CLOSE_MIN,
): number[] {
  const max = maxDurationMinutes(startMin, busy, close);
  return presets.filter((d) => d > 0 && d <= max);
}

// ── minutes ↔ labels ────────────────────────────────────────────────
export function minutesToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function hhmmToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function minutesTo12h(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// "1 hr", "90 min", "2 hr 30 min" — for duration chips and summaries.
export function durationLabel(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  const hr = `${h} hr`;
  return m === 0 ? hr : `${hr} ${m} min`;
}
