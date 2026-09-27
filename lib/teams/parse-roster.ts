import type { ParseResult, ParsedTeam, ParsedPlayer } from "./types";

// Parser for the Omaha Lightning "Teams" spreadsheet — a hand-formatted sheet
// with TWO side-by-side column blocks and team headers as section dividers.
// This is intentionally specific to that layout (going forward, players come
// from the registration form, not this sheet). It fails VISIBLY: implausible
// DOBs are flagged and the unlabeled right-column team is marked needs_name.

const COLORS = ["GREY", "GRAY", "BLACK", "RED", "BLUE", "WHITE", "GOLD"];
const HEADER_RE = /^\s*\d{1,2}U\b/;
const GRADE_RE = /\b(\d{1,2}(?:st|nd|rd|th))\b/i;
const DIVISION_RE = /\b((?:lower|mid|upper)\s+)?(bronze|silver|gold|platinum)\b/i;

// Non-player labels that appear in the name columns (legend / totals / title).
const SKIP = new Set(
  [
    "total players", "rec", "practice times", "2026/2027",
    "lower bronze", "mid bronze", "upper bronze",
    "lower silver", "mid silver", "upper silver",
    "lower gold", "mid gold", "upper gold", "platinum",
  ].map((s) => s),
);

type Block = { name: number; dob: number; age: number; practice: number };
const BLOCKS: Block[] = [
  { name: 0, dob: 1, age: 2, practice: 3 }, // left
  { name: 5, dob: 6, age: 7, practice: 8 }, // right
];

function cellStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function toISODate(v: unknown): string | null {
  let d: Date | null = null;
  if (v instanceof Date) d = v;
  else if (typeof v === "number" && Number.isFinite(v)) {
    // Excel serial date (epoch 1899-12-30), in case cellDates wasn't set.
    d = new Date(Math.round((v - 25569) * 86400 * 1000));
  }
  if (!d || isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseHeader(raw: string) {
  const age_group = (raw.match(/(\d{1,2}U)/) ?? [])[1] ?? null;
  const colorMatch = COLORS.find((c) => new RegExp(`\\b${c}\\b`, "i").test(raw));
  const color = colorMatch ? (colorMatch === "GRAY" ? "GREY" : colorMatch) : null;
  const grade_label = (raw.match(GRADE_RE) ?? [])[1] ?? null;
  // Remove the color token (first occurrence only) before matching the division
  // tier, so e.g. a "GOLD" team in the "Lower Silver" division isn't misread as Gold.
  const forDiv = colorMatch ? raw.replace(new RegExp(`\\b${colorMatch}\\b`, "i"), " ") : raw;
  const divMatch = forDiv.match(DIVISION_RE);
  const division = divMatch
    ? `${divMatch[1] ? divMatch[1].trim() + " " : ""}${divMatch[2]}`
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim()
    : null;

  // Coaches: text inside (...) — tolerate a missing closing paren.
  let coaches: string[] = [];
  const open = raw.indexOf("(");
  if (open !== -1) {
    const close = raw.indexOf(")", open);
    const inner = raw.slice(open + 1, close === -1 ? undefined : close);
    coaches = inner
      .split(/[/,&]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const name = [age_group, color].filter(Boolean).join(" ") || raw.trim();
  return { name, age_group, color, grade_label, division, coaches };
}

function newTeam(partial: Partial<ParsedTeam>, raw_header: string, needs_name: boolean): ParsedTeam {
  return {
    name: partial.name ?? "(unnamed team)",
    age_group: partial.age_group ?? null,
    color: partial.color ?? null,
    grade_label: partial.grade_label ?? null,
    division: partial.division ?? null,
    practice_times: [],
    coaches: partial.coaches ?? [],
    players: [],
    raw_header,
    needs_name,
  };
}

function parsePlayer(raw: string, dobCell: unknown, ageCell: unknown, team: ParsedTeam, referenceYear: number): ParsedPlayer {
  // A trailing "(Sr.)" / "(Jr.)" etc. is a grade marker embedded in the name.
  let full_name = raw;
  let grade: string | null = team.grade_label;
  const m = raw.match(/\s*\(([^)]+)\)\s*$/);
  if (m) {
    grade = m[1].trim();
    full_name = raw.slice(0, m.index).trim();
  }
  full_name = full_name.replace(/\s+/g, " ").trim();

  const dob = toISODate(dobCell);
  const sheet_age = typeof ageCell === "number" && Number.isFinite(ageCell) ? ageCell : null;

  // Flag implausible DOBs (e.g. a "12U" player born 2024). Deterministic — uses
  // the season reference year, not the wall clock.
  let flag: string | null = null;
  if (dob) {
    const dobYear = Number(dob.slice(0, 4));
    if (sheet_age != null) {
      const expected = referenceYear - sheet_age;
      if (Math.abs(dobYear - expected) > 2) flag = "dob_check";
    }
    if (dobYear > referenceYear - 3 || dobYear < referenceYear - 25) flag = "dob_check";
  }

  return { full_name, dob, grade, sheet_age, flag };
}

export function parseRoster(rows: unknown[][], opts?: { referenceYear?: number }): ParseResult {
  const referenceYear = opts?.referenceYear ?? 2026;
  const teams: ParsedTeam[] = [];

  for (const block of BLOCKS) {
    let current: ParsedTeam | null = null;

    for (const row of rows) {
      if (!row) continue;
      const nameRaw = cellStr(row[block.name]);

      if (nameRaw && HEADER_RE.test(nameRaw)) {
        if (current) teams.push(current);
        const h = parseHeader(nameRaw);
        current = newTeam(h, nameRaw, false);
      } else if (nameRaw && !SKIP.has(nameRaw.toLowerCase()) && !/^\d+$/.test(nameRaw)) {
        // Player row. The right block starts players with no header → unnamed team.
        if (!current) current = newTeam({}, "", true);
        current.players.push(parsePlayer(nameRaw, row[block.dob], row[block.age], current, referenceYear));
      }

      // Practice times sit in their own column, on header or player rows.
      const practice = cellStr(row[block.practice]);
      if (current && practice && practice.toLowerCase() !== "practice times" && !current.practice_times.includes(practice)) {
        current.practice_times.push(practice);
      }
    }
    if (current) teams.push(current);
  }

  // Drop a spurious empty unnamed team (e.g. if a block had nothing).
  const cleaned = teams.filter((t) => t.players.length > 0 || !t.needs_name);

  const totalPlayers = cleaned.reduce((n, t) => n + t.players.length, 0);
  const flags: string[] = [];
  const unnamed = cleaned.filter((t) => t.needs_name).length;
  if (unnamed) flags.push(`${unnamed} team(s) have no name in the sheet — please name them before importing.`);
  const flagged = cleaned.reduce((n, t) => n + t.players.filter((p) => p.flag).length, 0);
  if (flagged) flags.push(`${flagged} player(s) have a questionable date of birth — review highlighted rows.`);

  return { teams: cleaned, totalPlayers, flags };
}
