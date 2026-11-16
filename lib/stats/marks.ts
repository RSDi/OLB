// The scorebook's marks, added up and checked against what the book itself
// says. Pure: safe in the browser, the server and tests.
//
// In each quarter box the scorer writes every score in order: 2 and 3 are
// baskets, 1 is a made free throw, 0 a missed one ("2 3 1 1"). The book also
// writes running scores at the end of the 1st quarter, the half, the 3rd
// quarter and the game, each player's total (TP) and FTM/FTA ("4/6"), and a
// circled team FTM/FTA. Any of those that disagree with the marks is a flag.

export const PERIODS = ["q1", "q2", "q3", "q4", "ot"] as const;
export type Period = (typeof PERIODS)[number];
export const PERIOD_LABEL: Record<Period, string> = { q1: "1st", q2: "2nd", q3: "3rd", q4: "4th", ot: "OT" };

export type Marks = Record<Period, string>;

export interface LineInput extends Marks {
  id: string;
  player_id: string | null;
  jersey: string;
  book_name: string;
  rebounds: number;
  fouls: number;
  played: boolean;
  tp_written: number | null;
  ft_written: string;
}

export interface Totals {
  points: number;
  fg2: number;
  fg3: number;
  ftm: number;
  fta: number;
}

// The book's running scores as written ({"q1":13,"half":28,"q3":34,"final":48})
// and its circled team free throws ("13/19").
export interface BookScores {
  q1?: number | null;
  half?: number | null;
  q3?: number | null;
  final?: number | null;
  ft?: string | null;
}

// "2311", "2 3 1 1", "2,3,1,1" → "2 3 1 1". Anything that isn't 0–3 drops out
// (badMarks says whether there was any).
export function normalizeMarks(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return [...raw].filter((c) => c >= "0" && c <= "3").join(" ");
}

export function badMarks(raw: string): boolean {
  return /[4-9]/.test(raw);
}

export function markTotals(marks: string): Totals {
  const t: Totals = { points: 0, fg2: 0, fg3: 0, ftm: 0, fta: 0 };
  for (const c of normalizeMarks(marks).replace(/ /g, "")) {
    if (c === "2") t.fg2++;
    else if (c === "3") t.fg3++;
    else if (c === "1") {
      t.ftm++;
      t.fta++;
    } else if (c === "0") t.fta++;
  }
  t.points = t.fg2 * 2 + t.fg3 * 3 + t.ftm;
  return t;
}

export function addTotals(a: Totals, b: Totals): Totals {
  return { points: a.points + b.points, fg2: a.fg2 + b.fg2, fg3: a.fg3 + b.fg3, ftm: a.ftm + b.ftm, fta: a.fta + b.fta };
}

export const ZERO: Totals = { points: 0, fg2: 0, fg3: 0, ftm: 0, fta: 0 };

export function lineTotals(line: Marks): Totals {
  return PERIODS.reduce((sum, p) => addTotals(sum, markTotals(line[p])), ZERO);
}

export function periodPoints(lines: Marks[], period: Period): number {
  return lines.reduce((sum, l) => sum + markTotals(l[period]).points, 0);
}

// "4/6", "4-6", "4 of 6" → { made: 4, tries: 6 }.
export function parseFt(raw: unknown): { made: number; tries: number } | null {
  if (typeof raw !== "string") return null;
  const m = raw.match(/(\d{1,2})\s*(?:\/|-|–|of)\s*(\d{1,2})/);
  if (!m) return null;
  const made = Number(m[1]);
  const tries = Number(m[2]);
  return made <= tries ? { made, tries } : null;
}

export function hasMarks(line: Marks): boolean {
  return PERIODS.some((p) => normalizeMarks(line[p]) !== "");
}

export interface Flag {
  // Where it is: a line (one player) or the whole game.
  lineId?: string;
  period?: Period;
  message: string;
}

export interface QuarterCheck {
  period: "q1" | "q2" | "q3" | "q4ot";
  label: string;
  marks: number;
  book: number | null;
}

// Each stretch the book has a running score for, marks vs book.
export function quarterChecks(lines: Marks[], book: BookScores): QuarterCheck[] {
  const q = (p: Period) => periodPoints(lines, p);
  const diff = (a: number | null | undefined, b: number | null | undefined) =>
    typeof a === "number" && typeof b === "number" ? a - b : null;
  const out: QuarterCheck[] = [
    { period: "q1", label: "1st Q", marks: q("q1"), book: typeof book.q1 === "number" ? book.q1 : null },
    { period: "q2", label: "2nd Q", marks: q("q2"), book: diff(book.half, book.q1) },
    { period: "q3", label: "3rd Q", marks: q("q3"), book: diff(book.q3, book.half) },
  ];
  const ot = q("ot");
  out.push({ period: "q4ot", label: ot ? "4th Q + OT" : "4th Q", marks: q("q4") + ot, book: diff(book.final, book.q3) });
  return out;
}

