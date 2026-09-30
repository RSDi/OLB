// A spreadsheet tab as plain cells: what each cell shows (its formatted
// text, so a "1-3" Excel turned into a date reads "1-3" again), its value,
// its fill color and which columns are hidden. The parsers in this folder
// read these, so they're testable without a workbook file. Pure.

export interface GridCell {
  // What the cell shows, trimmed ("" when blank).
  text: string;
  // The raw value: a number for numbers, the string for text.
  value: string | number | boolean | null;
  // The solid fill as "RRGGBB" (upper case), or null for none/theme colors.
  fill: string | null;
}

export interface Grid {
  name: string;
  // rows[r][c], both from 0 (row 0 is the spreadsheet's row 1, column 0 is A).
  rows: GridCell[][];
  hiddenCols: number[];
}

export const EMPTY_CELL: GridCell = { text: "", value: null, fill: null };

export function cellAt(grid: Grid, r: number, c: number): GridCell {
  return grid.rows[r]?.[c] ?? EMPTY_CELL;
}

// "Des Moines   " → "Des Moines"; non-breaking spaces too.
export function clean(s: string | null | undefined): string {
  return (s ?? "").replace(/[ \s]+/g, " ").trim();
}

// ─── SheetJS → Grid ─────────────────────────────────────────────────────────
// Kept loose-typed so this file doesn't import the xlsx package (only the
// server action that reads the upload does).

interface SheetJsCell {
  t?: string;
  v?: unknown;
  w?: string;
  s?: { patternType?: string; fgColor?: { rgb?: string } };
}

interface SheetJsSheet {
  [address: string]: unknown;
  "!ref"?: string;
  "!cols"?: ({ hidden?: boolean } | undefined)[];
}

function decodeRef(ref: string): { r1: number; c1: number; r2: number; c2: number } | null {
  const m = ref.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
  if (!m) return null;
  const col = (s: string) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return {
    c1: col(m[1]),
    r1: Number(m[2]) - 1,
    c2: col(m[3] ?? m[1]),
    r2: Number(m[4] ?? m[2]) - 1,
  };
}

function address(r: number, c: number): string {
  let s = "";
  let n = c + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return `${s}${r + 1}`;
}

export function gridFromSheetJs(name: string, sheet: SheetJsSheet, maxRows = 2000, maxCols = 40): Grid {
  const range = sheet["!ref"] ? decodeRef(sheet["!ref"]) : null;
  const rows: GridCell[][] = [];
  if (range) {
    const r2 = Math.min(range.r2, maxRows - 1);
    const c2 = Math.min(range.c2, maxCols - 1);
    for (let r = 0; r <= r2; r++) {
      const row: GridCell[] = [];
      for (let c = 0; c <= c2; c++) {
        const cell = sheet[address(r, c)] as SheetJsCell | undefined;
        if (!cell) {
          row.push(EMPTY_CELL);
          continue;
        }
        const raw = cell.v;
        const value =
          typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean" ? raw : null;
        const shown = typeof cell.w === "string" ? cell.w : raw == null ? "" : String(raw);
        const rgb = cell.s?.patternType === "solid" ? cell.s.fgColor?.rgb : undefined;
        row.push({
          text: clean(shown),
          value: typeof value === "string" ? clean(value) : value,
          fill: rgb && /^[0-9A-Fa-f]{6,8}$/.test(rgb) ? rgb.slice(-6).toUpperCase() : null,
        });
      }
      rows.push(row);
    }
  }
  const hiddenCols = (sheet["!cols"] ?? [])
    .map((c, i) => (c?.hidden ? i : -1))
    .filter((i) => i >= 0);
  return { name, rows, hiddenCols };
}
