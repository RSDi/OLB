// A season tab of the planning spreadsheet ("HS Schedule - 26-27") as
// weekends. Its layout:
//
//   rows 1–3   "Omaha Lightning" / "High School Schedule" / "2026-27", and
//              beside them the color key ("Need to secure facility" on
//              yellow, "Facility Secured" on green, "Final details still in
//              process" on pale yellow).
//   a header   Month | Thurs | Fri | Sat | Location | Trip Type | Event |
//              V | JV1 | … | Notes:  (later seasons add Thurs; the team
//              columns change from season to season; 2024-25 adds Varsity
//              Scores)
//   weekends   the month's name on its first weekend; day numbers under the
//              days; the event cell colored by how it stands; a number of
//              games, "?" or nothing under each team (pale green: not sure).
//   "Total Games" ends it.
//
// Pure: turns a Grid into plain data; plan.ts works out what to write.

import type { HsWeekendStatus } from "../hs-schedule/types.ts";
import { cellAt, clean, type Grid, type GridCell } from "./grid.ts";
import { parseScores, type LevelRef, type ParsedScore } from "./event-text.ts";

export interface SheetLevel extends LevelRef {
  col: number;
}

export interface SheetGames {
  label: string;
  games: number | null;
  unsure: boolean;
  note: string | null;
}

export interface SheetWeekend {
  row: number; // the spreadsheet's row number
  startsOn: string;
  endsOn: string;
  eventText: string;
  location: string | null;
  trip: string | null;
  status: HsWeekendStatus;
  notes: string | null;
  games: SheetGames[];
  scores: ParsedScore[];
}