export function checkGame(lines: LineInput[], book: BookScores): Flag[] {
  const flags: Flag[] = [];
  const playing = lines.filter((l) => l.played);

  for (const c of quarterChecks(playing, book)) {
    if (c.book !== null && c.book !== c.marks) {
      const off = c.book - c.marks;
      flags.push({
        message: `${c.label}: the marks add up to ${c.marks}, the book's score says ${c.book} (${off > 0 ? `${off} short` : `${-off} over`}).`,
      });
    }
  }
  const total = playing.reduce((s, l) => s + lineTotals(l).points, 0);
  if (typeof book.final === "number" && book.final !== total) {
    flags.push({ message: `Final: the marks add up to ${total}, the book says ${book.final}.` });
  }

  const teamFt = parseFt(book.ft ?? "");
  if (teamFt) {
    const t = playing.reduce((s, l) => addTotals(s, lineTotals(l)), ZERO);
    if (t.ftm !== teamFt.made || t.fta !== teamFt.tries) {
      flags.push({ message: `Free throws: the marks give ${t.ftm}/${t.fta}, the book's team total says ${teamFt.made}/${teamFt.tries}.` });
    }
  }

  for (const l of lines) {
    const who = l.book_name || (l.jersey ? `#${l.jersey}` : "A player");
    if (l.played && !l.player_id) {
      flags.push({ lineId: l.id, message: `${who}${l.jersey ? ` (#${l.jersey})` : ""}: pick who this is — nobody on the roster wears that number.` });
    }
    for (const p of PERIODS) {
      if (badMarks(l[p])) flags.push({ lineId: l.id, period: p, message: `${who}, ${PERIOD_LABEL[p]}: only 0, 1, 2 and 3 count as marks.` });
    }
    if (!l.played) continue;
    const t = lineTotals(l);
    if (typeof l.tp_written === "number" && l.tp_written !== t.points) {
      flags.push({ lineId: l.id, message: `${who}: the marks add up to ${t.points}, the book's total says ${l.tp_written}.` });
    }
    const ft = parseFt(l.ft_written);
    if (ft && (ft.made !== t.ftm || ft.tries !== t.fta)) {
      flags.push({ lineId: l.id, message: `${who}: the marks give free throws ${t.ftm}/${t.fta}, the book says ${ft.made}/${ft.tries}.` });
    }
  }
  return flags;
}

// "14 Nov 26", "11/14/26", "2026-11-14" → "2026-11-14".
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export function parseBookDate(raw: unknown, fallbackYear: number): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = (y: string | undefined) => {
    if (!y) return fallbackYear;
    const n = Number(y);
    return n < 100 ? 2000 + n : n;
  };
  const valid = (y: number, m: number, d: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
  };
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})\s*([a-z]{3})[a-z]*\.?\s*,?\s*(\d{2,4})?$/);
  if (m && MONTHS.includes(m[2])) return valid(year(m[3]), MONTHS.indexOf(m[2]) + 1, Number(m[1]));
  m = s.match(/^([a-z]{3})[a-z]*\.?\s*(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{2,4})?$/);
  if (m && MONTHS.includes(m[1])) return valid(year(m[3]), MONTHS.indexOf(m[1]) + 1, Number(m[2]));
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
  if (m) return valid(year(m[3]), Number(m[1]), Number(m[2]));
  return null;
}

// The roster player wearing this number, or one whose first name matches the
// book's name when the number doesn't.
export function matchPlayer(
  jersey: string,
  bookName: string,
  roster: { id: string; name: string; jersey: string | null }[],
): string | null {
  const num = jersey.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (num) {
    const byNum = roster.filter((p) => (p.jersey ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "") === num);
    if (byNum.length === 1) return byNum[0].id;
  }
  const first = bookName.trim().toLowerCase().split(/\s+/)[0];
  if (first && first.length > 1) {
    const byName = roster.filter((p) => p.name.trim().toLowerCase().split(/\s+/)[0] === first);
    if (byName.length === 1) return byName[0].id;
  }
  return null;
}