export interface SheetSeason {
  sheet: string;
  season: number;
  title: string;
  levels: SheetLevel[];
  // Which team the Scores column is for ("Varsity Scores").
  scoresLevel: string | null;
  weekends: SheetWeekend[];
  skipped: string[];
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function monthOf(text: string): number | null {
  const m = text.toLowerCase().match(/^([a-z]{3,4})[a-z]*\.?$/);
  return m ? MONTHS[m[1]] ?? MONTHS[m[1].slice(0, 3)] ?? null : null;
}

const DAY_HEADER = /^(mon|tue|tues|wed|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)\b/i;

// "HS Schedule - 26-27" or a cell "2026-27" → 2026.
export function seasonFromSheet(grid: Grid): number | null {
  for (let r = 0; r < 6; r++) {
    for (const c of grid.rows[r] ?? []) {
      const m = c.text.match(/^(20\d{2})\s*[-–/]\s*(\d{2}|\d{4})$/);
      if (m) return Number(m[1]);
    }
  }
  const m = grid.name.match(/(\d{2,4})\s*[-–]\s*(\d{2,4})\s*$/);
  if (!m) return null;
  const y = Number(m[1]);
  return y < 100 ? 2000 + y : y;
}

export function isScheduleSheet(grid: Grid): boolean {
  if (/schedule/i.test(grid.name) && seasonFromSheet(grid) != null) return true;
  return (grid.rows.slice(0, 5).some((row) => row.some((c) => /high school schedule/i.test(c.text))));
}

// The spreadsheet's trip types, tidied: "(1) Overnight" → "Overnight".
export function normalizeTrip(text: string): string | null {
  const t = clean(text).toLowerCase();
  if (!t || t === "no games") return null;
  if (/\(?2\)?\s*overnights?/.test(t)) return "2 overnights";
  if (/overnight/.test(t)) return "Overnight";
  if (/week/.test(t)) return "Week-long";
  if (/local or day/.test(t)) return "Local or day trip";
  if (/day trip/.test(t)) return "Day trip";
  if (/^local$/.test(t)) return "Local";
  return clean(text);
}

// Default meanings of the fills, and the color key above the header when
// the sheet has one.
const DEFAULT_FILLS: Record<string, HsWeekendStatus> = {
  "00FF00": "secured",
  FFFF00: "need_facility",
  FFF2CC: "in_process",
  FF0000: "tentative",
};

function legend(grid: Grid, headerRow: number): Record<string, HsWeekendStatus> {
  const out: Record<string, HsWeekendStatus> = { ...DEFAULT_FILLS };
  for (let r = 0; r < headerRow; r++) {
    for (const c of grid.rows[r] ?? []) {
      if (!c.fill || !c.text) continue;
      const t = c.text.toLowerCase();
      if (/need to secure|need facility/.test(t)) out[c.fill] = "need_facility";
      else if (/secured/.test(t)) out[c.fill] = "secured";
      else if (/in process|details/.test(t)) out[c.fill] = "in_process";
      else if (/tentative|on the fence/.test(t)) out[c.fill] = "tentative";
      else if (/cancel/.test(t)) out[c.fill] = "canceled";
    }
  }
  return out;
}

export function statusOf(eventText: string, trip: string, fill: string | null, fills: Record<string, HsWeekendStatus>): HsWeekendStatus {
  if (/cancel/i.test(eventText)) return "canceled";
  if (/\boff\b/i.test(eventText) || /open weekend/i.test(eventText) || /^open\b/i.test(eventText) || /^no games$/i.test(clean(trip)))
    return "off";
  return (fill && fills[fill]) || "planned";
}

// Pale green in a team's cell: the count isn't settled.
const UNSURE_FILLS = new Set(["D9EAD3", "B6D7A8"]);

// A team's cell: 3, "?", "3?", "1-3" (Excel may have made that a date; the
// grid keeps what it showed).
export function gamesCell(cell: GridCell): Omit<SheetGames, "label"> | null {
  const t = cell.text;
  if (!t) return null;
  const unsureFill = !!cell.fill && UNSURE_FILLS.has(cell.fill);
  if (t === "?") return { games: null, unsure: true, note: null };
  if (typeof cell.value === "number" && /^\d+$/.test(t)) {
    return { games: Math.min(30, Math.max(0, Math.round(cell.value))), unsure: unsureFill, note: null };
  }
  let m = t.match(/^(\d{1,2})\s*\?$/);
  if (m) return { games: Number(m[1]), unsure: true, note: null };
  m = t.match(/^(\d{1,2})\s*[-–/]\s*(\d{1,2})$/);
  if (m) {
    const lo = Number(m[1]);
    const hi = Number(m[2]);
    return { games: Math.max(lo, hi), unsure: true, note: `${Math.min(lo, hi)}–${Math.max(lo, hi)} games` };
  }
  m = t.match(/^(\d{1,2})$/);
  if (m) return { games: Number(m[1]), unsure: unsureFill, note: null };
  return { games: null, unsure: true, note: t.slice(0, 120) };
}

function shiftDays(ymdStr: string, n: number): string {
  const [y, mo, d] = ymdStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d + n));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function validDay(y: number, m: number, d: number): boolean {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

// Months August–December are in the season's first year; January–July in the next.
function yearOf(season: number, month: number): number {
  return month >= 8 ? season : season + 1;
}

export function parseScheduleSheet(grid: Grid): SheetSeason | null {
  const season = seasonFromSheet(grid);
  if (season == null) return null;

  // The header row: the one with "Event" and "Location".
  let headerRow = -1;
  for (let r = 0; r < Math.min(grid.rows.length, 30); r++) {
    const texts = (grid.rows[r] ?? []).map((c) => c.text.toLowerCase());
    if (texts.includes("event") && texts.some((t) => t.startsWith("location"))) {
      headerRow = r;
      break;
    }
  }
  if (headerRow < 0) return null;
  const header = grid.rows[headerRow].map((c) => c.text);
  const col = (re: RegExp) => header.findIndex((t) => re.test(t));
  const monthCol = col(/^month$/i);
  const dayCols = header.map((t, i) => (DAY_HEADER.test(t) ? i : -1)).filter((i) => i >= 0);
  const locationCol = col(/^location/i);
  const tripCol = col(/trip/i);
  const eventCol = col(/^event$/i);
  const notesCol = col(/^notes/i);
  const scoresCol = col(/scores?$/i);
  const hidden = new Set(grid.hiddenCols);

  const levels: SheetLevel[] = [];
  const stop = [notesCol, scoresCol].filter((c) => c > eventCol);
  const end = stop.length ? Math.min(...stop) : header.length;
  for (let c = eventCol + 1; c < end; c++) {
    const label = clean(header[c]);
    if (!label) continue;
    levels.push({ label, col: c, hidden: hidden.has(c) });
  }
  // Two columns can share a label ("14U" hidden and "14U" shown in 2025-26):
  // the one shown keeps it, the others get a number.
  for (const label of new Set(levels.map((l) => l.label))) {
    const twins = levels.filter((x) => x.label === label).sort((a, b) => Number(a.hidden) - Number(b.hidden));
    twins.forEach((x, i) => {
      if (i > 0) x.label = `${label} (${i + 1})`;
    });
  }
  const scoresHeader = scoresCol >= 0 ? header[scoresCol] : "";
  const scoresLevel = scoresCol >= 0 ? scoreLevel(scoresHeader, levels) : null;

  const fills = legend(grid, headerRow);
  const skipped = new Set<string>();
  const weekends: SheetWeekend[] = [];
  let month: number | null = null;
  let lastStart: string | null = null;

  for (let r = headerRow + 1; r < grid.rows.length; r++) {
    const row = grid.rows[r] ?? [];
    if (row.some((c) => /^total games?$/i.test(c.text))) break;
    const eventCell = cellAt(grid, r, eventCol);
    const eventText = eventCell.text;
    const monthText = monthCol >= 0 ? cellAt(grid, r, monthCol).text : "";
    const newMonth = monthOf(monthText);
    const days = dayCols
      .map((c) => cellAt(grid, r, c))
      .map((c) => (typeof c.value === "number" ? c.value : /^\d{1,2}$/.test(c.text) ? Number(c.text) : null))
      .filter((d): d is number => d != null && d >= 1 && d <= 31);
    if (days.length === 0) {
      if (eventText) skipped.add(`Row ${r + 1} ("${eventText.slice(0, 40)}") has no dates, so it was left out.`);
      if (newMonth) month = newMonth;
      continue;
    }

    // Work out each day's month: a day number lower than the one before it
    // is in the next month; a weekend that starts before the last one is too.
    let m = newMonth ?? month;
    if (m == null) {
      skipped.add(`Row ${r + 1}: no month above it, so it was left out.`);
      continue;
    }
    const wraps = days.some((d, i) => i > 0 && d < days[i - 1]);
    if (newMonth && wraps && days[0] > 20) {
      // "Mar" beside 28, 1: the 28th is February's.
      m = m === 1 ? 12 : m - 1;
    }
    const build = (startMonth: number) => {
      let mm = startMonth;
      const out: string[] = [];
      days.forEach((d, i) => {
        if (i > 0 && d < days[i - 1]) mm = mm === 12 ? 1 : mm + 1;
        const y = yearOf(season, mm);
        if (validDay(y, mm, d)) out.push(ymd(y, mm, d));
      });
      return out;
    };
    let dates = build(m);
    // Well before the weekend above (not just a day, as when two events
    // share a weekend): the month's name is missing, so it's next month.
    if (dates.length && lastStart && dates[0] < shiftDays(lastStart, -7)) {
      dates = build(m === 12 ? 1 : m + 1);
    }
    if (dates.length === 0) {
      skipped.add(`Row ${r + 1}: its dates don't make sense, so it was left out.`);
      continue;
    }
    month = Number(dates[dates.length - 1].slice(5, 7));
    const startsOn = dates.reduce((a, b) => (a < b ? a : b));
    const endsOn = dates.reduce((a, b) => (a > b ? a : b));
    lastStart = startsOn;

    const tripText = tripCol >= 0 ? cellAt(grid, r, tripCol).text : "";
    let notes = notesCol >= 0 ? clean(cellAt(grid, r, notesCol).text) : "";
    if (/^\d{1,2}\s*-\s*\d{1,2}$/.test(notes)) {
      // "13-6": a running won-lost record, not a note.
      skipped.add("Running won–lost records in the Notes column were left out; the scores are imported instead.");
      notes = "";
    }
    const games: SheetGames[] = [];
    for (const l of levels) {
      const g = gamesCell(cellAt(grid, r, l.col));
      if (g) games.push({ label: l.label, ...g });
    }
    const scoresText = scoresCol >= 0 ? cellAt(grid, r, scoresCol).text : "";
    weekends.push({
      row: r + 1,
      startsOn,
      endsOn,
      eventText,
      location: clean(locationCol >= 0 ? cellAt(grid, r, locationCol).text : "") || null,
      trip: normalizeTrip(tripText),
      status: statusOf(eventText, tripText, eventCell.fill, fills),
      notes: notes || null,
      games,
      scores: scoresText ? parseScores(scoresText) : [],
    });
  }

  const title = clean(
    (grid.rows.slice(0, 4).flatMap((row) => row.map((c) => c.text)).find((t) => /schedule/i.test(t)) ?? "")
  );
  return {
    sheet: grid.name,
    season,
    title: title || "High School Schedule",
    levels,
    scoresLevel,
    weekends,
    skipped: [...skipped],
  };
}

// "Varsity Scores" → the season's varsity column ("V", or "18U" before the
// columns were renamed).
function scoreLevel(header: string, levels: SheetLevel[]): string | null {
  const t = header.toLowerCase();
  const find = (re: RegExp) => levels.find((l) => re.test(l.label))?.label ?? null;
  if (/var/.test(t)) return find(/^(v|var|varsity|18u)$/i) ?? levels[0]?.label ?? null;
  if (/\bjv\b/.test(t)) return find(/^(jv\s*\d*|16u)$/i);
  const exact = levels.find((l) => t.startsWith(l.label.toLowerCase()));
  return exact?.label ?? levels[0]?.label ?? null;
}
